const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Configuration
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const FLIP_MINT = new PublicKey("88KKUzT9B5sHRopVgRNn3VEfKh7g4ykLXqqjPT7Hpump");
const PROGRAM_ID = new PublicKey("Fg7VmsCYRxb3zfJSpJwtCkb3dQaQv8qR4pR5m4g1Kjv");

async function main() {
    try {
        // Find vault authority PDA
        const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault")],
            PROGRAM_ID
        );
        
        console.log("=== VAULT SETUP INFO ===");
        console.log("Vault Authority PDA:", vaultAuthorityPDA.toString());
        
        // Check what token program this mint uses
        const mintInfo = await connection.getAccountInfo(FLIP_MINT);
        console.log("Token mint owner:", mintInfo.owner.toString());
        
        // Standard SPL Token program
        const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        // Token-2022 program  
        const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
        
        if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            console.log("This token uses Token-2022 program");
        } else if (mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            console.log("This token uses legacy Token program");
        } else {
            console.log("Unknown token program");
        }
        
        // Calculate the associated token address for the vault PDA
        // Using the associated token program
        const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        
        const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
            [
                vaultAuthorityPDA.toBuffer(),
                mintInfo.owner.toBuffer(), // Use the actual token program
                FLIP_MINT.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        console.log("Vault Token Account:", vaultTokenAccount.toString());
        
        // Check if it exists
        const vaultAccountInfo = await connection.getAccountInfo(vaultTokenAccount);
        if (vaultAccountInfo) {
            console.log("✅ Vault token account already exists");
            
            // Check balance
            const balance = await connection.getTokenAccountBalance(vaultTokenAccount);
            console.log("Vault balance:", balance.value.uiAmount, "FLIP");
        } else {
            console.log("❌ Vault token account does not exist");
            console.log("\nTo create it, you'll need to:");
            console.log("1. Use a wallet like Phantom or Solflare");
            console.log("2. Send some FLIP tokens to this address:", vaultTokenAccount.toString());
            console.log("3. This will automatically create the account");
            console.log("\nOR use the Solana CLI:");
            console.log(`spl-token create-account ${FLIP_MINT.toString()} --owner ${vaultAuthorityPDA.toString()}`);
        }
        
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();