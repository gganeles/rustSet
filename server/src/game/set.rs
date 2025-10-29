use crate::{game::GameState, user::User};
use std::sync::Arc;

use super::Uuid;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::router::Message;

use tokio::sync::broadcast;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Card {
    pub array: [u8; 4],
}

#[derive(Clone, Debug, Serialize)]
pub struct Set {
    pub game_state: super::GameState,
    pub deck: Vec<Card>,  // Placeholder for actual card representation
    pub board: Vec<Card>, // Cards currently on the board
    pub previous_set: Option<Vec<Card>>, // Last found set
}

#[derive(Serialize)]
struct SetFoundData {
    game_state: GameState,
    deck: Vec<Card>,
    board: Vec<Card>,
    previous_set: Option<Vec<Card>>,
    finder_name: Option<String>,
    chat: Vec<super::ChatMessage>,
}

#[derive(Serialize)]
struct GameStateData {
    game_state: GameState,
    deck: Vec<Card>,
    board: Vec<Card>,
    previous_set: Option<Vec<Card>>,
    chat: Vec<super::ChatMessage>,
}

fn deal_cards() -> (Vec<Card>, Vec<Card>) {
    // Placeholder for dealing cards logic
    let mut cards = Vec::with_capacity(81);
    for i in 0..3 {
        for j in 0..3 {
            for k in 0..3 {
                for l in 0..3 {
                    cards.push(Card {
                        array: [i, j, k, l],
                    });
                }
            }
        }
    }
    cards.shuffle(&mut rand::rng());
    (cards.split_off(12), cards)
}

fn check_attribute(cards: &[u8; 3]) -> bool {
    let sum: u8 = cards.iter().sum();
    sum % 3 == 0
}

fn check_set(cards: &[Card; 3]) -> bool {
    for field in 0..4 {
        let attrs = [
            cards[0].array[field],
            cards[1].array[field],
            cards[2].array[field],
        ];
        if !check_attribute(&attrs) {
            return false;
        }
    }
    return true;
}

fn is_set_out(board: &Vec<Card>) -> bool {
    for i in 0..(board.len() - 2) {
        for j in (i + 1)..(board.len() - 1) {
            for k in (j + 1)..board.len() {
                let cards = [board[i].clone(), board[j].clone(), board[k].clone()];
                if check_set(&cards) {
                    return true;
                }
            }
        }
    }
    false
}

impl Set {
    pub fn new(name: String, creator: User) -> Self {
        let (mut deck, mut board) = deal_cards();
        while !is_set_out(&board) {
            board.extend(deck.drain(0..3));
        }
        Self {
            game_state: super::GameState {
                id: Uuid::new_v4(),
                name,
                broadcast_tx: Arc::new(tokio::sync::broadcast::channel(64).0),
                players: vec![super::player::Player::from_user(&creator)],
                current_state: String::from("in_progress"),
                chat: Vec::new(),
            },
            deck,
            board,
            previous_set: None,
        }
    }

    fn remove_cards(&mut self, indicies: [u8; 3]) {
        let mut sorted = indicies;
        sorted.sort_unstable_by(|a, b| b.cmp(a)); // Sort in descending order
        for &i in &sorted {
            self.board.remove(i as usize);
        }
    }

