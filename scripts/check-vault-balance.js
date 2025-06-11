const { Connection, PublicKey } = require('@solana/web3.js');

async function checkVaultBalance() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const vaultATA = new PublicKey("4qChRBZt1Kubj6MMeP7WE9g6DuNS1AFyrMyjQm5Gmezn");
    
    console.log("Checking vault token account:", vaultATA.toString());
    
    try {
        const accountInfo = await connection.getParsedAccountInfo(vaultATA);
        
        if (accountInfo.value) {
            console.log("\nAccount exists!");
            console.log("Owner:", accountInfo.value.owner.toString());
            console.log("Lamports:", accountInfo.value.lamports);
            
            if (accountInfo.value.data.parsed) {
                const parsed = accountInfo.value.data.parsed;
                console.log("\nParsed data:");
                console.log("Type:", parsed.type);
                
                if (parsed.info) {
                    console.log("Mint:", parsed.info.mint);
                    console.log("Owner:", parsed.info.owner);
                    console.log("State:", parsed.info.state);
                    
                    if (parsed.info.tokenAmount) {
                        console.log("\nToken Amount:");
                        console.log("Amount:", parsed.info.tokenAmount.amount);
                        console.log("UI Amount:", parsed.info.tokenAmount.uiAmount);
                        console.log("Decimals:", parsed.info.tokenAmount.decimals);
                    }
                }
            }
        } else {
            console.log("Account does not exist!");
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

checkVaultBalance();