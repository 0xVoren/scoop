//! Asset escrow: native SOL (lamports) and classic SPL Token; no auto wrap/unwrap.
//!
//! - **Supported**: native SOL, classic SPL Token Program mints
//! - **Unsupported**: Token-2022 (transfer-fee / freeze extensions), fee-on-transfer
//!   style (vault delta check rejects short credits), pause-mutated mid-flow mints

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, TokenAccount, Transfer};

use crate::constants::is_native;
use crate::errors::ScoopError;

/// Pull from payer into vault (native = System transfer; SPL = Token transfer)
pub fn pull_native<'info>(
    system_program: &Program<'info, System>,
    from: &Signer<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return err!(ScoopError::InvalidAmount);
    }
    system_program::transfer(
        CpiContext::new(
            system_program.to_account_info(),
            system_program::Transfer {
                from: from.to_account_info(),
                to: to.clone(),
            },
        ),
        amount,
    )?;
    Ok(())
}

pub fn pull_spl<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return err!(ScoopError::InvalidAmount);
    }
    token::transfer(
        CpiContext::new(
            token_program.clone(),
            Transfer {
                from: from.clone(),
                to: to.clone(),
                authority: authority.to_account_info(),
            },
        ),
        amount,
    )?;
    Ok(())
}

/// SPL pull + vault balance-delta check; short credit from fee-on-transfer → `TransferAmountMismatch`.
pub fn pull_spl_checked<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    to: &mut Account<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    let before = to.amount;
    pull_spl(
        token_program,
        from,
        &to.to_account_info(),
        authority,
        amount,
    )?;
    to.reload()?;
    let received = to
        .amount
        .checked_sub(before)
        .ok_or(ScoopError::MathOverflow)?;
    require!(received == amount, ScoopError::TransferAmountMismatch);
    Ok(())
}

/// vault → recipient (native: adjust lamports; keep rent-exempt)
pub fn push_native(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let from_lamports = from.lamports();
    require!(from_lamports >= amount, ScoopError::NativeAmountMismatch);
    **from.try_borrow_mut_lamports()? = from_lamports
        .checked_sub(amount)
        .ok_or(ScoopError::MathOverflow)?;
    **to.try_borrow_mut_lamports()? = to
        .lamports()
        .checked_add(amount)
        .ok_or(ScoopError::MathOverflow)?;
    Ok(())
}

pub fn push_spl_signed<'info>(
    token_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(
            token_program.clone(),
            Transfer {
                from: from.clone(),
                to: to.clone(),
                authority: authority.clone(),
            },
            signer_seeds,
        ),
        amount,
    )?;
    Ok(())
}

pub fn assert_classic_token_program(program_id: &Pubkey) -> Result<()> {
    require_keys_eq!(
        *program_id,
        anchor_spl::token::ID,
        ScoopError::UnsupportedTokenProgram
    );
    Ok(())
}

pub fn require_mint_path(mint: &Pubkey) -> bool {
    is_native(mint)
}
