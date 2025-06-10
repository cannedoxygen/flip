import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { FlipGame } from "../target/types/flip_game";
import { PublicKey, Keypair, SystemProgram } = "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getAccount } from "@solana/spl-token";
import { expect } from "chai";

describe("flip-game", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.FlipGame as Program<FlipGame>;
  
  let mint: PublicKey;
  let gameStatePDA: PublicKey;
  let gameVaultPDA: PublicKey;
  let authorityTokenAccount: PublicKey;
  let playerKeypair: Keypair;
  let playerTokenAccount: PublicKey;

  before(async () => {
    // Create FLIP token mint
    const mintKeypair = Keypair.generate();
    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9,
      mintKeypair
    );

    // Derive PDAs
    [gameStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      program.programId
    );

    [gameVaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_vault")],
      program.programId
    );

    // Create token accounts
    authorityTokenAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    // Create player keypair and token account
    playerKeypair = Keypair.generate();
    playerTokenAccount = await createAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      playerKeypair.publicKey
    );

    // Mint tokens to authority and player
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      authorityTokenAccount,
      provider.wallet.payer,
      1_000_000 * 1e9 // 1M tokens
    );

    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      playerTokenAccount,
      provider.wallet.payer,
      10_000 * 1e9 // 10k tokens for player
    );

    // Airdrop SOL to player for transaction fees
    await provider.connection.requestAirdrop(playerKeypair.publicKey, 2e9);
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  it("Initializes the game", async () => {
    const initialPot = new anchor.BN(100_000 * 1e9); // 100k tokens

    await program.methods
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

    const gameState = await program.account.gameState.fetch(gameStatePDA);
    expect(gameState.pot.toNumber()).to.equal(initialPot.toNumber());
    expect(gameState.authority.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(gameState.tokenMint.toString()).to.equal(mint.toString());
  });

  it("Adds tokens to pot", async () => {
    const addAmount = new anchor.BN(50_000 * 1e9); // 50k tokens

    await program.methods
      .addToPot(addAmount)
      .accounts({
        gameState: gameStatePDA,
        gameVault: gameVaultPDA,
        authority: provider.wallet.publicKey,
        authorityTokenAccount: authorityTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const gameState = await program.account.gameState.fetch(gameStatePDA);
    expect(gameState.pot.toNumber()).to.equal(150_000 * 1e9); // 100k + 50k

    // Check vault balance
    const vaultAccount = await getAccount(provider.connection, gameVaultPDA);
    expect(Number(vaultAccount.amount)).to.equal(50_000 * 1e9);
  });

  it("Executes a flip", async () => {
    const wager = new anchor.BN(1_000 * 1e9); // 1k tokens
    
    const playerProvider = new anchor.AnchorProvider(
      provider.connection,
      new anchor.Wallet(playerKeypair),
      { commitment: "confirmed" }
    );
    const playerProgram = new anchor.Program(program.idl, program.programId, playerProvider);

    const initialPlayerBalance = await getAccount(provider.connection, playerTokenAccount);
    const initialGameState = await program.account.gameState.fetch(gameStatePDA);

    await playerProgram.methods
      .flip(wager)
      .accounts({
        gameState: gameStatePDA,
        gameVault: gameVaultPDA,
        player: playerKeypair.publicKey,
        playerTokenAccount: playerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const finalPlayerBalance = await getAccount(provider.connection, playerTokenAccount);
    const finalGameState = await program.account.gameState.fetch(gameStatePDA);

    // Player should have lost the wager
    expect(Number(finalPlayerBalance.amount)).to.be.below(Number(initialPlayerBalance.amount));
    
    // Game state should be updated
    expect(finalGameState.flipCount.toNumber()).to.equal(1);
    
    // House balance should have increased
    expect(finalGameState.houseBalance.toNumber()).to.be.above(0);
  });

  it("Rejects flip larger than pot", async () => {
    const largeWager = new anchor.BN(200_000 * 1e9); // 200k tokens (larger than pot)
    
    const playerProvider = new anchor.AnchorProvider(
      provider.connection,
      new anchor.Wallet(playerKeypair),
      { commitment: "confirmed" }
    );
    const playerProgram = new anchor.Program(program.idl, program.programId, playerProvider);

    try {
      await playerProgram.methods
        .flip(largeWager)
        .accounts({
          gameState: gameStatePDA,
          gameVault: gameVaultPDA,
          player: playerKeypair.publicKey,
          playerTokenAccount: playerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      expect.fail("Should have thrown error for wager larger than pot");
    } catch (error) {
      expect(error.message).to.include("InsufficientPot");
    }
  });

  it("Allows authority to withdraw house balance", async () => {
    const gameState = await program.account.gameState.fetch(gameStatePDA);
    const houseBalance = gameState.houseBalance;
    
    if (houseBalance.toNumber() > 0) {
      const initialAuthorityBalance = await getAccount(provider.connection, authorityTokenAccount);

      await program.methods
        .withdrawHouseBalance(houseBalance)
        .accounts({
          gameState: gameStatePDA,
          gameVault: gameVaultPDA,
          authority: provider.wallet.publicKey,
          authorityTokenAccount: authorityTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      const finalAuthorityBalance = await getAccount(provider.connection, authorityTokenAccount);
      const finalGameState = await program.account.gameState.fetch(gameStatePDA);

      expect(Number(finalAuthorityBalance.amount)).to.be.above(Number(initialAuthorityBalance.amount));
      expect(finalGameState.houseBalance.toNumber()).to.equal(0);
    }
  });

  it("Rejects unauthorized operations", async () => {
    const playerProvider = new anchor.AnchorProvider(
      provider.connection,
      new anchor.Wallet(playerKeypair),
      { commitment: "confirmed" }
    );
    const playerProgram = new anchor.Program(program.idl, program.programId, playerProvider);

    try {
      await playerProgram.methods
        .withdrawHouseBalance(new anchor.BN(1))
        .accounts({
          gameState: gameStatePDA,
          gameVault: gameVaultPDA,
          authority: playerKeypair.publicKey,
          authorityTokenAccount: playerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      expect.fail("Should have thrown error for unauthorized withdrawal");
    } catch (error) {
      expect(error.message).to.include("constraint was violated");
    }
  });
});