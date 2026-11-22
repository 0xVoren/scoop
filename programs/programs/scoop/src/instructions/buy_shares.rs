use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{is_native, BUYER_SEED, PENDING_SEED, RAFFLE_SEED, SHARES_SEED};
use crate::errors::ScoopError;
use crate::state::{BuyerRecord, PendingDraws, Raffle, RaffleStatus, ShareBoard};
use crate::utils::asset::{assert_classic_token_program, pull_native, pull_spl_checked};

pub fn handler(ctx: Context<BuyShares>, count: u32) -> Result<()> {
    require!(count > 0, ScoopError::InvalidAmount);

    let clock = Clock::get()?;
    let raffle = &mut ctx.accounts.raffle;

    require!(raffle.status == RaffleStatus::Selling, ScoopError::NotSelling);
    require!(clock.unix_timestamp <= raffle.deadline, ScoopError::DeadlinePassed);
    require!(
        raffle
            .sold_shares
            .checked_add(count)
            .ok_or(ScoopError::MathOverflow)?
            <= raffle.total_shares,
        ScoopError::InsufficientShares
    );

    let start = raffle.sold_shares;
    let buyer = ctx.accounts.buyer.key();
    let board = &mut ctx.accounts.share_board;
    for i in 0..count {
        let idx = (start + i) as usize;
        board.owners[idx] = buyer;
    }
    raffle.sold_shares = start + count;

    let paid = (raffle.price_per_share as u128)
        .checked_mul(count as u128)
        .ok_or(ScoopError::MathOverflow)? as u64;

    let buyer_rec = &mut ctx.accounts.buyer_record;
    if buyer_rec.buyer == Pubkey::default() {
        buyer_rec.raffle_id = raffle.raffle_id;
        buyer_rec.buyer = buyer;
        buyer_rec.paid = 0;
        buyer_rec.share_count = 0;
        buyer_rec.refunded = false;
        buyer_rec.bump = ctx.bumps.buyer_record;
    }
    buyer_rec.paid = buyer_rec
        .paid
        .checked_add(paid)
        .ok_or(ScoopError::MathOverflow)?;
    buyer_rec.share_count = buyer_rec
        .share_count
        .checked_add(count)
        .ok_or(ScoopError::MathOverflow)?;

    let sold_out = raffle.sold_shares == raffle.total_shares;
    if sold_out {
        raffle.status = RaffleStatus::SoldOut;
        raffle.sold_out_slot = clock.slot;
        // Enqueue pending; client may need to pre-resize
        let pending = &mut ctx.accounts.pending;
        let before = pending.raffle_ids.len();
        pending.add(raffle.raffle_id);
        if pending.raffle_ids.len() > before {
            // On short space, caller pre-resizes client-side (AccountInfo::resize); assert writable here
            let need = PendingDraws::space(pending.raffle_ids.len());
            let info = pending.to_account_info();
            require!(info.data_len() >= need, ScoopError::InvalidConfig);
        }
    }

    let payment_mint = raffle.payment_mint;
    if is_native(&payment_mint) {
        pull_native(
            &ctx.accounts.system_program,
            &ctx.accounts.buyer,
            &raffle.to_account_info(),
            paid,
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
            .buyer_payment_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        let to = ctx
            .accounts
            .payment_vault_ata
            .as_mut()
            .ok_or(ScoopError::InvalidAmount)?;
        require_keys_eq!(to.owner, raffle.key());
        require_keys_eq!(to.mint, payment_mint);
        require_keys_eq!(from.mint, payment_mint);
        pull_spl_checked(
            &token_program.to_account_info(),
            &from.to_account_info(),
            to,
            &ctx.accounts.buyer,
            paid,
        )?;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct BuyShares<'info> {
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
        seeds = [SHARES_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = share_board.bump,
        constraint = share_board.raffle_id == raffle.raffle_id
    )]
    pub share_board: Account<'info, ShareBoard>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + BuyerRecord::INIT_SPACE,
        seeds = [BUYER_SEED, raffle.raffle_id.to_le_bytes().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub buyer_record: Account<'info, BuyerRecord>,

    #[account(
        mut,
        seeds = [PENDING_SEED],
        bump = pending.bump
    )]
    pub pending: Account<'info, PendingDraws>,

    #[account(mut)]
    pub buyer_payment_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub payment_vault_ata: Option<Account<'info, TokenAccount>>,

    pub token_program: Option<Program<'info, Token>>,
    pub system_program: Program<'info, System>,
}
