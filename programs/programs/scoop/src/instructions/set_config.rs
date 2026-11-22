use anchor_lang::prelude::*;

use crate::constants::{
    CONFIG_SEED, MAX_DRAW_DELAY_SLOTS, MAX_SHARES, MIN_DRAW_DELAY_SLOTS, MIN_SHARES,
};
use crate::errors::ScoopError;
use crate::state::{Config, ProtocolConfig};

pub fn set_fee_recipient(ctx: Context<SetFeeRecipient>, fee_recipient: Pubkey) -> Result<()> {
    require!(
        fee_recipient != Pubkey::default(),
        ScoopError::InvalidFeeRecipient
    );
    ctx.accounts.config.fee_recipient = fee_recipient;
    Ok(())
}

pub fn set_protocol_config(ctx: Context<SetProtocolConfig>, protocol_config: ProtocolConfig) -> Result<()> {
    if protocol_config.price_divisor == 0 {
        return err!(ScoopError::InvalidConfig);
    }
    if !(MIN_SHARES..=MAX_SHARES).contains(&protocol_config.default_shares) {
        return err!(ScoopError::InvalidConfig);
    }
    if !(MIN_DRAW_DELAY_SLOTS..=MAX_DRAW_DELAY_SLOTS)
        .contains(&protocol_config.default_draw_delay_slots)
    {
        return err!(ScoopError::InvalidConfig);
    }
    ctx.accounts.config.protocol_config = protocol_config;
    Ok(())
}

#[derive(Accounts)]
pub struct SetFeeRecipient<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ScoopError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct SetProtocolConfig<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ScoopError::Unauthorized
    )]
    pub config: Account<'info, Config>,
}
