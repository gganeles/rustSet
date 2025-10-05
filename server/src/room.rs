use user;
use uuid::Uuid;
use tokio::sync::broadcast;

mod room {
    pub struct Room {
        id: Uuid,
        tx: tokio::sync::broadcast::Sender<String>,
    }

    impl Room {
        pub fn new() -> Self {
            let (tx, _) = broadcast::channel(64);
            Room { id: Uuid::new_v4(), tx }
        }

        pub fn attach_user(&self, user_id: Uuid) {
            
        }
    }


}