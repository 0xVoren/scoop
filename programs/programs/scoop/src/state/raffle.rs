use anchor_lang::prelude::*;

/// Lifecycle — parity with EVM `RaffleStatus`
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum RaffleStatus {
    Selling,
    SoldOut,
    Drawn,
    Expired,
}

/// Per-raffle PDA — seeds: ["raffle", raffle_id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Raffle {
    pub raffle_id: u64,
    pub creator: Pubkey,
    /// Prize mint; `Pubkey::default()` = native SOL
    pub prize_mint: Pubkey,
    /// Payment mint; may differ from prize_mint
    pub payment_mint: Pubkey,
    pub prize_amount: u64,
    pub price_per_share: u64,
    pub total_shares: u32,
    pub sold_shares: u32,
    /// Unix deadline; unsold after deadline may refund
    pub deadline: i64,
    pub draw_delay_slots: u32,
    pub sold_out_slot: u64,
    pub draw_slot: u64,
    pub winner_share_index: u32,
    pub status: RaffleStatus,
    pub prize_claimed: bool,
    pub proceeds_claimed: bool,
    pub prize_recovered: bool,
    pub bump: u8,
    /// vault PDA bump (holds native lamports / SPL vault authority)
    pub vault_bump: u8,
}
