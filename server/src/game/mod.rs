use serde::Serialize;
use std::sync::Arc;
use tokio::{self, sync::broadcast};
use uuid::Uuid;

pub mod anagrams;
pub mod player;
pub mod set;

#[derive(Clone, Serialize, Debug)]
pub struct ChatMessage {
    pub sender: String,
    pub text: String,
    pub cards: Option<Vec<set::Card>>,
}

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
        self.games.iter().map(|g| g.copy_details()).collect()
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
    fn send_state_to_client(
        &self,
        broadcast_tx: &tokio::sync::broadcast::Sender<String>,
        kind: String,
    );
    fn copy_details(&self) -> GameState;
    fn get_details(&self) -> &GameState;
    fn handle_game_socket_message(&mut self, txt: String);
}

#[derive(Clone, Serialize, Debug)]
pub struct GameState {
    pub players: Vec<player::Player>,
    pub id: Uuid,
    pub name: String,
    pub current_state: String, // Placeholder for actual game state
    #[serde(skip)] // don't attempt to (de)serialize this non-serializable shared state
    pub broadcast_tx: Arc<tokio::sync::broadcast::Sender<String>>,
    pub chat: Vec<ChatMessage>,
}
