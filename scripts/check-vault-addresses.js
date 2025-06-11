const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');

async function checkAddresses() {
    const tokenMint = new PublicKey("6iM7CJcaWNDEueWzAj3HDZqydH8NMc147Dw1pZPvcAw4");
    const vaultAuthority = new PublicKey("tvK85i3jVAnXR8czk9VjRBihUfP6zhxTiTa1TDCpyqg");
    
    // Method 1: Using spl-token library
    const vaultATA1 = await getAssociatedTokenAddress(
        tokenMint,
        vaultAuthority,
        true // allowOwnerOffCurve for PDAs
    );
    
    // Method 2: Manual calculation (like frontend)
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
    
    const [vaultATA2] = await PublicKey.findProgramAddress(
        [
            vaultAuthority.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            tokenMint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log("Token Mint:", tokenMint.toString());
    console.log("Vault Authority PDA:", vaultAuthority.toString());
    console.log("\nVault ATA (spl-token lib):", vaultATA1.toString());
    console.log("Vault ATA (manual calc):", vaultATA2.toString());
    console.log("\nWe sent tokens to: 4qChRBZt1Kubj6MMeP7WE9g6DuNS1AFyrMyjQm5Gmezn");
    console.log("Match?", vaultATA1.toString() === "4qChRBZt1Kubj6MMeP7WE9g6DuNS1AFyrMyjQm5Gmezn");
}

checkAddresses();