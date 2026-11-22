use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{is_native, PENDING_SEED, RAFFLE_SEED};
use crate::errors::ScoopError;
use crate::instructions::refund::ensure_expired;
use crate::state::{PendingDraws, Raffle};
use crate::utils::asset::{assert_classic_token_program, push_native, push_spl_signed};

/// Expired prize recovery: creator takes full amount once; 0 fee.
pub fn handler(ctx: Context<RecoverPrize>) -> Result<()> {
    let clock = Clock::get()?;
    let raffle = &mut ctx.accounts.raffle;
    ensure_expired(
        raffle,
        clock.unix_timestamp,
        clock.slot,
        Some(&mut ctx.accounts.pending),
    )?;
    require_keys_eq!(
        ctx.accounts.creator.key(),
        raffle.creator,
        ScoopError::NotCreator
    );
    require!(!raffle.prize_recovered, ScoopError::PrizeAlreadyRecovered);

    raffle.prize_recovered = true;
    let amount = raffle.prize_amount;
    let prize_mint = raffle.prize_mint;
    let raffle_id = raffle.raffle_id;
    let bump = raffle.bump;
    let seeds: &[&[u8]] = &[RAFFLE_SEED, &raffle_id.to_le_bytes(), &[bump]];
    let signer = &[seeds];

    if is_native(&prize_mint) {
        push_native(
            &ctx.accounts.raffle.to_account_info(),
            &ctx.accounts.creator.to_account_info(),
            amount,
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
            .prize_vault_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        let to = ctx
            .accounts
            .creator_prize_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        require_keys_eq!(from.owner, raffle.key());
        require_keys_eq!(from.mint, prize_mint);
        require_keys_eq!(to.mint, prize_mint);
        push_spl_signed(
            &token_program.to_account_info(),
            &from.to_account_info(),
            &to.to_account_info(),
            &ctx.accounts.raffle.to_account_info(),
            amount,
            signer,
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct RecoverPrize<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        mut,
        seeds = [PENDING_SEED],
        bump = pending.bump
    )]
    pub pending: Account<'info, PendingDraws>,

    #[account(mut)]
    pub prize_vault_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub creator_prize_ata: Option<Account<'info, TokenAccount>>,
    pub token_program: Option<Program<'info, Token>>,
}
