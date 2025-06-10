const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo } = require("@solana/spl-token");

async function main() {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.FlipGame;

  console.log("🚀 Starting FLIP Game deployment...");
  console.log("Program ID:", program.programId.toString());

  // Create a new token mint for FLIP tokens
  console.log("📝 Creating FLIP token mint...");
  const mintKeypair = Keypair.generate();
  const mint = await createMint(
    provider.connection,
    provider.wallet.payer,
    provider.wallet.publicKey,
    null,
    9, // 9 decimals
    mintKeypair
  );
  console.log("FLIP Token Mint:", mint.toString());

  // Derive PDAs
  const [gameStatePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_state")],
    program.programId
  );

  const [gameVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_vault")],
    program.programId
  );

  console.log("Game State PDA:", gameStatePDA.toString());
  console.log("Game Vault PDA:", gameVaultPDA.toString());

  // Initialize the game
  console.log("🎮 Initializing flip game...");
  const initialPot = new anchor.BN(100_000 * 1e9); // 100k FLIP tokens
  
  try {
    const tx = await program.methods
      .initialize(initialPot)
      .accounts({
        gameState: gameStatePDA,
        gameVault: gameVaultPDA,
        tokenMint: mint,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("✅ Game initialized! Transaction:", tx);
  } catch (error) {
    console.error("❌ Failed to initialize game:", error);
    return;
  }

  // Create token account for authority and mint initial supply
  console.log("💰 Minting initial FLIP token supply...");
  const authorityTokenAccount = await createAccount(
    provider.connection,
    provider.wallet.payer,
    mint,
    provider.wallet.publicKey
  );

  // Mint 1 billion FLIP tokens to authority
  await mintTo(
    provider.connection,
    provider.wallet.payer,
    mint,
    authorityTokenAccount,
    provider.wallet.payer,
    1_000_000_000 * 1e9 // 1 billion tokens
  );

  // Add initial pot to the game
  console.log("🎯 Adding initial pot to game...");
  try {
    const addPotTx = await program.methods
      .addToPot(initialPot)
      .accounts({
        gameState: gameStatePDA,
        gameVault: gameVaultPDA,
        authority: provider.wallet.publicKey,
        authorityTokenAccount: authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("✅ Initial pot added! Transaction:", addPotTx);
  } catch (error) {
    console.error("❌ Failed to add initial pot:", error);
  }

  // Save deployment info
  const deploymentInfo = {
    programId: program.programId.toString(),
    gameState: gameStatePDA.toString(),
    gameVault: gameVaultPDA.toString(),
    flipMint: mint.toString(),
    authorityTokenAccount: authorityTokenAccount.toString(),
    network: provider.connection.rpcEndpoint,
    deployedAt: new Date().toISOString(),
  };

  const fs = require("fs");
  fs.writeFileSync(
    "./frontend/deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n🎉 Deployment complete!");
  console.log("📋 Deployment info saved to frontend/deployment.json");
  console.log("\n📊 Summary:");
  console.log("- Program ID:", program.programId.toString());
  console.log("- FLIP Token Mint:", mint.toString());
  console.log("- Game State PDA:", gameStatePDA.toString());
  console.log("- Initial Pot: 100,000 FLIP");
  console.log("\n🌐 Frontend setup:");
  console.log("1. Update FLIP_MINT in frontend/contract.js");
  console.log("2. Run: npm run serve");
  console.log("3. Open http://localhost:8080");
  console.log("\n🎲 Ready to FLIP!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});