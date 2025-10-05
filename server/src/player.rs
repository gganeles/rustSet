use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use uuid::Uuid;


#[derive(Clone, Debug)]
pub struct Player {
    pub name: String,
    // atomic flag that indicates whether this player is currently connected
    connected: Arc<AtomicBool>,
}

impl Player {
    pub fn new(name: String) -> Self {
        Player {
            name,
            connected: Arc::new(AtomicBool::new(true)),
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
