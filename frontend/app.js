let connection;
let provider;
let program;
let wallet;
let gameState;

const flipHistory = [];

// Connect to Solana network
const NETWORK = "https://api.devnet.solana.com"; // Devnet for demo
connection = new solanaWeb3.Connection(NETWORK, "confirmed");

async function init() {
    setupEventListeners();
    await checkWalletConnection();
    updateDisplay();
}

function setupEventListeners() {
    document.getElementById("connect-wallet").addEventListener("click", connectWallet);
    document.getElementById("flip-btn").addEventListener("click", executeFlip);
    
    // Auto-refresh pot size every 10 seconds
    setInterval(updateGameState, 10000);
}

async function connectWallet() {
    try {
        if (typeof window.solana !== "undefined" && window.solana.isPhantom) {
            const response = await window.solana.connect();
            wallet = window.solana;
            
            // Create Anchor provider
            provider = new Anchor.AnchorProvider(
                connection,
                wallet,
                { commitment: "confirmed" }
            );
            
            // Create program instance
            program = new Anchor.Program(IDL, PROGRAM_ID, provider);
            
            // Update UI
            document.getElementById("connect-wallet").style.display = "none";
            document.getElementById("wallet-info").style.display = "block";
            document.getElementById("game-section").style.display = "block";
            document.getElementById("wallet-address").textContent = 
                response.publicKey.toString().slice(0, 6) + "..." + 
                response.publicKey.toString().slice(-4);
            
            await updateBalance();
            await updateGameState();
            setupProgramListeners();
            
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

async function updateBalance() {
    try {
        if (!wallet || !wallet.publicKey) return;
        
        // Get user's token account for FLIP
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { mint: FLIP_MINT }
        );
        
        let balance = 0;
        if (tokenAccounts.value.length > 0) {
            balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        }
        
        document.getElementById("flip-balance").textContent = (balance || 0).toLocaleString();
    } catch (error) {
        console.error("Failed to update balance:", error);
        document.getElementById("flip-balance").textContent = "0";
    }
}

async function updateGameState() {
    try {
        if (!program) return;
        
        gameState = await program.account.gameState.fetch(gameStatePDA);
        const potAmount = gameState.pot.toNumber() / 1e9; // Convert from lamports (assuming 9 decimals)
        document.getElementById("pot-size").textContent = potAmount.toLocaleString();
    } catch (error) {
        console.error("Failed to update game state:", error);
        document.getElementById("pot-size").textContent = "0";
    }
}

async function getUserTokenAccount() {
    try {
        const [tokenAccount] = await solanaWeb3.PublicKey.findProgramAddress(
            [
                wallet.publicKey.toBuffer(),
                solanaWeb3.TOKEN_PROGRAM_ID.toBuffer(),
                FLIP_MINT.toBuffer(),
            ],
            new solanaWeb3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program
        );
        
        // Check if account exists, if not we need to create it
        const accountInfo = await connection.getAccountInfo(tokenAccount);
        if (!accountInfo) {
            throw new Error("Token account doesn't exist. Please create a token account for this mint first.");
        }
        
        return tokenAccount;
    } catch (error) {
        console.error("Error getting token account:", error);
        throw error;
    }
}

async function executeFlip() {
    const wagerInput = document.getElementById("wager-input");
    const wager = parseFloat(wagerInput.value);
    
    if (!wager || wager <= 0) {
        alert("Please enter a valid wager amount");
        return;
    }
    
    try {
        const flipBtn = document.getElementById("flip-btn");
        flipBtn.disabled = true;
        flipBtn.textContent = "Flipping...";
        
        // Convert wager to token units (assuming 9 decimals)
        const wagerAmount = new Anchor.BN(wager * 1e9);
        
        // Get user's token account
        const playerTokenAccount = await getUserTokenAccount();
        
        // Execute flip transaction
        const tx = await program.methods
            .flip(wagerAmount)
            .accounts({
                gameState: gameStatePDA,
                gameVault: gameVaultPDA,
                player: wallet.publicKey,
                playerTokenAccount: playerTokenAccount,
                tokenProgram: solanaWeb3.TOKEN_PROGRAM_ID,
            })
            .rpc();
        
        console.log("Flip transaction:", tx);
        
        // Wait for confirmation and get transaction details
        await connection.confirmTransaction(tx, "confirmed");
        
        // Update UI
        await updateBalance();
        await updateGameState();
        
        showResult(true, wager * 1.96); // Temporary - should get from event
        addToHistory(wager, true, wager * 1.96); // Temporary - should get from event
        
    } catch (error) {
        console.error("Flip failed:", error);
        alert("Flip failed: " + error.message);
    } finally {
        const flipBtn = document.getElementById("flip-btn");
        flipBtn.disabled = false;
        flipBtn.textContent = "🎲 FLIP 🎲";
        wagerInput.value = "";
    }
}

function showResult(won, payout) {
    const resultDisplay = document.getElementById("result-display");
    const resultContent = document.getElementById("result-content");
    
    if (won) {
        resultContent.innerHTML = `
            <div class="result win">
                <h2>🎉 YOU WON! 🎉</h2>
                <p>Payout: ${payout.toLocaleString()} FLIP</p>
            </div>
        `;
    } else {
        resultContent.innerHTML = `
            <div class="result lose">
                <h2>💀 YOU GOT FLIPPED! 💀</h2>
                <p>Better luck next time!</p>
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
        address: wallet.publicKey.toString()
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
            <span class="amount">${item.wager.toLocaleString()} FLIP</span>
            ${item.won ? `<span class="payout">(+${item.payout.toLocaleString()})</span>` : ""}
        </div>
    `).join("");
}

function setupProgramListeners() {
    // Listen for FlipResult events
    program.addEventListener("FlipResult", (event) => {
        const { player, wager, won, payout } = event;
        console.log("Flip result:", { player: player.toString(), wager: wager.toString(), won, payout: payout.toString() });
        
        const wagerAmount = wager.toNumber() / 1e9;
        const payoutAmount = payout.toNumber() / 1e9;
        
        if (player.toString() === wallet.publicKey.toString()) {
            showResult(won, payoutAmount);
            addToHistory(wagerAmount, won, payoutAmount);
        } else {
            // Add other players' flips to history
            const historyItem = {
                timestamp: new Date().toLocaleTimeString(),
                wager: wagerAmount,
                won,
                payout: payoutAmount,
                address: player.toString()
            };
            
            flipHistory.unshift(historyItem);
            if (flipHistory.length > 10) flipHistory.pop();
            updateHistoryDisplay();
        }
    });
    
    // Listen for pot updates
    program.addEventListener("PotUpdated", (event) => {
        const potAmount = event.newPotSize.toNumber() / 1e9;
        document.getElementById("pot-size").textContent = potAmount.toLocaleString();
    });
}

function updateDisplay() {
    // Initial display setup
    document.getElementById("flip-balance").textContent = "0";
    document.getElementById("pot-size").textContent = "0";
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", init);