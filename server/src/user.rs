use uuid::Uuid;

pub struct User {
    pub id: Uuid,
    pub name: String,
    pub room_id: Uuid,
}

impl User {
    pub fn new(name: String) -> Self {
        User {
            id: Uuid::new_v4(),
            name,
            room_id: Uuid::nil(), // default to no room
        }
    }

    pub fn join_room(&mut self, room_id: Uuid) {
        self.room_id = room_id;
    }
}
