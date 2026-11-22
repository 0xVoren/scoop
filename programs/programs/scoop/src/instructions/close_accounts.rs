//! Terminal-state rent reclaim for ShareBoard / BuyerRecord.
//!
//! **Permission model:** only `Config.authority` may close. Rent goes to an
//! authority-chosen `recipient` (typically fee_recipient or authority itself).
//! Buyers and strangers cannot close — preserves Me-listing BuyerRecords until
//! protocol ops explicitly reclaim after retention / settled paths.

use anchor_lang::prelude::*;

use crate::constants::{BUYER_SEED, CONFIG_SEED, RAFFLE_SEED, SHARES_SEED};
use crate::errors::ScoopError;
use crate::state::{BuyerRecord, Config, Raffle, RaffleStatus, ShareBoard};

/// Pure gate: ShareBoard close only after Drawn or Expired.
pub fn share_board_close_allowed(status: RaffleStatus) -> bool {
    status == RaffleStatus::Drawn || status == RaffleStatus::Expired
}

/// Pure gate: BuyerRecord close after buyer refunded, or raffle Drawn.
/// Authority still must sign; Me listing depends on records existing until ops reclaim.
pub fn buyer_record_close_allowed(status: RaffleStatus, refunded: bool) -> bool {
    refunded || status == RaffleStatus::Drawn
}

/// Close share board: Drawn/Expired + Config.authority signer; rent → recipient.
pub fn close_share_board(ctx: Context<CloseShareBoard>) -> Result<()> {
    require!(
        share_board_close_allowed(ctx.accounts.raffle.status),
        ScoopError::InvalidConfig
    );
    Ok(())
}

/// Close buyer record: refunded|Drawn + Config.authority signer; rent → recipient.
pub fn close_buyer_record(ctx: Context<CloseBuyerRecord>) -> Result<()> {
    let status = ctx.accounts.raffle.status;
    let refunded = ctx.accounts.buyer_record.refunded;
    require!(
        buyer_record_close_allowed(status, refunded),
        ScoopError::InvalidConfig
    );
    Ok(())
}

#[derive(Accounts)]
pub struct CloseShareBoard<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ScoopError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    /// CHECK: rent destination chosen by authority (ops); need not sign.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

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
    pub authority: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ScoopError::Unauthorized
    )]
    pub config: Account<'info, Config>,

    /// CHECK: rent destination chosen by authority (ops); need not sign.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    #[account(
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: buyer pubkey seed only — buyer need not sign; cannot reclaim rent.
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
