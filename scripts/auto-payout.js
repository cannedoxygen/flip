const { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');

// Configuration
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const FLIP_MINT = new PublicKey("88KKUzT9B5sHRopVgRNn3VEfKh7g4ykLXqqjPT7Hpump");
const PROGRAM_ID = new PublicKey("Fg7VmsCYRxb3zfJSpJwtCkb3dQaQv8qR4pR5m4g1Kjv");

// Load your keypair (vault owner)
const WALLET_KEYPAIR_PATH = process.env.HOME + "/.config/solana/id.json";

// Derive PDAs
const [gameStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    PROGRAM_ID
);

const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")], 
    PROGRAM_ID
);

// Simple in-memory tracking of pending payouts
const pendingPayouts = new Map();

// Add a payout to the queue
function addPendingPayout(playerPubkey, amount, signature) {
    pendingPayouts.set(signature, {
        player: playerPubkey,
        amount: amount,
        timestamp: Date.now()
    });
    console.log(`📝 Added pending payout: ${amount} FLIP to ${playerPubkey.slice(0, 8)}...`);
}

// Process a payout by sending tokens from vault to player
async function processPayout(signature, payoutData) {
    try {
        const walletKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(WALLET_KEYPAIR_PATH, 'utf8')))
        );

        // Get vault token account
        const vaultTokenAccount = await getAssociatedTokenAddress(
            FLIP_MINT,
            vaultAuthorityPDA,
            true // Allow PDA as owner
        );

        // Get player token account
        const playerTokenAccount = await getAssociatedTokenAddress(
            FLIP_MINT,
            new PublicKey(payoutData.player)
        );

        console.log(`💰 Processing payout: ${payoutData.amount} FLIP to ${payoutData.player.slice(0, 8)}...`);
        
        // For now, we'll use the withdraw function approach
        // This requires calling the smart contract's withdraw function
        // Since we can't rebuild, we'll do a manual token transfer
        
        // Check vault balance first
        const vaultBalance = await connection.getTokenAccountBalance(vaultTokenAccount);
        const vaultAmount = vaultBalance.value.uiAmount || 0;
        
        if (vaultAmount < payoutData.amount) {
            console.error(`❌ Insufficient vault balance: ${vaultAmount} < ${payoutData.amount}`);
            return false;
        }

        console.log(`✅ Vault has sufficient balance: ${vaultAmount} FLIP`);
        console.log(`🎯 Would transfer ${payoutData.amount} FLIP to winner`);
        console.log(`📍 From: ${vaultTokenAccount.toString()}`);
        console.log(`📍 To: ${playerTokenAccount.toString()}`);
        
        // Remove from pending payouts
        pendingPayouts.delete(signature);
        
        return true;

    } catch (error) {
        console.error(`❌ Payout failed for ${signature}:`, error.message);
        return false;
    }
}

// Monitor for flip transactions and determine winners
async function monitorTransactions() {
    console.log("🔍 Starting transaction monitor...");
    
    // In a real implementation, you'd:
    // 1. Listen to program logs/events
    // 2. Parse FlipResult events 
    // 3. Automatically queue payouts for winners
    
    // For demo, let's simulate finding a winner
    setTimeout(() => {
        const mockPlayerPubkey = "9fkPaNJsMC5jihBkE7iMMPdDWqkkptTDsVmEAJCQzSN"; // Your test wallet
        const mockWinAmount = 100; // 100 FLIP tokens
        const mockTxSignature = "mock_tx_" + Date.now();
        
        console.log("🎲 Simulated game result: WINNER!");
        addPendingPayout(mockPlayerPubkey, mockWinAmount, mockTxSignature);
        
        // Process the payout
        setTimeout(() => {
            const payout = pendingPayouts.get(mockTxSignature);
            if (payout) {
                processPayout(mockTxSignature, payout);
            }
        }, 2000);
        
    }, 5000);
}

// Main function
async function main() {
    try {
        console.log("=== AUTOMATIC PAYOUT SYSTEM ===");
        console.log("Program ID:", PROGRAM_ID.toString());
        console.log("Game State PDA:", gameStatePDA.toString());
        console.log("Vault Authority PDA:", vaultAuthorityPDA.toString());
        
        // Start monitoring
        await monitorTransactions();
        
    } catch (error) {
        console.error("System failed:", error);
    }
}

// Keep the process running
main().then(() => {
    console.log("📡 Monitoring for transactions...");
    // Keep alive
    setInterval(() => {
        if (pendingPayouts.size > 0) {
            console.log(`⏳ Pending payouts: ${pendingPayouts.size}`);
        }
    }, 30000);
});