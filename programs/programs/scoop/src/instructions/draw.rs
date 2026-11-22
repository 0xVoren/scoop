use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::slot_hashes;

use crate::constants::{winner_share_index, PENDING_SEED, RAFFLE_SEED, SHARES_SEED};
use crate::errors::ScoopError;
use crate::state::{PendingDraws, Raffle, RaffleStatus, ShareBoard};
use crate::utils::randomness::{expand_entropy, parse_slot_hashes, resolve_draw_slot};

/// Permissionless; dequeue pending on success. Anchors SlotHash at `eligible = sold_out + delay`.
pub fn handler(ctx: Context<Draw>) -> Result<()> {
    let clock = Clock::get()?;
    let raffle = &mut ctx.accounts.raffle;
    require!(raffle.status == RaffleStatus::SoldOut, ScoopError::NotSoldOut);

    let data = ctx.accounts.slot_hashes.try_borrow_data()?;
    let entries = parse_slot_hashes(&data)?;
    drop(data);

    let (draw_slot, hash) = resolve_draw_slot(
        raffle.sold_out_slot,
        raffle.draw_delay_slots,
        clock.slot,
        &entries,
    )?;

    let expanded = expand_entropy(&hash, raffle.raffle_id);
    let idx = winner_share_index(&expanded, raffle.total_shares);
    let winner = ctx.accounts.share_board.owners[idx as usize];
    require!(winner != Pubkey::default(), ScoopError::InvalidConfig);

    raffle.status = RaffleStatus::Drawn;
    raffle.draw_slot = draw_slot;
    raffle.winner_share_index = idx;

    ctx.accounts.pending.remove(raffle.raffle_id)?;

    msg!(
        "Drawn raffle={} slot={} winner_idx={} winner={}",
        raffle.raffle_id,
        draw_slot,
        idx,
        winner
    );
    Ok(())
}

/// Pure logic entry (tests): apply draw side-effects given state + SlotHashes entries.
pub fn apply_draw(
    raffle: &mut Raffle,
    share_board: &ShareBoard,
    pending: &mut PendingDraws,
    current_slot: u64,
    entries: &[crate::utils::randomness::SlotHashEntry],
) -> Result<(u32, u64, Pubkey)> {
    require!(raffle.status == RaffleStatus::SoldOut, ScoopError::NotSoldOut);
    let (draw_slot, hash) = resolve_draw_slot(
        raffle.sold_out_slot,
        raffle.draw_delay_slots,
        current_slot,
        entries,
    )?;
    let expanded = expand_entropy(&hash, raffle.raffle_id);
    let idx = winner_share_index(&expanded, raffle.total_shares);
    let winner = share_board.owners[idx as usize];
    raffle.status = RaffleStatus::Drawn;
    raffle.draw_slot = draw_slot;
    raffle.winner_share_index = idx;
    pending.remove(raffle.raffle_id)?;
    Ok((idx, draw_slot, winner))
}

#[derive(Accounts)]
pub struct Draw<'info> {
    /// Anyone may be payer/caller (no auth)
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        seeds = [SHARES_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = share_board.bump,
        constraint = share_board.raffle_id == raffle.raffle_id
    )]
    pub share_board: Account<'info, ShareBoard>,

    #[account(
        mut,
        seeds = [PENDING_SEED],
        bump = pending.bump
    )]
    pub pending: Account<'info, PendingDraws>,

    /// CHECK: SlotHashes sysvar
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
}
