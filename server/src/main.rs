mod router;
mod game;
mod player;
mod user;

#[tokio::main]
async fn main() {
    pretty_env_logger::init();

    let routes = router::setup_routes();

    println!("Listening on 127.0.0.1:3030");
    warp::serve(routes).run(([127, 0, 0, 1], 3030)).await;
}