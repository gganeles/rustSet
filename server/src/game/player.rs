use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use uuid::Uuid;

use crate::user;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Player {
    pub name: String,
    pub score: u32,
    pub id: Uuid,
    // atomic flag that indicates whether this player is currently connected
    #[serde(skip)] // don't attempt to (de)serialize this non-serializable shared state
    pub connected: Arc<AtomicBool>,
}

impl Player {
    pub fn new(name: String, id: Uuid) -> Self {
        Player {
            name,
            id,
            score: 0,
            connected: AtomicBool::new(true).into(),
        }
    }

    pub fn from_user(user: &user::User) -> Self {
        Player {
            name: user.name.clone(),
            id: user.id,
            score: 0,
            connected: AtomicBool::new(true).into(),
        }
    }

    /// Set connected state (call false when the websocket disconnects)
    pub fn set_connected(&self, val: bool) {
        self.connected.store(val, Ordering::SeqCst);
    }

    /// Read connected state
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    /// If you need a cloneable handle to the flag
    pub fn connected_handle(&self) -> Arc<AtomicBool> {
        self.connected.clone()
    }
}
