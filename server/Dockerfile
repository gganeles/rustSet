
# syntax=docker/dockerfile:1
# Multi-stage build for a Rust + warp WebSocket server

########################
# 1) Build stage
########################
FROM rust:bullseye
WORKDIR /app
# Build your code
COPY . .
RUN cargo build --release
EXPOSE 3030
USER 65532:65532
CMD ["/app/target/release/rust_ws_server"]

