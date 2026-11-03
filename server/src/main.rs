mod game;
mod router;
mod user;

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    pretty_env_logger::init();

    // Load spaCy now so a broken Python setup shows up at startup, not mid-game
    if game::anagrams::init_lemmatizer() {
        println!("spaCy lemmatizer loaded");
    } else {
        eprintln!("spaCy lemmatizer unavailable; Anagrams will allow steals that only change a word's form (cat -> cats)");
    }

    let routes = router::setup_routes();

    let addr: SocketAddr = std::env::var("RUSTSET_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:3030".to_string())
        .parse()
        .expect("RUSTSET_ADDR must be an address like 127.0.0.1:3030");
    println!("Listening on {addr}");
    warp::serve(routes).run(addr).await;
}
