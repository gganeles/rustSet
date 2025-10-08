mod game;
mod router;
mod user;

#[tokio::main]
async fn main() {
    pretty_env_logger::init();

    let routes = router::setup_routes();

    println!("Listening on 0.0.0.0:3030");
    warp::serve(routes).run(([0, 0, 0, 0], 3030)).await;
}
