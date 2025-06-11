#!/bin/bash

# Setup devnet testing environment
# Your devnet wallet: 7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R

echo "Setting up devnet environment..."

# Switch to devnet
solana config set --url devnet

# Get devnet SOL
echo "Getting devnet SOL..."
solana airdrop 5 7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R --url devnet

# Check balance
echo "SOL Balance:"
solana balance 7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R --url devnet

# Create a new test token
echo "Creating test token..."
NEW_MINT=$(spl-token create-token --url devnet --output json | jq -r '.commandOutput.address')
echo "New token mint: $NEW_MINT"

# Create token account for your wallet
echo "Creating token account..."
spl-token create-account $NEW_MINT 7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R --url devnet

# Mint 1 million tokens to your wallet
echo "Minting 1,000,000 tokens..."
spl-token mint $NEW_MINT 1000000 7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R --url devnet

# Check token balance
echo "Token Balance:"
spl-token balance $NEW_MINT --owner 7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R --url devnet

echo "Setup complete!"
echo "Update frontend/contract.js with this token mint: $NEW_MINT"