use serde::Serialize;
use std::sync::Arc;
use tokio;
use uuid::Uuid;

pub mod player;
pub mod set;

#[derive(Default)]
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

    pub fn list_games(&self) -> Vec<GameState> {
        self.games.iter().map(|g| g.get_details()).collect()
    }

    pub fn remove_game(&mut self, index: usize) {
        if index < self.games.len() {
            self.games.remove(index);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.games.is_empty()
    }

    pub fn iter(&self) -> std::slice::Iter<'_, Box<dyn Game + Send + Sync>> {
        self.games.iter()
    }
}

// Make the Game trait public and require Send + Sync so trait objects
// can be safely sent across threads (needed by tokio::spawn / warp).
pub trait Game: Send + Sync {
    fn start(&self);
    fn end(&self);
    fn get_details(&self) -> GameState;
}

#[derive(Clone, Serialize, Debug)]
pub struct GameState {
    pub players: Vec<player::Player>,
    pub id: Uuid,
    pub name: String,
    pub current_state: String, // Placeholder for actual game state
    #[serde(skip)] // don't attempt to (de)serialize this non-serializable shared state
    pub broadcast_tx: Arc<tokio::sync::broadcast::Sender<String>>,
}
