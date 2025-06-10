const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, transfer, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

// Configuration
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const FLIP_MINT = new PublicKey("88KKUzT9B5sHRopVgRNn3VEfKh7g4ykLXqqjPT7Hpump");
const PROGRAM_ID = new PublicKey("Fg7VmsCYRxb3zfJSpJwtCkb3dQaQv8qR4pR5m4g1Kjv");

// Your wallet keypair (replace with your actual keypair file path)
const WALLET_KEYPAIR_PATH = process.env.HOME + "/.config/solana/id.json";

async function setupVault() {
    try {
        // Load your wallet
        const walletKeypair = Keypair.fromSecretKey(
            new Uint8Array(JSON.parse(fs.readFileSync(WALLET_KEYPAIR_PATH, 'utf8')))
        );
        console.log("Your wallet:", walletKeypair.publicKey.toString());

        // Find vault authority PDA
        const [vaultAuthorityPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault")],
            PROGRAM_ID
        );
        console.log("Vault Authority PDA:", vaultAuthorityPDA.toString());

        // Get vault token account address
        const vaultTokenAccount = await getAssociatedTokenAddress(
            FLIP_MINT,
            vaultAuthorityPDA,
            true // Allow PDA as owner
        );
        console.log("Vault Token Account:", vaultTokenAccount.toString());

        // Check if vault token account exists
        const vaultAccountInfo = await connection.getAccountInfo(vaultTokenAccount);
        
        if (!vaultAccountInfo) {
            console.log("Creating vault token account...");
            
            // Create the vault token account
            const createVaultAccountIx = createAssociatedTokenAccountInstruction(
                walletKeypair.publicKey, // payer
                vaultTokenAccount,       // ata
                vaultAuthorityPDA,       // owner (PDA)
                FLIP_MINT               // mint
            );

            const transaction = new Transaction().add(createVaultAccountIx);
            const signature = await connection.sendTransaction(transaction, [walletKeypair]);
            await connection.confirmTransaction(signature);
            
            console.log("Vault token account created! Transaction:", signature);
        } else {
            console.log("Vault token account already exists");
        }

        // Get your current token account
        const yourTokenAccount = await getAssociatedTokenAddress(
            FLIP_MINT,
            walletKeypair.publicKey
        );

        // Check balances
        const yourBalance = await connection.getTokenAccountBalance(yourTokenAccount);
        console.log("Your FLIP balance:", yourBalance.value.uiAmount);

        // Ask how much to transfer to vault
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        readline.question(`How many FLIP tokens to transfer to vault? (Current balance: ${yourBalance.value.uiAmount}): `, async (amount) => {
            const transferAmount = parseFloat(amount);
            
            if (transferAmount > 0 && transferAmount <= yourBalance.value.uiAmount) {
                console.log(`Transferring ${transferAmount} FLIP to vault...`);
                
                try {
                    const signature = await transfer(
                        connection,
                        walletKeypair,
                        yourTokenAccount,
                        vaultTokenAccount,
                        walletKeypair.publicKey,
                        transferAmount * 1e9 // Convert to smallest unit
                    );
                    
                    console.log("Transfer successful! Transaction:", signature);
                    
                    // Check new balances
                    const newVaultBalance = await connection.getTokenAccountBalance(vaultTokenAccount);
                    console.log("Vault balance:", newVaultBalance.value.uiAmount, "FLIP");
                    
                } catch (error) {
                    console.error("Transfer failed:", error);
                }
            } else {
                console.log("Invalid amount");
            }
            
            readline.close();
        });

    } catch (error) {
        console.error("Setup failed:", error);
    }
}

setupVault();