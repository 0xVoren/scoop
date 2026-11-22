use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{
    is_native, CONFIG_SEED, MAX_DRAW_DELAY_SLOTS, MAX_SHARES, MIN_DRAW_DELAY_SLOTS, MIN_SHARES,
    RAFFLE_SEED, SHARES_SEED,
};
use crate::errors::ScoopError;
use crate::state::{Config, Raffle, RaffleStatus, ShareBoard};
use crate::utils::asset::{assert_classic_token_program, pull_native, pull_spl_checked};

pub fn handler(
    ctx: Context<CreateRaffle>,
    prize_mint: Pubkey,
    payment_mint: Pubkey,
    prize_amount: u64,
    price_per_share: u64,
    total_shares: u32,
    deadline: i64,
    draw_delay_slots: u32,
) -> Result<()> {
    require!(prize_amount > 0 && price_per_share > 0, ScoopError::InvalidAmount);
    require!(
        total_shares >= MIN_SHARES && total_shares <= MAX_SHARES,
        ScoopError::InvalidShares
    );

    let clock = Clock::get()?;
    require!(deadline > clock.unix_timestamp, ScoopError::InvalidDeadline);
    require!(
        draw_delay_slots >= MIN_DRAW_DELAY_SLOTS && draw_delay_slots <= MAX_DRAW_DELAY_SLOTS,
        ScoopError::InvalidDrawDelay
    );

    // Native SOL: pass Pubkey::default() in ix args (cannot attach default account on-chain)
    enforce_create_config(
        &ctx.accounts.config,
        &prize_mint,
        &payment_mint,
        prize_amount,
        price_per_share,
        total_shares,
        draw_delay_slots,
    )?;

    let raffle_id = ctx.accounts.config.next_raffle_id;
    ctx.accounts.config.next_raffle_id = raffle_id
        .checked_add(1)
        .ok_or(ScoopError::MathOverflow)?;

    let raffle = &mut ctx.accounts.raffle;
    raffle.raffle_id = raffle_id;
    raffle.creator = ctx.accounts.creator.key();
    raffle.prize_mint = prize_mint;
    raffle.payment_mint = payment_mint;
    raffle.prize_amount = prize_amount;
    raffle.price_per_share = price_per_share;
    raffle.total_shares = total_shares;
    raffle.sold_shares = 0;
    raffle.deadline = deadline;
    raffle.draw_delay_slots = draw_delay_slots;
    raffle.sold_out_slot = 0;
    raffle.draw_slot = 0;
    raffle.winner_share_index = 0;
    raffle.status = RaffleStatus::Selling;
    raffle.prize_claimed = false;
    raffle.proceeds_claimed = false;
    raffle.prize_recovered = false;
    raffle.bump = ctx.bumps.raffle;
    raffle.vault_bump = 0; // reserved; native escrow lives on the raffle account itself

    let board = &mut ctx.accounts.share_board;
    board.raffle_id = raffle_id;
    board.bump = ctx.bumps.share_board;
    board.owners = vec![Pubkey::default(); total_shares as usize];

    // Escrow prize (create is 0 fee) — native → raffle lamports; SPL → prize vault ATA
    if is_native(&prize_mint) {
        pull_native(
            &ctx.accounts.system_program,
            &ctx.accounts.creator,
            &ctx.accounts.raffle.to_account_info(),
            prize_amount,
        )?;
    } else {
        let token_program = ctx
            .accounts
            .token_program
            .as_ref()
            .ok_or(ScoopError::UnsupportedTokenProgram)?;
        assert_classic_token_program(&token_program.key())?;
        let from = ctx
            .accounts
            .creator_prize_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        let to = ctx
            .accounts
            .prize_vault_ata
            .as_mut()
            .ok_or(ScoopError::InvalidAmount)?;
        require_keys_eq!(to.owner, ctx.accounts.raffle.key());
        require_keys_eq!(to.mint, prize_mint);
        pull_spl_checked(
            &token_program.to_account_info(),
            &from.to_account_info(),
            to,
            &ctx.accounts.creator,
            prize_amount,
        )?;
    }

    msg!("RaffleCreated id={} shares={}", raffle_id, total_shares);
    Ok(())
}

/// Parity with EVM `_enforceCreateConfig`; callable from unit tests.
pub fn enforce_create_config(
    config: &Config,
    prize_mint: &Pubkey,
    payment_mint: &Pubkey,
    prize_amount: u64,
    price_per_share: u64,
    total_shares: u32,
    draw_delay_slots: u32,
) -> Result<()> {
    let cfg = &config.protocol_config;
    if !cfg.allow_different_tokens && prize_mint != payment_mint {
        return err!(ScoopError::TokenMismatch);
    }
    if !cfg.allow_custom_shares && total_shares != cfg.default_shares {
        return err!(ScoopError::SharesLocked);
    }
    if !cfg.allow_custom_price {
        if cfg.price_divisor == 0 {
            return err!(ScoopError::InvalidConfig);
        }
        if prize_amount % u64::from(cfg.price_divisor) != 0 {
            return err!(ScoopError::PriceLocked);
        }
        let expected = prize_amount / u64::from(cfg.price_divisor);
        if price_per_share != expected {
            return err!(ScoopError::PriceLocked);
        }
    }
    if !cfg.allow_custom_draw_delay && draw_delay_slots != cfg.default_draw_delay_slots {
        return err!(ScoopError::DrawDelayLocked);
    }
    Ok(())
}

#[derive(Accounts)]
#[instruction(
    prize_mint: Pubkey,
    payment_mint: Pubkey,
    prize_amount: u64,
    price_per_share: u64,
    total_shares: u32,
    deadline: i64,
    draw_delay_slots: u32
)]
pub struct CreateRaffle<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = creator,
        space = 8 + Raffle::INIT_SPACE,
        seeds = [RAFFLE_SEED, config.next_raffle_id.to_le_bytes().as_ref()],
        bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        init,
        payer = creator,
        space = ShareBoard::space(total_shares),
        seeds = [SHARES_SEED, config.next_raffle_id.to_le_bytes().as_ref()],
        bump
    )]
    pub share_board: Account<'info, ShareBoard>,

    #[account(mut)]
    pub creator_prize_ata: Option<Account<'info, TokenAccount>>,

    /// SPL prize vault ATA, authority = raffle PDA (caller pre-creates)
    #[account(mut)]
    pub prize_vault_ata: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>,
}
