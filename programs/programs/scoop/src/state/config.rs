use anchor_lang::prelude::*;

use crate::constants::{LAUNCH_DRAW_DELAY_SLOTS, LAUNCH_PRICE_DIVISOR, LAUNCH_SHARES};

/// Global config PDA — seeds: ["config"]
/// `next_raffle_id` starts at 1 after initialize.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    /// Next allocatable raffle_id (1 after initialize)
    pub next_raffle_id: u64,
    pub protocol_config: ProtocolConfig,
    pub bump: u8,
}

/// Progressive unlock flags — parity with EVM `ProtocolConfig`
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace)]
pub struct ProtocolConfig {
    pub allow_different_tokens: bool,
    pub allow_custom_shares: bool,
    pub allow_custom_price: bool,
    pub allow_custom_draw_delay: bool,
    pub default_shares: u32,
    pub price_divisor: u32,
    pub default_draw_delay_slots: u32,
}

impl Default for ProtocolConfig {
    fn default() -> Self {
        Self {
            allow_different_tokens: false,
            allow_custom_shares: false,
            allow_custom_price: false,
            allow_custom_draw_delay: false,
            default_shares: LAUNCH_SHARES,
            price_divisor: LAUNCH_PRICE_DIVISOR,
            default_draw_delay_slots: LAUNCH_DRAW_DELAY_SLOTS,
        }
    }
}
