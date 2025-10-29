#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Activate venv
source venv/bin/activate

# Run the server
exec ./target/release/server