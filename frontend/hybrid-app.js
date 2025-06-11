// Hybrid app that can work with real tokens or demo mode
let connection;
let provider;
let program;
let wallet;
let gameState;
const flipHistory = [];

// RPC endpoint with your Helius API key from config
const HELIUS_API_KEY = window.CONFIG?.HELIUS_API_KEY || "99b7e94e-9dff-4de3-82ac-567bfbda369c";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Multiple RPC endpoints with fallback (DEVNET)
const RPC_ENDPOINTS = [
    "https://api.devnet.solana.com",
    "https://rpc-devnet.aws.metaplex.com",
    "https://devnet.helius-rpc.com",
    "https://api.devnet.solana.com"
];

let currentRpcIndex = 0;

// Try different RPCs if one fails
async function createConnection() {
    for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
        try {
            const rpc = RPC_ENDPOINTS[currentRpcIndex];
            console.log(`🔄 Trying RPC: ${rpc}`);
            connection = new solanaWeb3.Connection(rpc, "confirmed");
            
            // Test the connection
            await connection.getLatestBlockhash();
            console.log(`✅ Connected to: ${rpc}`);
            return;
        } catch (error) {
            console.log(`❌ Failed RPC: ${RPC_ENDPOINTS[currentRpcIndex]} - ${error.message}`);
            currentRpcIndex = (currentRpcIndex + 1) % RPC_ENDPOINTS.length;
        }
    }
    throw new Error("All RPC endpoints failed");
}

async function init() {
    setupEventListeners();
    // Initialize RPC connection
    try {
        await createConnection();
    } catch (error) {
        console.error("Failed to connect to any RPC:", error);
    }
    await checkWalletConnection();
    updateDisplay();
}

function setupEventListeners() {
    document.getElementById("connect-wallet").addEventListener("click", connectWallet);
    document.getElementById("disconnect-wallet").addEventListener("click", disconnectWallet);
    document.getElementById("flip-btn").addEventListener("click", executeFlip);
    
    // Auto-refresh every 30 seconds (to avoid rate limits)
    setInterval(async () => {
        await updateGameState();
    }, 30000);
}

async function connectWallet() {
    try {
        if (typeof window.solana !== "undefined" && window.solana.isPhantom) {
            const response = await window.solana.connect();
            wallet = window.solana;
            
            // Update UI
            document.getElementById("connect-wallet").style.display = "none";
            document.getElementById("disconnect-wallet").style.display = "inline-block";
            document.getElementById("wallet-info").style.display = "block";
            document.getElementById("game-section").style.display = "block";
            document.getElementById("wallet-address").textContent = 
                response.publicKey.toString().slice(0, 6) + "..." + 
                response.publicKey.toString().slice(-4);
            
            // Real mode - no demo notice needed
            
            await updateBalance();
            await updateGameState();
            
            // Debug: Show all token accounts
            await debugTokenAccounts();
            
        } else {
            alert("Please install Phantom Wallet!");
            window.open("https://phantom.app/", "_blank");
        }
    } catch (error) {
        console.error("Wallet connection failed:", error);
        alert("Failed to connect wallet: " + error.message);
    }
}

async function disconnectWallet() {
    try {
        if (wallet && wallet.disconnect) {
            await wallet.disconnect();
        }
        
        // Reset wallet state
        wallet = null;
        
        // Update UI
        document.getElementById("connect-wallet").style.display = "inline-block";
        document.getElementById("disconnect-wallet").style.display = "none";
        document.getElementById("wallet-info").style.display = "none";
        document.getElementById("game-section").style.display = "none";
        
        // Reset display
        updateDisplay();
        
        console.log("Wallet disconnected");
    } catch (error) {
        console.error("Disconnect failed:", error);
    }
}

async function checkWalletConnection() {
    if (typeof window.solana !== "undefined" && window.solana.isPhantom) {
        try {
            const response = await window.solana.connect({ onlyIfTrusted: true });
            if (response.publicKey) {
                await connectWallet();
            }
        } catch (error) {
            console.log("Wallet not auto-connected");
        }
    }
}

// Removed showRealModeNotice function


