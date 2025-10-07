use crate::{game::GameState, user::User};
use std::sync::Arc;

use super::Uuid;
use rand::{rand_core::le, seq::SliceRandom};
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

fn check_attribute(cards: &[u8; 3], field: usize) -> bool {
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
        if !check_attribute(&attrs, field) {
            return false;
        }
    }
    return true;
}

impl Set {
    pub fn new(name: String, creator: User) -> Self {
        let (deck, board) = deal_cards();
        println!("Dealt board: {:?}, deck size: {}", board, deck.len());
        Self {
            game_state: super::GameState {
                id: Uuid::new_v4(),
                name,
                broadcast_tx: Arc::new(tokio::sync::broadcast::channel(64).0),
                players: vec![super::player::Player::from_user(&creator)],
                current_state: String::from("in_progress"),
            },
            deck,
            board,
            previous_set: None,
        }
    }

    fn is_set_out(&self) -> bool {
        for i in 0..(self.board.len() - 2) {
            for j in (i + 1)..(self.board.len() - 1) {
                for k in (j + 1)..self.board.len() {
                    let cards = [
                        self.board[i].clone(),
                        self.board[j].clone(),
                        self.board[k].clone(),
                    ];
                    if check_set(&cards) {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn set_found(&mut self, set_card_indicies: [u8; 3], set_cards: &[Card; 3]) {
        // Logic to handle a found set
        self.previous_set = Some(set_cards.to_vec());
        for &i in &set_card_indicies {
            self.board[i as usize] = self.deck.pop().unwrap();
        }
        while !self.is_set_out() && self.deck.len() > 0 {
            self.board.extend(self.deck.drain(0..3));
        }
        if !self.is_set_out() {
            self.game_state.current_state = "game_over".into();
        }
        let msg = Message {
            kind: "set_found".into(),
            data: serde_json::to_string(&self).unwrap(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let _ = self.game_state.broadcast_tx.send(json);
    }

    pub fn set_attempted(&mut self, found_set: [u8; 3]) {
        // Logic to handle a found set
        let set_cards = &found_set.map(|i| self.board[i as usize].clone());
        if check_set(set_cards) {
            self.set_found(found_set, set_cards);
        } else {
            return;
        }
    }
}

impl super::Game for Set {
    fn send_state_to_client(&self, broadcast_tx: &broadcast::Sender<String>, kind: String) {
        let msg = Message {
            kind,
            data: serde_json::to_string(&self).unwrap(),
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
        println!("Parsed JSON: {:?}", json_in);
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
                    let msg = Message {
                        kind: "chat".into(),
                        data: data.to_string(),
                    };
                    let json = serde_json::to_string(&msg).unwrap();
                    let _ = self.game_state.broadcast_tx.send(json);
                }
                "set_attempt" => {
                    let data = parsed.get("data");
                    if let Some(data) = data {
                        let found_set = data;
                        println!("Found set data: {:?}", found_set);
                        self.set_attempted(
                            found_set
                                .as_array()
                                .unwrap()
                                .iter()
                                .map(|v| v.as_u64().unwrap() as u8)
                                .collect::<Vec<u8>>()
                                .try_into()
                                .unwrap(),
                        );
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
            println!("Received message: {:?}", txt);
            // Placeholder logic
        }
    }
}
