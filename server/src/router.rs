use crate::game;
use game::{set, Game, GameList};

use crate::user::User;
use futures::{future, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast::{self, Sender};
use tokio::sync::RwLock;
use uuid::Uuid;
use warp::Filter;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub kind: String,
    pub data: String,
}

pub fn setup_routes() -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    // create shared games list wrapped in Arc so filters/handlers can share it
    let games = Arc::new(RwLock::new(game::GameList::new()));

    // broadcast channel for lobby server -> clients
    let (tx, _) = broadcast::channel::<String>(64);
    let tx = Arc::new(tx);

    // WebSocket route
    // clone a handle specifically for the warp filter so we can still use `tx` later
    let tx_filter = { warp::any().map(move || tx.clone()) };

    // create two filters for games (one for lobby, one for game ws)
    let games_for_lobby = games.clone();
    let games_filter_for_lobby = warp::any().map(move || games_for_lobby.clone());
    let games_filter = warp::any().map(move || games.clone());

    let lobby_route = warp::path("lobby")
        .and(warp::ws())
        .and(tx_filter.clone())
        .and(games_filter_for_lobby)
        .and_then(handle_lobby_ws);

    let game_route = warp::path!("game" / "ws" / String)
        .and(warp::ws())
        .and(games_filter)
        .and_then(handle_game_ws);

    lobby_route.or(game_route)
}

async fn handle_lobby_ws(
    ws: warp::ws::Ws,
    tx: Arc<Sender<String>>,
    games: Arc<RwLock<GameList>>,
) -> Result<impl warp::Reply, Infallible> {
    Ok(ws.on_upgrade(move |socket| client_lobby_connection(socket, tx, games)))
}

async fn handle_game_ws(
    room_id: String,
    ws: warp::ws::Ws,
    games: Arc<RwLock<GameList>>,
) -> Result<Box<dyn warp::Reply>, Infallible> {
    // validate before upgrade so we can return a 404 instead of upgrading then returning nothing
    let guard = games.read().await;
    // GameList doesn't expose `is_empty()`; check via iterator
    if guard.iter().next().is_none() {
        return Ok(Box::new(warp::reply::with_status(
            "No games available",
            warp::http::StatusCode::NOT_FOUND,
        )));
    }
    let room_id = Uuid::parse_str(room_id.trim()).unwrap();
    let exists = guard.iter().any(|g| g.get_details().id == room_id);
    if !exists {
        return Ok(Box::new(warp::reply::with_status(
            "Game not found",
            warp::http::StatusCode::NOT_FOUND,
        )));
    }

    // on successful validation accept upgrade and run the connection handler;
    // wrap handler in an async block so we can log any internal errors.
    let games_clone = games.clone();
    let room = room_id.clone();
    Ok(Box::new(ws.on_upgrade(move |socket| async move {
        client_game_connection(room, socket, games_clone).await;
    })))
}

