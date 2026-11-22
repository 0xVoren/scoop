use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{is_native, protocol_fee, CONFIG_SEED, RAFFLE_SEED};
use crate::errors::ScoopError;
use crate::state::{Config, Raffle, RaffleStatus};
use crate::utils::asset::{assert_classic_token_program, push_native, push_spl_signed};

/// Creator claims proceeds: fee = raised/100 → fee_recipient; remainder → creator.
pub fn handler(ctx: Context<ClaimProceeds>) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle;
    require!(raffle.status == RaffleStatus::Drawn, ScoopError::NotDrawn);
    require_keys_eq!(
        ctx.accounts.creator.key(),
        raffle.creator,
        ScoopError::NotCreator
    );
    require!(!raffle.proceeds_claimed, ScoopError::ProceedsAlreadyClaimed);

    raffle.proceeds_claimed = true;

    let raised = (raffle.price_per_share as u128)
        .checked_mul(raffle.total_shares as u128)
        .ok_or(ScoopError::MathOverflow)? as u64;
    let fee = protocol_fee(raised);
    let creator_amount = raised.checked_sub(fee).ok_or(ScoopError::MathOverflow)?;

    let payment_mint = raffle.payment_mint;
    let raffle_id = raffle.raffle_id;
    let bump = raffle.bump;
    let seeds: &[&[u8]] = &[RAFFLE_SEED, &raffle_id.to_le_bytes(), &[bump]];
    let signer = &[seeds];

    if is_native(&payment_mint) {
        if fee > 0 {
            push_native(
                &ctx.accounts.raffle.to_account_info(),
                &ctx.accounts.fee_recipient.to_account_info(),
                fee,
            )?;
        }
        push_native(
            &ctx.accounts.raffle.to_account_info(),
            &ctx.accounts.creator.to_account_info(),
            creator_amount,
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
        let fee_ata = ctx
            .accounts
            .fee_recipient_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        let creator_ata = ctx
            .accounts
            .creator_payment_ata
            .as_ref()
            .ok_or(ScoopError::InvalidAmount)?;
        require_keys_eq!(from.owner, raffle.key());
        require_keys_eq!(from.mint, payment_mint);
        require_keys_eq!(fee_ata.mint, payment_mint);
        require_keys_eq!(creator_ata.mint, payment_mint);
        if fee > 0 {
            push_spl_signed(
                &token_program.to_account_info(),
                &from.to_account_info(),
                &fee_ata.to_account_info(),
                &ctx.accounts.raffle.to_account_info(),
                fee,
                signer,
            )?;
        }
        push_spl_signed(
            &token_program.to_account_info(),
            &from.to_account_info(),
            &creator_ata.to_account_info(),
            &ctx.accounts.raffle.to_account_info(),
            creator_amount,
            signer,
        )?;
    }

    Ok(())
}

/// Pure helper: compute fee and creator share (tests)
pub fn split_proceeds(raised: u64) -> (u64, u64) {
    let fee = protocol_fee(raised);
    (fee, raised.saturating_sub(fee))
}

#[derive(Accounts)]
pub struct ClaimProceeds<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [RAFFLE_SEED, raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: must equal config.fee_recipient
    #[account(
        mut,
        constraint = fee_recipient.key() == config.fee_recipient @ ScoopError::InvalidFeeRecipient
    )]
    pub fee_recipient: UncheckedAccount<'info>,

    #[account(mut)]
    pub payment_vault_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_recipient_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub creator_payment_ata: Option<Account<'info, TokenAccount>>,
    pub token_program: Option<Program<'info, Token>>,
}
