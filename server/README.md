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

## Linux Server Without Docker

`linux/install.sh` installs the server natively on Debian, Ubuntu, Oracle Linux, RHEL, Rocky, Alma
or Fedora, on x86-64 or ARM (such as Oracle Cloud's Ampere machines), and runs it as the
`rustset` systemd service:

```bash
git clone https://github.com/gganeles/rustSet && cd rustSet
sudo sh linux/install.sh
```

It installs Python (3.12 on dnf systems) with spaCy in `/usr/local/lib/rustset/venv`, a Rust
toolchain if root has none, and the server binary as `/usr/local/bin/rustset-server`. To update,
`git pull` and run it again. Logs: `journalctl -u rustset -f`. Settings: `/etc/rustset/env`.

## Configuration

- `RUSTSET_ADDR`: listen address, default `127.0.0.1:3030` (the Docker image uses `0.0.0.0:3030`).
- `VIRTUAL_ENV`: the venv to load spaCy from, default `./venv`. Activating a venv sets it. The
  venv must use the same Python version the server was built against; build with
  `PYO3_PYTHON=python3.12 cargo build` to pick one.

The server checks spaCy at startup and logs whether the lemmatizer loaded. Without it, Anagrams
still runs but allows steals that only change a word's form (cat → cats).

Server listens on `127.0.0.1:3030` and exposes a WebSocket endpoint at `/ws`.
