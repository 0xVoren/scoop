use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{is_native, BUYER_SEED, PENDING_SEED, RAFFLE_SEED};
use crate::errors::ScoopError;
use crate::state::{BuyerRecord, PendingDraws, Raffle, RaffleStatus};
use crate::utils::asset::{assert_classic_token_program, push_native, push_spl_signed};
use crate::utils::randomness::{is_draw_entropy_expired, SLOT_HASHES_RETENTION};

/// Expired refund: lazy Selling→Expired, or SoldOut entropy-expired→Expired; full paid refund; 0 fee.
pub fn handler(ctx: Context<Refund>) -> Result<()> {
    let clock = Clock::get()?;
    let raffle = &mut ctx.accounts.raffle;
    ensure_expired(
        raffle,
        clock.unix_timestamp,
        clock.slot,
        Some(&mut ctx.accounts.pending),
    )?;

    let buyer_rec = &mut ctx.accounts.buyer_record;
    require!(buyer_rec.paid > 0, ScoopError::NothingToRefund);
    require!(!buyer_rec.refunded, ScoopError::AlreadyRefunded);

    buyer_rec.refunded = true;
    let amount = buyer_rec.paid;
    let payment_mint = raffle.payment_mint;
    let raffle_id = raffle.raffle_id;
    let bump = raffle.bump;
    let seeds: &[&[u8]] = &[RAFFLE_SEED, &raffle_id.to_le_bytes(), &[bump]];
    let signer = &[seeds];

    if is_native(&payment_mint) {
        push_native(
            &ctx.accounts.raffle.to_account_info(),
            &ctx.accounts.buyer.to_account_info(),
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
            .payment_vault_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        let to = ctx
            .accounts
            .buyer_payment_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        require_keys_eq!(from.owner, raffle.key());
        require_keys_eq!(from.mint, payment_mint);
        require_keys_eq!(to.mint, payment_mint);
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

/// Lazy expire: parity with EVM `_ensureExpired` (includes SoldOut entropy expiry).
///
/// `current_slot` decides SlotHashes window exit; without sysvar use `SLOT_HASHES_RETENTION`.
pub fn ensure_expired(
    raffle: &mut Raffle,
    now: i64,
    current_slot: u64,
    pending: Option<&mut PendingDraws>,
) -> Result<()> {
    if raffle.creator == Pubkey::default() {
        return err!(ScoopError::NotExpired);
    }

    // Already Expired (deadline or entropy) — allow further refunds / recover.
    if raffle.status == RaffleStatus::Expired {
        return Ok(());
    }

    if raffle.status == RaffleStatus::SoldOut {
        let expired = is_draw_entropy_expired(
            raffle.sold_out_slot,
            raffle.draw_delay_slots,
            current_slot,
            None,
        )?;
        require!(expired, ScoopError::NotExpired);
        raffle.status = RaffleStatus::Expired;
        if let Some(p) = pending {
            if p.contains(raffle.raffle_id) {
                p.remove(raffle.raffle_id)?;
            }
        }
        return Ok(());
    }

    if now <= raffle.deadline {
        return err!(ScoopError::NotExpired);
    }
    if raffle.status == RaffleStatus::Drawn {
        return err!(ScoopError::NotExpired);
    }
    if raffle.status == RaffleStatus::Selling {
        raffle.status = RaffleStatus::Expired;
    } else {
        return err!(ScoopError::NotExpired);
    }
    Ok(())
}

/// Test helper: expose retention length
pub fn slot_hashes_retention() -> u64 {
    SLOT_HASHES_RETENTION
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        mut,
        seeds = [BUYER_SEED, raffle.raffle_id.to_le_bytes().as_ref(), buyer.key().as_ref()],
        bump = buyer_record.bump,
        constraint = buyer_record.buyer == buyer.key(),
        constraint = buyer_record.raffle_id == raffle.raffle_id
    )]
    pub buyer_record: Account<'info, BuyerRecord>,

    /// Dequeue on SoldOut→Expired; Selling expire path also passes this (no-op)
    #[account(
        mut,
        seeds = [PENDING_SEED],
        bump = pending.bump
    )]
    pub pending: Account<'info, PendingDraws>,

    #[account(mut)]
    pub payment_vault_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub buyer_payment_ata: Option<Account<'info, TokenAccount>>,
    pub token_program: Option<Program<'info, Token>>,
}
