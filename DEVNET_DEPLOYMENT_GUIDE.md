# Deploy Flip Game to Devnet - Step by Step

## Step 1: Use Solana Playground

1. **Go to [beta.solpg.io](https://beta.solpg.io/)**
2. **Create New Project** → Select "Anchor" 
3. **Set Network** → Top right corner, change to "Devnet"

## Step 2: Replace the Code

Replace the default `lib.rs` with your flip game code:

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg7VmsCYRxb3zfJSpJwtCkb3dQaQv8qR4pR5m4g1Kjv");

#[program]
pub mod flip_game {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.token_mint = ctx.accounts.token_mint.key();
        game_state.flip_count = 0;
        game_state.total_volume = 0;
        game_state.total_house_earnings = 0;
        
        msg!("FlipGame initialized");
        Ok(())
    }

    pub fn flip(ctx: Context<Flip>, wager: u64) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        
        require!(wager > 0, FlipError::InvalidWager);
        
        // Calculate house cut (2%)
        let house_cut = wager.checked_mul(2).unwrap().checked_div(100).unwrap();
        let net_wager = wager.checked_sub(house_cut).unwrap();
        
        // Calculate potential payout (2x net wager)
        let potential_payout = net_wager.checked_mul(2).unwrap();
        
        // Check vault has enough tokens for potential payout
        require!(ctx.accounts.vault_token_account.amount >= potential_payout, FlipError::InsufficientVault);

        // Transfer wager from player to vault (includes house cut)
        let transfer_wager_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        );
        token::transfer(transfer_wager_ctx, wager)?;

        // Generate pseudo-random result
        let clock = Clock::get()?;
        let random_seed = clock.unix_timestamp as u64;
        let player_key = ctx.accounts.player.key().to_bytes();
        let game_count = game_state.flip_count;
        
        let hash_input = [
            random_seed.to_le_bytes(),
            player_key[0..8].try_into().unwrap(),
            game_count.to_le_bytes(),
        ].concat();
        
        let hash = solana_program::keccak::hash(&hash_input);
        let won = hash.to_bytes()[0] % 2 == 0;

        if won {
            // Player wins - transfer payout from vault to player
            let seeds = &[b"vault".as_ref(), &[ctx.bumps.vault_authority]];
            let signer = &[&seeds[..]];
            
            let transfer_payout_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.player_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer,
            );
            token::transfer(transfer_payout_ctx, potential_payout)?;
            
            emit!(FlipResult {
                player: ctx.accounts.player.key(),
                wager,
                won: true,
                payout: potential_payout,
                house_cut,
            });
        } else {
            // Player loses - tokens stay in vault
            emit!(FlipResult {
                player: ctx.accounts.player.key(),
                wager,
                won: false,
                payout: 0,
                house_cut,
            });
        }

        // Update game state
        game_state.flip_count = game_state.flip_count.checked_add(1).unwrap();
        game_state.total_volume = game_state.total_volume.checked_add(wager).unwrap();
        game_state.total_house_earnings = game_state.total_house_earnings.checked_add(house_cut).unwrap();

        Ok(())
    }

    // Get current vault balance (read-only)
    pub fn get_vault_balance(ctx: Context<GetVaultBalance>) -> Result<u64> {
        Ok(ctx.accounts.vault_token_account.amount)
    }

    // Withdraw tokens from vault (admin only)
    pub fn withdraw_from_vault(ctx: Context<WithdrawFromVault>, amount: u64) -> Result<()> {
        require!(amount > 0, FlipError::InvalidWager);
        require!(ctx.accounts.vault_token_account.amount >= amount, FlipError::InsufficientVault);

        let seeds = &[b"vault".as_ref(), &[ctx.bumps.vault_authority]];
        let signer = &[&seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.destination_token_account.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            signer,
        );
        
        token::transfer(transfer_ctx, amount)?;
        
        msg!("Withdrawn {} tokens from vault", amount);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::LEN,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    
    /// CHECK: This is the token mint
    pub token_mint: AccountInfo<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Flip<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    
    #[account(
        mut,
        constraint = player_token_account.owner == player.key(),
        constraint = player_token_account.mint == game_state.token_mint
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = vault_token_account.mint == game_state.token_mint,
        constraint = vault_token_account.owner == vault_authority.key()
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: PDA authority for the vault
    #[account(
        seeds = [b"vault"],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct GetVaultBalance<'info> {
    #[account(
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(
        constraint = vault_token_account.mint == game_state.token_mint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct WithdrawFromVault<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump,
        constraint = game_state.authority == authority.key()
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = vault_token_account.mint == game_state.token_mint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: PDA authority for the vault
    #[account(
        seeds = [b"vault"],
        bump
    )]
    pub vault_authority: AccountInfo<'info>,
    
    #[account(
        mut,
        constraint = destination_token_account.mint == game_state.token_mint
    )]
    pub destination_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub flip_count: u64,
    pub total_volume: u64,
    pub total_house_earnings: u64,
}

impl GameState {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8; // authority + token_mint + flip_count + total_volume + total_house_earnings
}

#[event]
pub struct FlipResult {
    pub player: Pubkey,
    pub wager: u64,
    pub won: bool,
    pub payout: u64,
    pub house_cut: u64,
}

#[error_code]
pub enum FlipError {
    #[msg("Invalid wager amount")]
    InvalidWager,
    #[msg("Insufficient vault balance for potential payout")]
    InsufficientVault,
    #[msg("Arithmetic overflow")]
    Overflow,
}
```

## Step 3: Build and Deploy

1. **Build** → Click the build button (⚡) 
2. **Deploy** → Click deploy button 
3. **Copy the new Program ID** → It will show you the deployed program ID

## Step 4: Update Frontend

Update `frontend/contract.js` with the new Program ID from Solana Playground.

## Step 5: Create Devnet Test Token

You'll need a test token on devnet. You can:
1. Create one using `spl-token create-token` on devnet
2. Or use an existing devnet test token

## Step 6: Test Full Flow

1. Get some test tokens
2. Send tokens to vault
3. Play the game 
4. Verify automatic payouts work!

Once this works on devnet, we can deploy to mainnet with confidence.