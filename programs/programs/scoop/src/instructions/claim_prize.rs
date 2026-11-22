use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::constants::{is_native, RAFFLE_SEED, SHARES_SEED};
use crate::errors::ScoopError;
use crate::state::{Raffle, RaffleStatus, ShareBoard};
use crate::utils::asset::{assert_classic_token_program, push_native, push_spl_signed};

/// Winner claims 100% of prize; 0 fee on prize side.
pub fn handler(ctx: Context<ClaimPrize>) -> Result<()> {
    let raffle = &mut ctx.accounts.raffle;
    require!(raffle.status == RaffleStatus::Drawn, ScoopError::NotDrawn);
    require!(!raffle.prize_claimed, ScoopError::PrizeAlreadyClaimed);

    let winner = ctx.accounts.share_board.owners[raffle.winner_share_index as usize];
    require_keys_eq!(ctx.accounts.winner.key(), winner, ScoopError::NotWinner);

    raffle.prize_claimed = true;
    let amount = raffle.prize_amount;
    let prize_mint = raffle.prize_mint;
    let raffle_id = raffle.raffle_id;
    let bump = raffle.bump;

    let seeds: &[&[u8]] = &[RAFFLE_SEED, &raffle_id.to_le_bytes(), &[bump]];
    let signer = &[seeds];

    if is_native(&prize_mint) {
        push_native(
            &ctx.accounts.raffle.to_account_info(),
            &ctx.accounts.winner.to_account_info(),
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
            .winner_prize_ata
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
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

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

    #[account(mut)]
    pub prize_vault_ata: Option<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub winner_prize_ata: Option<Account<'info, TokenAccount>>,
    pub token_program: Option<Program<'info, Token>>,
}
