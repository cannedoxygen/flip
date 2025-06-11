const PROGRAM_ID = new solanaWeb3.PublicKey("CaF34a7uKZzVpBmmQMH2RLtq5Sj2sJSgLUnZcNRDt9P1");

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
    },
    {
      "name": "flip",
      "accounts": [
        { "name": "gameState", "isMut": true, "isSigner": false },
        { "name": "player", "isMut": true, "isSigner": true },
        { "name": "playerTokenAccount", "isMut": true, "isSigner": false },
        { "name": "vaultTokenAccount", "isMut": true, "isSigner": false },
        { "name": "vaultAuthority", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "wager", "type": "u64" }
      ]
    },
    {
      "name": "getVaultBalance",
      "accounts": [
        { "name": "gameState", "isMut": false, "isSigner": false },
        { "name": "vaultTokenAccount", "isMut": false, "isSigner": false }
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
          { "name": "vaultWallet", "type": "publicKey" },
          { "name": "flipCount", "type": "u64" },
          { "name": "totalVolume", "type": "u64" },
          { "name": "totalHouseEarnings", "type": "u64" }
        ]
      }
    }
  ],
  "events": [
    {
      "name": "FlipResult",
      "fields": [
        { "name": "player", "type": "publicKey", "index": false },
        { "name": "wager", "type": "u64", "index": false },
        { "name": "won", "type": "bool", "index": false },
        { "name": "payout", "type": "u64", "index": false },
        { "name": "houseCut", "type": "u64", "index": false }
      ]
    }
  ],
  "errors": [
    { "code": 6000, "name": "InvalidWager", "msg": "Invalid wager amount" },
    { "code": 6001, "name": "InsufficientVault", "msg": "Insufficient vault balance for potential payout" },
    { "code": 6002, "name": "Overflow", "msg": "Arithmetic overflow" }
  ]
};

// TEST token mint (devnet test token)
const FLIP_MINT = new solanaWeb3.PublicKey("6iM7CJcaWNDEueWzAj3HDZqydH8NMc147Dw1pZPvcAw4");

// Derive PDAs
const [gameStatePDA] = solanaWeb3.PublicKey.findProgramAddressSync(
  [new TextEncoder().encode("game_state")],
  PROGRAM_ID
);

const [vaultAuthorityPDA] = solanaWeb3.PublicKey.findProgramAddressSync(
  [new TextEncoder().encode("vault")],
  PROGRAM_ID
);

console.log("Program ID:", PROGRAM_ID.toString());
console.log("Game State PDA:", gameStatePDA.toString());
console.log("Vault Authority PDA:", vaultAuthorityPDA.toString());