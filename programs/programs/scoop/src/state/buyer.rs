use anchor_lang::prelude::*;

/// Buyer accounting PDA — seeds: ["buyer", raffle_id.to_le_bytes(), buyer]
#[account]
#[derive(InitSpace)]
pub struct BuyerRecord {
    pub raffle_id: u64,
    pub buyer: Pubkey,
    pub paid: u64,
    pub share_count: u32,
    pub refunded: bool,
    pub bump: u8,
}
