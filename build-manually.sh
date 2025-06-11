#!/bin/bash

# Simple build script that avoids Cargo.lock issues

cd programs/flip-game

# Remove any existing lock files
rm -f Cargo.lock

# Set specific Rust version that works with Solana
rustup default 1.75.0

# Build using cargo directly with specific settings
RUSTFLAGS="-C target-cpu=generic" cargo build --release --target bpfel-unknown-unknown

# Copy to deploy directory
mkdir -p ../../target/deploy
cp target/bpfel-unknown-unknown/release/flip_game.so ../../target/deploy/

echo "Build complete!"
echo "Program at: target/deploy/flip_game.so"