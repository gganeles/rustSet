# Rust WebSocket Server

## Local Development with Virtual Environment (Recommended)

The easiest way to set up Python dependencies locally:

```bash
cd server

# For fish shell users:
./setup_python.fish

# For bash/zsh users:
./setup_python.sh

# Then activate the venv and run
source venv/bin/activate.fish  # or venv/bin/activate for bash
cargo test
cargo run
```

## Manual Local Setup

If you prefer to set up manually:

```bash
cd server

# Create and activate venv
python3 -m venv venv
source venv/bin/activate.fish  # or venv/bin/activate for bash

# Install dependencies
pip install spacy
python -m spacy download en_core_web_sm

# Run the server
cargo test  # Run tests
cargo run   # Run server
```

**Important**: PyO3 will automatically use the activated virtual environment when you run `cargo` commands from within an activated venv.

## Docker (Best for Portability)

Run the server in a Docker container (no local Python setup needed):

```bash
# From the repository root
docker-compose up --build

# Or manually build and run
cd server
docker build -t rust-ws-server .
docker run -p 3030:3030 rust-ws-server
```

Server listens on `127.0.0.1:3030` and exposes a WebSocket endpoint at `/ws`.
