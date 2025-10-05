use uuid::Uuid;


pub struct User {
    id: Uuid,
    name: String,
    room_id: Uuid,
}
