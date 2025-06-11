const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Program ID from Solana Playground deployment
const PROGRAM_ID = new PublicKey("CaF34a7uKZzVpBmmQMH2RLtq5Sj2sJSgLUnZcNRDt9P1");

// Your devnet wallet and token
const AUTHORITY = new PublicKey("7wkDoaFHXgmFjpKMSZZL7mg3c8bHLErSQ6QwhcDTXU8R");
const TOKEN_MINT = new PublicKey("6iM7CJcaWNDEueWzAj3HDZqydH8NMc147Dw1pZPvcAw4");

// Connection to devnet
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// IDL (same as in contract.js)
const IDL = {
  "version": "0.1.0",
  "name": "flip_game",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "gameState", "isMut": true, "isSigner": false },
        { "name": "tokenMint", "isMut": false, "isSigner": false },
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "GameState",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "publicKey" },
          { "name": "tokenMint", "type": "publicKey" },
          { "name": "flipCount", "type": "u64" },
          { "name": "totalVolume", "type": "u64" },
          { "name": "totalHouseEarnings", "type": "u64" }
        ]
      }
    }
  ]
};

async function initializeGame() {
  try {
    console.log("Initializing flip game on devnet...");
    console.log("Program ID:", PROGRAM_ID.toString());
    console.log("Authority:", AUTHORITY.toString());
    console.log("Token Mint:", TOKEN_MINT.toString());

    // Derive game state PDA
    const [gameStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      PROGRAM_ID
    );
    
    console.log("Game State PDA:", gameStatePDA.toString());

    // Check if already initialized
    try {
      const gameState = await connection.getAccountInfo(gameStatePDA);
      if (gameState) {
        console.log("✅ Game already initialized!");
        return;
      }
    } catch (e) {
      console.log("Game not yet initialized, proceeding...");
    }

    console.log("\n🚀 To initialize the game:");
    console.log("1. Go to beta.solpg.io");
    console.log("2. Import your wallet with private key");
    console.log("3. Use the client tab to run:");
    console.log(`
// Initialize the game
const gameStatePDA = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("game_state")], 
  program.programId
)[0];

await program.methods.initialize()
  .accounts({
    gameState: gameStatePDA,
    tokenMint: new anchor.web3.PublicKey("${TOKEN_MINT}"),
    authority: provider.wallet.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .rpc();

console.log("Game initialized!");
    `);

  } catch (error) {
    console.error("Error:", error);
  }
}

initializeGame();