async fn client_game_connection(
    room_id: Uuid,
    ws: warp::ws::WebSocket,
    games: Arc<RwLock<GameList>>,
) {
    // we validated existence during handshake; additional per-game wiring could go here
    // Find the game and get its broadcast sender

    let game_opt = {
        let guard = games.read().await;
        guard
            .games
            .iter()
            .map(|g| g.get_details())
            .find(|g| g.id == room_id)
            .map(|g| g.broadcast_tx.clone())
    };

    let (mut ws_tx, mut ws_rx) = ws.split();

    if let Some(game_tx) = game_opt {
        // subscribe to the game's broadcast channel
        let rx = game_tx.subscribe();
        // spawn a task that forwards game broadcast messages to this websocket
        let mut send_rx = rx;
        let mut ws_tx_owned = ws_tx;
        let send_handle = tokio::spawn(async move {
            while let Ok(msg) = send_rx.recv().await {
                if ws_tx_owned
                    .send(warp::ws::Message::text(msg))
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });
        // emit game state to client immediately on connection
        {
            let guard = games.read().await;
            if let Some(game) = guard.games.iter().find(|g| g.copy_details().id == room_id) {
                game.send_state_to_client(&game_tx, "init".into());
            }
        }

        // read messages from websocket and forward them into the game's broadcast channel
        while let Some(Ok(message)) = ws_rx.next().await {
            if message.is_text() {
                let txt = message.to_str().unwrap_or_default().to_string();
                let mut guard = games.write().await;
                if let Some(game_mut) = guard
                    .games
                    .iter_mut()
                    .find(|g| g.copy_details().id == room_id)
                {
                    game_mut.handle_game_socket_message(txt);
                }
            }
        }

        // if loop ended, abort the sender task (it owns ws_tx)
        send_handle.abort();
    } else {
        // fallback: just echo messages back
        while let Some(Ok(message)) = ws_rx.next().await {
            if message.is_text() {
                let txt = message.to_str().unwrap_or_default().to_string();
                let msg = Message {
                    kind: "game_message_backup".into(),
                    data: txt.clone(),
                };
                let json = serde_json::to_string(&msg).unwrap();
                if ws_tx.send(warp::ws::Message::text(txt)).await.is_err() {
                    break;
                }
            }
        }
    }
}

async fn client_lobby_connection(
    ws: warp::ws::WebSocket,
    tx: Arc<Sender<String>>,
    games: Arc<RwLock<GameList>>,
) {
    let (mut ws_tx, mut ws_rx) = ws.split();

    // Subscribe to broadcast channel
    let mut rx = tx.subscribe();

    // Task to forward broadcast messages to this client
    let send_handle = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            // forward whatever is on the broadcast channel to the websocket
            if ws_tx.send(warp::ws::Message::text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Task to receive messages from client and broadcast them
    let tx2 = tx.clone();
    let games2 = games.clone();
    let recv_handle = tokio::spawn(async move {
        let games = games2;
        while let Some(Ok(message)) = ws_rx.next().await {
            if message.is_text() {
                let txt = message.to_str().unwrap_or_default().to_string();
                // try to parse as structured Message
                if let Ok(parsed) = serde_json::from_str::<Message>(&txt) {
                    match parsed.kind.as_str() {
                        "create_game" => {
                            // data should be a JSON object with name and creator
                            #[derive(serde::Deserialize)]
                            struct CreatePayload {
                                name: String,
                                creator: String,
                                game_type: String,
                            }

                            if let Ok(payload) = serde_json::from_str::<CreatePayload>(&parsed.data)
                            {
                                // create game and add to list (write lock)
                                let creator = User::new(payload.creator);

                                let new_game: Box<dyn Game>;
                                match &payload.game_type[..] {
                                    "anagrams" => {
                                        new_game = Box::new(game::anagrams::Anagrams::new(
                                            payload.name,
                                            creator,
                                        ))
                                    }
                                    _ => {
                                        new_game =
                                            Box::new(game::set::Set::new(payload.name, creator))
                                    }
                                }
                                {
                                    let mut guard = games.write().await;
                                    guard.add_game(new_game);
                                }
                                // broadcast updated game list (read lock)
                                let guard = games.read().await;
                                let list = guard.list_games();
                                let msg = Message {
                                    kind: "games_list".into(),
                                    data: serde_json::to_string(&list).unwrap_or_default(),
                                };
                                let json = serde_json::to_string(&msg).unwrap();
                                let _ = tx2.send(json);
                            }
                        }
                        "list_games" => {
                            let list = {
                                let guard = games.read().await;
                                guard.list_games()
                            };
                            let msg = Message {
                                kind: "games_list".into(),
                                data: serde_json::to_string(&list).unwrap_or_default(),
                            };
                            let json = serde_json::to_string(&msg).unwrap();
                            let _ = tx2.send(json);
                        }
                        "delete_game" => {
                            // data should be a JSON object with game id
                            #[derive(serde::Deserialize)]
                            struct DeletePayload {
                                id: String,
                            }

                            if let Ok(payload) = serde_json::from_str::<DeletePayload>(&parsed.data)
                            {
                                if let Ok(game_id) = Uuid::parse_str(&payload.id) {
                                    // Find and remove the game
                                    {
                                        let mut guard = games.write().await;
                                        if let Some(pos) = guard
                                            .games
                                            .iter()
                                            .position(|g| g.get_details().id == game_id)
                                        {
                                            guard.remove_game(pos);
                                        }
                                    }
                                    // Broadcast updated game list
                                    let guard = games.read().await;
                                    let list = guard.list_games();
                                    let msg = Message {
                                        kind: "games_list".into(),
                                        data: serde_json::to_string(&list).unwrap_or_default(),
                                    };
                                    let json = serde_json::to_string(&msg).unwrap();
                                    let _ = tx2.send(json);
                                }
                            }
                        }
                        "join_game" | "leave_game" => {
                            // For now, broadcast a notification. Game-level state updates are not implemented.
                            let kind = if parsed.kind == "join_game" {
                                "player_joined"
                            } else {
                                "player_left"
                            };
                            let msg = Message {
                                kind: kind.into(),
                                data: parsed.data,
                            };
                            let json = serde_json::to_string(&msg).unwrap();
                            let _ = tx2.send(json);
                        }
                        _ => {
                            // default: broadcast as chat/message
                            let msg = Message {
                                kind: "message".into(),
                                data: txt,
                            };
                            let json = serde_json::to_string(&msg).unwrap();
                            let _ = tx2.send(json);
                        }
                    }
                } else {
                    // Not a structured Message - broadcast raw text as message
                    let msg = Message {
                        kind: "message".into(),
                        data: txt,
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = tx2.send(json);
                }
            }
        }
    });

    // wait for either task to finish by selecting on the join handles
    match future::select(send_handle, recv_handle).await {
        future::Either::Left((_, recv)) => {
            // send finished first; abort receiver
            recv.abort();
        }
        future::Either::Right((_, send)) => {
            // recv finished first; abort sender
            send.abort();
        }
    }
}
