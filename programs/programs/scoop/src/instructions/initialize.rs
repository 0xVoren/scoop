use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, PENDING_SEED};
use crate::errors::ScoopError;
use crate::state::{Config, PendingDraws, ProtocolConfig};

pub fn handler(
    ctx: Context<Initialize>,
    fee_recipient: Pubkey,
    protocol_config: ProtocolConfig,
) -> Result<()> {
    require!(
        fee_recipient != Pubkey::default(),
        ScoopError::InvalidFeeRecipient
    );
    if protocol_config.price_divisor == 0 {
        return err!(ScoopError::InvalidConfig);
    }

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.fee_recipient = fee_recipient;
    config.next_raffle_id = 1;
    config.protocol_config = protocol_config;
    config.bump = ctx.bumps.config;

    let pending = &mut ctx.accounts.pending;
    pending.bump = ctx.bumps.pending;
    pending.raffle_ids = Vec::new();

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = PendingDraws::space(PendingDraws::INIT_RESERVE),
        seeds = [PENDING_SEED],
        bump
    )]
    pub pending: Account<'info, PendingDraws>,

    pub system_program: Program<'info, System>,
}