async function updateBalance() {
    try {
        if (!wallet || !wallet.publicKey) {
            document.getElementById("flip-balance").textContent = "0";
            return;
        }
        
        console.log("🔍 Checking balance for wallet:", wallet.publicKey.toString());
        console.log("🪙 Looking for exact token:", FLIP_MINT.toString());
        console.log("🌐 Current RPC:", connection.rpcEndpoint);
        
        // First verify the mint exists
        try {
            const mintInfo = await connection.getAccountInfo(FLIP_MINT);
            if (!mintInfo) {
                console.error("❌ Token mint not found on this network!");
                console.log("Make sure you're on DEVNET");
                document.getElementById("flip-balance").textContent = "Wrong Network";
                return;
            }
            console.log("✅ Token mint exists on network");
        } catch (e) {
            console.error("Failed to check mint:", e);
        }
        
        // Direct token account lookup for our specific token
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { mint: FLIP_MINT }
        );
        
        console.log(`📊 Token accounts found for ${FLIP_MINT.toString()}: ${tokenAccounts.value.length}`);
        
        let balance = 0;
        if (tokenAccounts.value.length > 0) {
            const tokenInfo = tokenAccounts.value[0].account.data.parsed.info;
            balance = tokenInfo.tokenAmount.uiAmount || 0;
            
            console.log("✅ TOKEN FOUND!");
            console.log("💰 Balance:", balance);
            console.log("🔢 Decimals:", tokenInfo.tokenAmount.decimals);
            console.log("📍 Account:", tokenAccounts.value[0].pubkey.toString());
        } else {
            console.log("❌ NO TOKEN ACCOUNT FOUND");
            console.log("💡 You might not have this token in your wallet");
        }
        
        document.getElementById("flip-balance").textContent = balance.toLocaleString();
        
    } catch (error) {
        console.error("❌ Balance check failed:", error);
        document.getElementById("flip-balance").textContent = "Error";
    }
}