    fn set_found(
        &mut self,
        set_card_indicies: [u8; 3],
        set_cards: &[Card; 3],
        player_id: Option<Uuid>,
    ) {
        // Logic to handle a found set
        self.previous_set = Some(set_cards.to_vec());

        // Get the player's name who found the set
        let player_name = if let Some(pid) = player_id {
            if let Some(player) = self.game_state.players.iter_mut().find(|p| p.id == pid) {
                player.score += 1;
                Some(player.name.clone())
            } else {
                None
            }
        } else {
            None
        };

        if !self.deck.is_empty() {
            if self.board.len() > 12 {
                self.remove_cards(set_card_indicies);
            } else {
                for &i in &set_card_indicies {
                    self.board[i as usize] = self.deck.pop().unwrap();
                }
            }
            while !is_set_out(&self.board) {
                self.board.extend(self.deck.drain(0..3));
            }
        } else {
            self.remove_cards(set_card_indicies);
            if !is_set_out(&self.board) {
                self.game_state.current_state = "game_over".into();
            }
        }

        // Add system message to chat history with the cards
        let chat_message_text = if let Some(ref name) = player_name {
            format!("{} found a Set!", name)
        } else {
            "Someone found a Set!".to_string()
        };

        self.game_state.chat.push(super::ChatMessage {
            sender: "System".to_string(),
            text: chat_message_text,
            cards: Some(self.previous_set.clone().unwrap_or_default()),
            message_type: Some("success".to_string()),
        });

        let set_found_data = SetFoundData {
            game_state: self.game_state.clone(),
            deck: self.deck.clone(),
            board: self.board.clone(),
            previous_set: self.previous_set.clone(),
            finder_name: player_name,
            chat: self.game_state.chat.clone(),
        };

        let msg = Message {
            kind: "set_found".into(),
            data: serde_json::to_string(&set_found_data).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = self.game_state.broadcast_tx.send(json);
    }

    pub fn set_attempted(&mut self, found_set: [u8; 3], player_id: Option<Uuid>) {
        // Logic to handle a found set
        let set_cards = &found_set.map(|i| self.board[i as usize].clone());
        if check_set(set_cards) {
            self.set_found(found_set, set_cards, player_id);
        } else {
            return;
        }
    }
}

impl super::Game for Set {
    fn send_state_to_client(&self, broadcast_tx: &broadcast::Sender<String>, kind: String) {
        let state_data = GameStateData {
            game_state: self.game_state.clone(),
            deck: self.deck.clone(),
            board: self.board.clone(),
            previous_set: self.previous_set.clone(),
            chat: self.game_state.chat.clone(),
        };

        let msg = Message {
            kind,
            data: serde_json::to_string(&state_data).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = broadcast_tx.send(json);
    }

    fn copy_details(&self) -> GameState {
        self.game_state.clone()
    }

    fn get_details(&self) -> &GameState {
        &self.game_state
    }

    fn handle_game_socket_message(&mut self, txt: String) {
        let json_in = serde_json::from_str::<serde_json::Value>(&txt);
        if let Ok(parsed) = json_in {
            let kind = parsed
                .get("kind")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            match kind {
                "chat" => {
                    let data = parsed
                        .get("data")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();

                    // Parse the chat data to get sender and message
                    if let Ok(chat_json) = serde_json::from_str::<serde_json::Value>(data) {
                        let sender = chat_json
                            .get("sender")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string();
                        let message = chat_json
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        // Add to chat history (regular messages don't have cards)
                        self.game_state.chat.push(super::ChatMessage {
                            sender: sender.clone(),
                            text: message.clone(),
                            cards: None,
                            message_type: None,
                        });
                    }

                    let msg = Message {
                        kind: "chat".into(),
                        data: data.to_string(),
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = self.game_state.broadcast_tx.send(json);
                }
                "set_attempt" => {
                    let data = parsed.get("data");
                    let player_id = parsed
                        .get("player_id")
                        .and_then(|v| v.as_str())
                        .and_then(|s| Uuid::parse_str(s).ok());

                    if let Some(data) = data {
                        let found_set = data;
                        self.set_attempted(
                            found_set
                                .as_array()
                                .unwrap()
                                .iter()
                                .map(|v| v.as_u64().unwrap() as u8)
                                .collect::<Vec<u8>>()
                                .try_into()
                                .unwrap(),
                            player_id,
                        );
                    }
                }
                "join_player" => {
                    let data = parsed
                        .get("data")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default();

                    // Parse the player data
                    if let Ok(player_json) = serde_json::from_str::<serde_json::Value>(data) {
                        let player_name = player_json
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Anonymous")
                            .to_string();

                        // Check if player already exists
                        let player_exists = self
                            .game_state
                            .players
                            .iter()
                            .any(|p| p.name == player_name);

                        if !player_exists {
                            // Add new player
                            let new_player =
                                super::player::Player::new(player_name.clone(), Uuid::new_v4());
                            self.game_state.players.push(new_player);

                            // Broadcast updated game state to all clients
                            self.send_state_to_client(
                                &self.game_state.broadcast_tx.clone(),
                                "player_joined".into(),
                            );
                        }
                    }
                }
                _ => {
                    let msg = Message {
                        kind: "error".into(),
                        data: "Unknown message kind".into(),
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = self.game_state.broadcast_tx.send(json);
                }
            }
            // Placeholder logic
        }
    }
}
