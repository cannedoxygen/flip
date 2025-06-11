#!/bin/bash

echo "=== Deploying Flip Game to Mainnet ==="

# Set mainnet URL
solana config set --url https://api.mainnet-beta.solana.com

# Check current config
echo "Current Solana config:"
solana config get

# Build the program (try different methods)
echo "Building program..."

# Method 1: Try cargo build-sbf
if command -v cargo-build-sbf &> /dev/null; then
    echo "Using cargo-build-sbf..."
    cd programs/flip-game
    cargo build-sbf
    cd ../..
else
    echo "cargo-build-sbf not found, trying cargo build-bpf..."
    cd programs/flip-game
    cargo build-bpf
    cd ../..
fi

# Check if build succeeded
if [ -f "target/deploy/flip_game.so" ]; then
    echo "✅ Build successful!"
    echo "Program size: $(ls -lh target/deploy/flip_game.so | awk '{print $5}')"
else
    echo "❌ Build failed! Program file not found."
    exit 1
fi

# Deploy to mainnet
echo ""
echo "⚠️  WARNING: This will deploy to MAINNET and cost SOL!"
echo "Current program ID: Fg7VmsCYRxb3zfJSpJwtCkb3dQaQv8qR4pR5m4g1Kjv"
echo ""
read -p "Deploy to mainnet? (yes/no): " confirm

if [ "$confirm" = "yes" ]; then
    echo "Deploying..."
    solana program deploy target/deploy/flip_game.so
else
    echo "Deployment cancelled."
fi