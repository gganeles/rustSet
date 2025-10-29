#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Activate venv
source venv/bin/activate

cargo build --release
# Run the server
./target/release/rust_ws_server