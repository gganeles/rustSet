use uuid::Uuid;

use crate::player;
use std::sync::Arc;
use tokio;

pub struct GameList {
    pub games: Vec<Box<dyn Game + Send + Sync>>,
}

impl GameList {
    pub fn new() -> Self {
        GameList { games: Vec::new() }
    }

    pub fn add_game(&mut self, game: Box<dyn Game + Send + Sync>) {
        self.games.push(game);
    }

    pub fn list_games(&self) -> Vec<String> {
        self.games.iter().map(|g| g.get_details()).collect()
    }

    pub fn remove_game(&mut self, index: usize) {
        if index < self.games.len() {
            self.games.remove(index);
        }
    }
}

// Make the Game trait public and require Send + Sync so trait objects
// can be safely sent across threads (needed by tokio::spawn / warp).
pub trait Game: Send + Sync {
    fn start(&self);
    fn end(&self);
    fn get_details(&self) -> String;
    fn mount_game_tx(&self, tx: Arc<tokio::sync::broadcast::Sender<String>>);
}

pub struct GameState {
    players: Vec<player::Player>,
    id: Uuid,
    broadcast_tx: Arc<tokio::sync::broadcast::Sender<String>>,
    name: String,
    current_state: String, // Placeholder for actual game state
}

mod set {
    use std::sync::Arc;
    use super::Uuid;
    use rand::seq::SliceRandom;

    pub struct Card {
        color: u8,
        shape: u8,
        number: u8,
        shading: u8,
    }

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
                            color: i,
                            shape: j,
                            number: k,
                            shading: l,
                        });
                    }
                }
            }
        }
        cards.shuffle(&mut rand::rng());
        (cards.split_off(12), cards)
    }

    impl Set {
        pub fn new(name: String, creator: String) -> Self {
            let (board, deck) = deal_cards();
            Self {
                game_state: super::GameState {
                    id: Uuid::new_v4(),
                    name,
                    broadcast_tx: Arc::new(tokio::sync::broadcast::channel(64).0),
                    players: vec![super::player::Player::new(creator)],
                    current_state: String::new(),
                },
                deck,
                board,
                previous_set: None,
            }
        }
    }

}
