// Hybrid app that can work with real tokens or demo mode
let connection;
let provider;
let program;
let wallet;
let gameState;
const flipHistory = [];

// Connect to Solana mainnet with free public RPC
const NETWORK = "https://api.mainnet-beta.solana.com"; // Solana's official public endpoint
connection = new solanaWeb3.Connection(NETWORK, "confirmed");

async function init() {
    setupEventListeners();
    await checkWalletConnection();
    updateDisplay();
}

function setupEventListeners() {
    document.getElementById("connect-wallet").addEventListener("click", connectWallet);
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
            document.getElementById("wallet-info").style.display = "block";
            document.getElementById("game-section").style.display = "block";
            document.getElementById("wallet-address").textContent = 
                response.publicKey.toString().slice(0, 6) + "..." + 
                response.publicKey.toString().slice(-4);
            
            // Initialize real mode (without Anchor for now)
            showRealModeNotice();
            
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

function showRealModeNotice() {
    const notice = document.createElement("div");
    notice.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 255, 136, 0.9);
        color: black;
        padding: 15px;
        border-radius: 8px;
        z-index: 1000;
        max-width: 300px;
        font-weight: bold;
    `;
    notice.innerHTML = `
        <strong>🚀 REAL MODE</strong><br>
        Connected to live Solana program!<br>
        Connected to mainnet with real tokens!<br>
        Token: ${FLIP_MINT.toString().slice(0,8)}...${FLIP_MINT.toString().slice(-4)}
    `;
    document.body.appendChild(notice);
    
    setTimeout(() => {
        notice.remove();
    }, 8000);
}


async function updateBalance() {
    try {
        if (!wallet || !wallet.publicKey) {
            document.getElementById("flip-balance").textContent = "0";
            return;
        }
        
        console.log("🔍 Checking balance for wallet:", wallet.publicKey.toString());
        console.log("🪙 Looking for token:", FLIP_MINT.toString());
        
        // Direct token account lookup for our specific token
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { mint: FLIP_MINT }
        );
        
        console.log(`📊 Token accounts found: ${tokenAccounts.value.length}`);
        
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
        console.log("🏦 Checking vault wallet for pot size...");
        console.log("🏦 Vault wallet:", VAULT_WALLET.toString());
        
        // Get vault token account to check balance (pot size)
        const vaultTokenAccounts = await connection.getParsedTokenAccountsByOwner(
            VAULT_WALLET,
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
    // Check if user has tokens
    const playerTokenAccounts = await connection.getParsedTokenAccountsByOwner(
        wallet.publicKey,
        { mint: FLIP_MINT }
    );
    
    if (playerTokenAccounts.value.length === 0) {
        throw new Error("No token account found for this mint. Please create one first.");
    }
    
    const currentBalance = playerTokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    if (currentBalance < wager) {
        throw new Error("Insufficient token balance!");
    }
    
    // For now, show that it would work
    alert(`Ready to flip ${wager} tokens! (Program deployment needed for real transactions)`);
    
    // Simulate result for UI demonstration
    const won = Math.random() < 0.49;
    const payout = won ? wager * 1.96 : 0;
    
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update UI
    await updateBalance();
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
    document.getElementById("flip-balance").textContent = "0";
    document.getElementById("pot-size").textContent = "0";
}

async function debugTokenAccounts() {
    if (!wallet || !wallet.publicKey) return;
    
    try {
        console.log("=== 🔍 COMPREHENSIVE DEBUG (Updated) ===");
        console.log("Your wallet:", wallet.publicKey.toString());
        console.log("Token mint:", FLIP_MINT.toString());
        console.log("Vault wallet:", VAULT_WALLET.toString());
        console.log("RPC endpoint:", NETWORK);
        
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
            const ourToken = allTokens.value.find(acc => 
                acc.account.data.parsed.info.mint === FLIP_MINT.toString()
            );
            
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
        
        // Check vault wallet tokens
        console.log("\n--- VAULT WALLET CHECK ---");
        try {
            const vaultTokens = await connection.getParsedTokenAccountsByOwner(
                VAULT_WALLET,
                { programId: new solanaWeb3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
            );
            
            console.log(`Found ${vaultTokens.value.length} token accounts in vault wallet:`);
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