// Demo version of the $FLIP game for Vercel deployment
let wallet;
let connected = false;

const flipHistory = [];
let demoBalance = 10000;
let demoPot = 125000;

async function init() {
    setupEventListeners();
    updateDisplay();
}

function setupEventListeners() {
    document.getElementById("connect-wallet").addEventListener("click", connectWallet);
    document.getElementById("flip-btn").addEventListener("click", executeFlip);
}

async function connectWallet() {
    try {
        if (typeof window.solana !== "undefined" && window.solana.isPhantom) {
            const response = await window.solana.connect();
            wallet = window.solana;
            connected = true;
            
            // Update UI
            document.getElementById("connect-wallet").style.display = "none";
            document.getElementById("wallet-info").style.display = "block";
            document.getElementById("game-section").style.display = "block";
            document.getElementById("wallet-address").textContent = 
                response.publicKey.toString().slice(0, 6) + "..." + 
                response.publicKey.toString().slice(-4);
            
            updateBalance();
            updatePotSize();
            
        } else {
            // Demo mode without Phantom
            connected = true;
            document.getElementById("connect-wallet").style.display = "none";
            document.getElementById("wallet-info").style.display = "block";
            document.getElementById("game-section").style.display = "block";
            document.getElementById("wallet-address").textContent = "Demo...Mode";
            
            updateBalance();
            updatePotSize();
            
            showDemoNotice();
        }
    } catch (error) {
        console.error("Wallet connection failed:", error);
        // Fall back to demo mode
        connected = true;
        document.getElementById("connect-wallet").style.display = "none";
        document.getElementById("wallet-info").style.display = "block";
        document.getElementById("game-section").style.display = "block";
        document.getElementById("wallet-address").textContent = "Demo...Mode";
        
        updateBalance();
        updatePotSize();
        showDemoNotice();
    }
}

function showDemoNotice() {
    const notice = document.createElement("div");
    notice.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 107, 107, 0.9);
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 1000;
        max-width: 300px;
    `;
    notice.innerHTML = `
        <strong>🎮 DEMO MODE</strong><br>
        This is a demo version. Install Phantom wallet and connect to Solana devnet for full functionality!
    `;
    document.body.appendChild(notice);
    
    setTimeout(() => {
        notice.remove();
    }, 5000);
}

function updateBalance() {
    document.getElementById("flip-balance").textContent = demoBalance.toLocaleString();
}

function updatePotSize() {
    document.getElementById("pot-size").textContent = demoPot.toLocaleString();
}

async function executeFlip() {
    const wagerInput = document.getElementById("wager-input");
    const wager = parseFloat(wagerInput.value);
    
    if (!wager || wager <= 0) {
        alert("Please enter a valid wager amount");
        return;
    }
    
    if (wager > demoBalance) {
        alert("Insufficient balance!");
        return;
    }
    
    try {
        const flipBtn = document.getElementById("flip-btn");
        flipBtn.disabled = true;
        flipBtn.textContent = "Flipping...";
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 50/50 chance (with slight house edge simulation)
        const won = Math.random() < 0.49; // 49% chance to win (house edge)
        
        if (won) {
            const payout = wager * 1.96; // 2x minus 2% house edge
            demoBalance += payout - wager; // Net gain
            demoPot -= payout;
            
            showResult(true, payout);
            addToHistory(wager, true, payout);
        } else {
            demoBalance -= wager;
            demoPot += wager * 0.98; // House takes 2%
            
            showResult(false, 0);
            addToHistory(wager, false, 0);
        }
        
        updateBalance();
        updatePotSize();
        
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
        address: connected && wallet ? wallet.publicKey.toString() : "Demo1234567890"
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

function updateDisplay() {
    document.getElementById("flip-balance").textContent = "0";
    document.getElementById("pot-size").textContent = "0";
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", init);