async function updateGameState() {
    try {
        console.log("🏦 Checking vault PDA for pot size...");
        console.log("🏦 Vault Authority PDA:", vaultAuthorityPDA.toString());
        
        // Get vault token account to check balance (pot size)
        // First try the associated token address
        const TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const ASSOCIATED_TOKEN_PROGRAM_ID = new solanaWeb3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
        
        const [vaultATA] = await solanaWeb3.PublicKey.findProgramAddress(
            [
                vaultAuthorityPDA.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                FLIP_MINT.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log("🔍 Checking vault ATA:", vaultATA.toString());
        
        // Check the correct vault token account
        const correctVaultAccount = new solanaWeb3.PublicKey("4qChRBZt1Kubj6MMeP7WE9g6DuNS1AFyrMyjQm5Gmezn");
        try {
            const vaultInfo = await connection.getParsedAccountInfo(correctVaultAccount);
            if (vaultInfo.value && vaultInfo.value.data.parsed) {
                const balance = vaultInfo.value.data.parsed.info.tokenAmount.uiAmount || 0;
                console.log("✅ CORRECT VAULT ACCOUNT FOUND!");
                console.log("🏦 Vault Balance (POT):", balance);
                console.log("📍 Account:", correctVaultAccount.toString());
                document.getElementById("pot-size").textContent = balance.toLocaleString();
                return;
            }
        } catch (e) {
            console.log("Failed to check correct vault account:", e);
        }
        
        // Try to get the specific account
        try {
            const vaultAccount = await connection.getParsedAccountInfo(vaultATA);
            if (vaultAccount.value && vaultAccount.value.data.parsed) {
                const vaultInfo = vaultAccount.value.data.parsed.info;
                const vaultBalance = vaultInfo.tokenAmount.uiAmount || 0;
                console.log("✅ VAULT ATA FOUND!");
                console.log("🏦 Vault Balance (POT):", vaultBalance);
                document.getElementById("pot-size").textContent = vaultBalance.toLocaleString();
                return;
            }
        } catch (e) {
            console.log("Failed to get vault ATA:", e);
        }
        
        // Fallback to owner search
        const vaultTokenAccounts = await connection.getParsedTokenAccountsByOwner(
            vaultAuthorityPDA,
            { mint: FLIP_MINT }
        );
        
        let vaultBalance = 0;
        if (vaultTokenAccounts.value.length > 0) {
            const vaultInfo = vaultTokenAccounts.value[0].account.data.parsed.info;
            vaultBalance = vaultInfo.tokenAmount.uiAmount || 0;
            
            console.log("✅ VAULT TOKEN FOUND!");
            console.log("🏦 Vault Balance (POT):", vaultBalance);
            console.log("📍 Vault Account:", vaultTokenAccounts.value[0].pubkey.toString());
        } else {
            console.log("❌ NO VAULT TOKEN ACCOUNT FOUND");
            console.log("💡 Vault wallet might not have this token");
        }
        
        document.getElementById("pot-size").textContent = vaultBalance.toLocaleString();
        
    } catch (error) {
        console.error("❌ Vault check failed:", error);
        document.getElementById("pot-size").textContent = "Error";
    }
}

async function executeFlip() {
    const wagerInput = document.getElementById("wager-input");
    const wager = parseFloat(wagerInput.value);
    
    if (!wager || wager <= 0) {
        alert("Please enter a valid wager amount");
        return;
    }
    
    const flipBtn = document.getElementById("flip-btn");
    flipBtn.disabled = true;
    flipBtn.textContent = "Flipping...";
    
    try {
        await executeRealFlip(wager);
    } catch (error) {
        console.error("Flip failed:", error);
        alert("Flip failed: " + error.message);
    } finally {
        flipBtn.disabled = false;
        flipBtn.textContent = "🎲 FLIP 🎲";
        wagerInput.value = "";
    }
}

async function executeRealFlip(wager) {
    try {
        // Check if user has tokens
        const playerTokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { mint: FLIP_MINT }
        );
        
        if (playerTokenAccounts.value.length === 0) {
            throw new Error("No token account found for this mint. Please create one first.");
        }
        
        const playerTokenAccount = playerTokenAccounts.value[0].pubkey;
        const currentBalance = playerTokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        
        if (currentBalance < wager) {
            throw new Error("Insufficient token balance!");
        }
        
        // Get vault token account - use the correct PDA-owned account
        const vaultTokenAccount = new solanaWeb3.PublicKey("4qChRBZt1Kubj6MMeP7WE9g6DuNS1AFyrMyjQm5Gmezn");
        console.log("Using correct vault token account:", vaultTokenAccount.toString());
        
        console.log("🎲 Calling flip game smart contract...");
        console.log("💰 Wager:", wager, "tokens");
        
        // Check if anchor is available, if not use manual transaction
        if (typeof anchor === 'undefined') {
            console.log("⚠️ Anchor not available, using manual transaction");
            return await executeFlipManual(wager, playerTokenAccount, vaultTokenAccount);
        }
        
        console.log("✅ Anchor available:", typeof anchor);
        
        // Create Anchor provider and program if not exists
        if (!provider) {
            provider = new anchor.AnchorProvider(
                connection,
                wallet,
                anchor.AnchorProvider.defaultOptions()
            );
        }
        if (!program) {
            program = new anchor.Program(IDL, PROGRAM_ID, provider);
        }
        
        // Get token info to determine decimals
        const tokenInfo = playerTokenAccounts.value[0].account.data.parsed.info;
        const decimals = tokenInfo.tokenAmount.decimals;
        
        // Convert wager to lamports
        const wagerLamports = Math.floor(wager * Math.pow(10, decimals));
        const wagerBN = new anchor.BN(wagerLamports);
        
        console.log("📝 Calling flip instruction on program...");
        console.log("👤 Player:", wallet.publicKey.toString());
        console.log("💰 Wager (lamports):", wagerLamports);
        
        try {
            // Call the flip instruction - this handles everything!
            const tx = await program.methods.flip(wagerBN)
                .accounts({
                    gameState: gameStatePDA,
                    player: wallet.publicKey,
                    playerTokenAccount: playerTokenAccount,
                    vaultTokenAccount: vaultTokenAccount,
                    vaultAuthority: vaultAuthorityPDA,
                    tokenProgram: new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
                })
                .rpc();
            
            console.log("✅ Flip transaction confirmed:", tx);
            
            // Get transaction details to see if we won
            let txDetails = null;
            try {
                txDetails = await connection.getTransaction(tx, {
                    commitment: "confirmed",
                    maxSupportedTransactionVersion: 0
                });
            } catch (e) {
                console.log("Could not fetch transaction details:", e);
            }
            
            // Parse logs to determine outcome from smart contract events
            let won = false;
            let payout = 0;
            
            if (txDetails && txDetails.meta && txDetails.meta.logMessages) {
                const logs = txDetails.meta.logMessages;
                console.log("📋 Transaction logs:", logs);
                
                // Look for program logs that indicate win/loss
                for (const log of logs) {
                    // Look for the FlipResult event data
                    if (log.includes("Program data:") || log.includes("Program log:")) {
                        console.log("Found program log:", log);
                        
                        // Check for win indicators in the logs
                        if (log.toLowerCase().includes("win") || log.includes("payout")) {
                            won = true;
                            console.log("🎉 Found win indicator in logs!");
                        }
                    }
                }
                
                // Also check for successful token transfers back to player (indicates win)
                let transfersToPlayer = 0;
                for (const log of logs) {
                    if (log.includes("Transfer") && log.includes(wallet.publicKey.toString().slice(0, 8))) {
                        transfersToPlayer++;
                    }
                }
                
                // If we see more than one transfer involving the player, they probably won
                // (one transfer takes wager, second transfer gives payout)
                if (transfersToPlayer > 1) {
                    won = true;
                    console.log("🎉 Multiple transfers detected - likely a win!");
                }
            }
            
            // If we couldn't parse logs, check balance change
            if (!won && !payout) {
                try {
                    const preBalance = currentBalance;
                    
                    // Wait longer for blockchain to settle completely
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await updateBalance();
                    const postBalance = parseFloat(document.getElementById("flip-balance").textContent.replace(/,/g, '')) || 0;
                    
                    console.log("🔍 Anchor balance check:");
                    console.log("  Pre-game balance:", preBalance);
                    console.log("  Post-game balance:", postBalance);
                    console.log("  Wager:", wager);
                    console.log("  Balance change:", postBalance - preBalance);
                    
                    // Simple logic: compare actual balance change to expected loss
                    const balanceChange = postBalance - preBalance;
                    console.log("  Expected loss:", -wager);
                    console.log("  Actual change:", balanceChange);
                    
                    // If balance change is better than losing the full wager, you won
                    // (accounting for 2% house cut, so expect to get back ~98% of wager if you win)
                    const expectedLoss = -wager;
                    won = balanceChange > expectedLoss + (wager * 0.7); // You won if change is much better than full loss
                    payout = won ? balanceChange + wager : 0;
                    
                    console.log("🎲 Anchor result determination:");
                    console.log("  Balance change:", balanceChange);
                    console.log("  Won?", won);
                    console.log("  Calculated payout:", payout);
                } catch (error) {
                    console.error("Error in balance checking:", error);
                    // Default to showing a loss if we can't determine outcome
                    won = false;
                    payout = 0;
                }
            }
            
            console.log("🎲 Game result:", won ? "WIN!" : "LOSE");
            if (won) {
                console.log("🎉 You won!", payout, "tokens (paid automatically by smart contract)");
            }
            
            // Refresh balances
            await updateBalance();
            await updateGameState();
            
            showResult(won, payout);
            addToHistory(wager, won, payout);
            
        } catch (error) {
            console.error("❌ Flip transaction failed:", error);
            // Still add to history even if failed
            addToHistory(wager, false, 0);
            throw error;
        }
    } catch (error) {
        console.error("❌ Flip failed:", error);
        alert("Game failed: " + error.message);
    }
}

// Calculate Anchor instruction discriminator
async function getDiscriminator(name) {
    const preimage = `global:${name}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(preimage);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer).slice(0, 8);
}

async function executeFlipManual(wager, playerTokenAccount, vaultTokenAccount) {
    console.log("🔧 Using manual transaction approach...");
    
    // Get token info
    const playerTokenAccounts = await connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { mint: FLIP_MINT }
    );
    const tokenInfo = playerTokenAccounts.value[0].account.data.parsed.info;
    const decimals = tokenInfo.tokenAmount.decimals;
    
    // Convert wager to lamports
    const wagerLamports = Math.floor(wager * Math.pow(10, decimals));
    
    // Build flip instruction manually
    // Calculate correct Anchor discriminator for "flip"
    const discriminator = await getDiscriminator("flip");
    console.log("📋 Flip discriminator:", Array.from(discriminator));
    
    // Serialize u64 wager in little-endian format
    const wagerBytes = new ArrayBuffer(8);
    const wagerView = new DataView(wagerBytes);
    wagerView.setBigUint64(0, BigInt(wagerLamports), true); // little-endian
    
    const data = new Uint8Array(16); // 8 bytes discriminator + 8 bytes wager
    data.set(discriminator, 0);
    data.set(new Uint8Array(wagerBytes), 8);
    
    const instruction = new solanaWeb3.TransactionInstruction({
        keys: [
            { pubkey: gameStatePDA, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: playerTokenAccount, isSigner: false, isWritable: true },
            { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
            { pubkey: vaultAuthorityPDA, isSigner: false, isWritable: false },
            { pubkey: new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: data
    });
    
    const transaction = new solanaWeb3.Transaction().add(instruction);
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    console.log("📝 Signing manual transaction...");
    const signed = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    
    console.log("⏳ Confirming manual transaction:", signature);
    await connection.confirmTransaction(signature, "confirmed");
    
    console.log("✅ Manual flip transaction confirmed!");
    
    // Get outcome by checking balance changes
    // Wait longer for blockchain to settle
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Force fresh balance check (don't rely on cached display)
    await updateBalance();
    const postBalance = parseFloat(document.getElementById("flip-balance").textContent.replace(/,/g, ''));
    
    // Calculate what we expect based on the transaction
    const preBalance = postBalance + wager; // Work backwards from final balance
    
    console.log("🔍 Balance check:");
    console.log("  Current balance:", postBalance);
    console.log("  Wager:", wager);
    
    // Simple approach: look at the actual balance change from what we expect
    // If we lost: should be roughly (starting balance - wager)
    // If we won: should be roughly (starting balance + net winnings)
    
    // Get the balance change by checking against recent balance
    // Wait and check again to be sure
    await new Promise(resolve => setTimeout(resolve, 1000));
    await updateBalance();
    const finalBalance = parseFloat(document.getElementById("flip-balance").textContent.replace(/,/g, ''));
    
    // Compare final balance to what we'd expect if we lost
    // If we lost: finalBalance should be roughly (original - wager)  
    // If we won: finalBalance should be higher due to payout
    const startingBalance = finalBalance + wager; // Work backwards
    const expectedIfLost = startingBalance - wager;
    
    // You won if final balance is significantly higher than just losing the wager
    const won = finalBalance > expectedIfLost + (wager * 0.8); // Buffer for house cut
    const payout = won ? (finalBalance - expectedIfLost) : 0;
    
    console.log("🎲 Result determination:");
    console.log("  Post-tx balance:", postBalance);
    console.log("  Final balance:", finalBalance);
    console.log("  Balance change:", finalBalance - postBalance);
    console.log("  Won?", won);
    console.log("  Payout:", payout);
    
    console.log("🎲 Manual game result:", won ? "WIN!" : "LOSE");
    if (won) {
        console.log("🎉 You won!", payout, "tokens");
    }
    
    await updateGameState();
    showResult(won, payout);
    addToHistory(wager, won, payout);
}


function showResult(won, payout) {
    const resultDisplay = document.getElementById("result-display");
    const resultContent = document.getElementById("result-content");
    
    if (won) {
        resultContent.innerHTML = `
            <div class="result win">
                <h2>🎉 YOU WON! 🎉</h2>
                <p>Payout: ${payout.toLocaleString()} tokens</p>
                <small>Real transaction on mainnet!</small>
            </div>
        `;
    } else {
        resultContent.innerHTML = `
            <div class="result lose">
                <h2>💀 YOU GOT FLIPPED! 💀</h2>
                <p>Better luck next time!</p>
                <small>Real transaction on mainnet!</small>
            </div>
        `;
    }
    
    resultDisplay.className = "result-show";
    
    setTimeout(() => {
        resultDisplay.className = "result-hidden";
    }, 5000);
}

function addToHistory(wager, won, payout) {
    const historyItem = {
        timestamp: new Date().toLocaleTimeString(),
        wager: wager,
        won,
        payout: payout,
        address: wallet ? wallet.publicKey.toString() : "Unknown"
    };
    
    flipHistory.unshift(historyItem);
    if (flipHistory.length > 10) flipHistory.pop();
    
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    const historyDiv = document.getElementById("flip-history");
    historyDiv.innerHTML = flipHistory.map(item => `
        <div class="history-item ${item.won ? "win" : "lose"}">
            <span class="time">${item.timestamp}</span>
            <span class="address">${item.address.slice(0, 6)}...${item.address.slice(-4)}</span>
            <span class="action">${item.won ? "won" : "got FLIPPED for"}</span>
            <span class="amount">${item.wager.toLocaleString()} tokens</span>
            ${item.won ? `<span class="payout">(+${item.payout.toLocaleString()})</span>` : ""}
            <span class="real">🔗</span>
        </div>
    `).join("");
}

function updateDisplay() {
    // Don't reset if wallet is already connected
    if (!wallet || !wallet.publicKey) {
        document.getElementById("flip-balance").textContent = "0";
        document.getElementById("pot-size").textContent = "0";
    }
}

async function debugTokenAccounts() {
    if (!wallet || !wallet.publicKey) return;
    
    try {
        console.log("=== 🔍 COMPREHENSIVE DEBUG (Updated) ===");
        console.log("Your wallet:", wallet.publicKey.toString());
        console.log("Token mint:", FLIP_MINT.toString());
        console.log("Vault Authority PDA:", vaultAuthorityPDA.toString());
        console.log("RPC endpoint:", RPC_ENDPOINTS[currentRpcIndex]);
        
        // First, let's see ALL tokens you have
        console.log("\n--- ALL YOUR TOKENS ---");
        try {
            const allTokens = await connection.getParsedTokenAccountsByOwner(
                wallet.publicKey,
                { programId: new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
            );
            
            console.log(`Found ${allTokens.value.length} token accounts in your wallet:`);
            allTokens.value.forEach((account, i) => {
                const data = account.account.data.parsed.info;
                console.log(`${i + 1}. Mint: ${data.mint}, Balance: ${data.tokenAmount.uiAmount}`);
            });
            
            // Check if our specific token is in the list
            console.log("🔍 Searching for mint:", FLIP_MINT.toString());
            const ourToken = allTokens.value.find(acc => {
                const mint = acc.account.data.parsed.info.mint;
                console.log(`  Comparing: ${mint} === ${FLIP_MINT.toString()} ? ${mint === FLIP_MINT.toString()}`);
                return mint === FLIP_MINT.toString();
            });
            
            if (ourToken) {
                console.log("✅ FOUND OUR TOKEN IN YOUR WALLET!");
                console.log("Balance:", ourToken.account.data.parsed.info.tokenAmount.uiAmount);
            } else {
                console.log("❌ OUR TOKEN NOT FOUND IN YOUR WALLET");
            }
            
        } catch (error) {
            console.error("Failed to get your tokens:", error);
        }
        
        // Check if token mint exists
        console.log("\n--- TOKEN MINT CHECK ---");
        try {
            const mintInfo = await connection.getParsedAccountInfo(FLIP_MINT);
            if (mintInfo.value) {
                console.log("✅ Token mint EXISTS on mainnet");
                console.log("Supply:", mintInfo.value.data.parsed.info.supply);
                console.log("Decimals:", mintInfo.value.data.parsed.info.decimals);
            } else {
                console.log("❌ Token mint NOT FOUND");
                console.log("💡 This token might not exist or be on a different network");
            }
        } catch (error) {
            console.error("Token mint check failed:", error);
        }
        
        // Check vault PDA tokens
        console.log("\n--- VAULT PDA CHECK ---");
        try {
            const vaultTokens = await connection.getParsedTokenAccountsByOwner(
                vaultAuthorityPDA,
                { programId: new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
            );
            
            console.log(`Found ${vaultTokens.value.length} token accounts in vault PDA:`);
            vaultTokens.value.forEach((account, i) => {
                const data = account.account.data.parsed.info;
                console.log(`${i + 1}. Mint: ${data.mint}, Balance: ${data.tokenAmount.uiAmount}`);
            });
            
        } catch (error) {
            console.error("Failed to get vault tokens:", error);
        }
        
    } catch (error) {
        console.error("Debug failed:", error);
    }
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", init);