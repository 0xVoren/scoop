//! Parity with dRaffle `close_entrants`: reclaim ShareBoard / BuyerRecord rent after terminal status.

use anchor_lang::prelude::*;

use crate::constants::{BUYER_SEED, RAFFLE_SEED, SHARES_SEED};
use crate::errors::ScoopError;
use crate::state::{BuyerRecord, Raffle, RaffleStatus, ShareBoard};

/// Close share board: only after Drawn or Expired; rent to `recipient` (usually creator).
pub fn close_share_board(ctx: Context<CloseShareBoard>) -> Result<()> {
    let status = ctx.accounts.raffle.status;
    require!(
        status == RaffleStatus::Drawn || status == RaffleStatus::Expired,
        ScoopError::InvalidConfig
    );
    Ok(())
}

/// Close buyer record: after refund, or after Drawn (no refund path).
pub fn close_buyer_record(ctx: Context<CloseBuyerRecord>) -> Result<()> {
    let status = ctx.accounts.raffle.status;
    let rec = &ctx.accounts.buyer_record;
    let ok = rec.refunded || status == RaffleStatus::Drawn;
    require!(ok, ScoopError::InvalidConfig);
    Ok(())
}

#[derive(Accounts)]
pub struct CloseShareBoard<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        mut,
        seeds = [SHARES_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = share_board.bump,
        constraint = share_board.raffle_id == raffle.raffle_id,
        close = recipient
    )]
    pub share_board: Account<'info, ShareBoard>,
}

#[derive(Accounts)]
pub struct CloseBuyerRecord<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: buyer pubkey (seed); need not be signer — rent goes to recipient (usually the buyer)
    /// recipient != buyer is still allowed (ops reclaim); product prefers buyer self-close.
    pub buyer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BUYER_SEED, raffle.raffle_id.to_le_bytes().as_ref(), buyer.key().as_ref()],
        bump = buyer_record.bump,
        constraint = buyer_record.raffle_id == raffle.raffle_id,
        constraint = buyer_record.buyer == buyer.key(),
        close = recipient
    )]
    pub buyer_record: Account<'info, BuyerRecord>,
}
