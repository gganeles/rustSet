
# syntax=docker/dockerfile:1
# Multi-stage build for a Rust + warp WebSocket server with Python/spaCy

########################
# 1) Build stage
########################
FROM rust:bullseye as builder
WORKDIR /app

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install spaCy and download the English model
RUN pip3 install --no-cache-dir spacy && \
    python3 -m spacy download en_core_web_sm

# Build your code
COPY . .
RUN cargo build --release

########################
# 2) Runtime stage
########################
FROM debian:bullseye-slim
WORKDIR /app

# Install Python runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install spaCy and download the English model in runtime image
RUN pip3 install --no-cache-dir spacy && \
    python3 -m spacy download en_core_web_sm

# Copy the compiled binary from builder
COPY --from=builder /app/target/release/rust_ws_server /app/rust_ws_server

EXPOSE 3030
USER 65532:65532
CMD ["/app/rust_ws_server"]

