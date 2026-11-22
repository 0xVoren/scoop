use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::slot_hashes;

use crate::constants::{winner_share_index, PENDING_SEED};
use crate::errors::ScoopError;
use crate::state::{PendingDraws, Raffle, RaffleStatus, ShareBoard};
use crate::utils::randomness::{expand_entropy, parse_slot_hashes, resolve_draw_slot};

/// Batch draw: remaining_accounts = [raffle_0, share_board_0, raffle_1, share_board_1, ...]
/// Default strategy (invariants §1.4): try each; skip not-ready / entropy-expired; dequeue successes.
/// Keeper should stop retrying draw on entropy-expired raffles; users use refund/recover.
pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, DrawMany<'info>>) -> Result<()> {
    require!(
        ctx.remaining_accounts.len() % 2 == 0,
        ScoopError::InvalidConfig
    );

    let clock = Clock::get()?;
    let data = ctx.accounts.slot_hashes.try_borrow_data()?;
    let entries = parse_slot_hashes(&data)?;
    drop(data);

    let pending = &mut ctx.accounts.pending;
    let pairs = ctx.remaining_accounts.len() / 2;

    for i in 0..pairs {
        let raffle_info = &ctx.remaining_accounts[i * 2];
        let board_info = &ctx.remaining_accounts[i * 2 + 1];

        let mut raffle_data = raffle_info.try_borrow_mut_data()?;
        // try_deserialize expects the 8-byte Anchor discriminator prefix
        let mut raffle: Raffle = AccountDeserialize::try_deserialize(&mut raffle_data.as_ref())
            .map_err(|_| error!(ScoopError::InvalidConfig))?;

        if raffle.status != RaffleStatus::SoldOut {
            continue;
        }

        match resolve_draw_slot(
            raffle.sold_out_slot,
            raffle.draw_delay_slots,
            clock.slot,
            &entries,
        ) {
            Err(e) => {
                // Skip not-ready / missing hash / entropy-expired (latter belongs on refund path; don't block batch)
                let msg = e.to_string();
                if msg.contains("DrawTooEarly")
                    || msg.contains("too early")
                    || msg.contains("NoSlotHash")
                    || msg.contains("No usable")
                    || msg.contains("DrawEntropyExpired")
                    || msg.contains("entropy")
                {
                    continue;
                }
                return Err(e);
            }
            Ok((draw_slot, hash)) => {
                let board_data = board_info.try_borrow_data()?;
                let board: ShareBoard = AccountDeserialize::try_deserialize(&mut board_data.as_ref())
                    .map_err(|_| error!(ScoopError::InvalidConfig))?;
                drop(board_data);

                if board.raffle_id != raffle.raffle_id {
                    continue;
                }
                let expanded = expand_entropy(&hash, raffle.raffle_id);
                let idx = winner_share_index(&expanded, raffle.total_shares);
                raffle.status = RaffleStatus::Drawn;
                raffle.draw_slot = draw_slot;
                raffle.winner_share_index = idx;

                // try_serialize writes discriminator + body; needs full account buffer
                let mut cursor = std::io::Cursor::new(&mut raffle_data[..]);
                raffle.try_serialize(&mut cursor)?;
                drop(raffle_data);

                let _ = pending.remove(raffle.raffle_id);
                msg!("draw_many ok id={} slot={}", raffle.raffle_id, draw_slot);
            }
        }
    }

    Ok(())
}

#[derive(Accounts)]
pub struct DrawMany<'info> {
    pub caller: Signer<'info>,

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
