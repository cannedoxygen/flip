const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');

async function getVaultTokenAccount() {
    const tokenMint = new PublicKey("6iM7CJcaWNDEueWzAj3HDZqydH8NMc147Dw1pZPvcAw4");
    const vaultAuthority = new PublicKey("tvK85i3jVAnXR8czk9VjRBihUfP6zhxTiTa1TDCpyqg");
    
    const vaultTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        vaultAuthority,
        true // allowOwnerOffCurve - required for PDAs
    );
    
    console.log("Vault Token Account:", vaultTokenAccount.toString());
    console.log("\nSend tokens to this address to fund the vault:");
    console.log(`spl-token transfer 6iM7CJcaWNDEueWzAj3HDZqydH8NMc147Dw1pZPvcAw4 200000 ${vaultTokenAccount.toString()} --url devnet --fund-recipient`);
}

getVaultTokenAccount();