use anchor_lang::prelude::*;

/// Share ownership board PDA — seeds: ["shares", raffle_id.to_le_bytes()]
/// Created with `owners` preallocated to `total_shares` (Pubkey::default = unsold).
#[account]
pub struct ShareBoard {
    pub raffle_id: u64,
    pub bump: u8,
    /// Length = total_shares; buyer at index i
    pub owners: Vec<Pubkey>,
}

impl ShareBoard {
    pub fn space(total_shares: u32) -> usize {
        8 + // discriminator
        8 + // raffle_id
        1 + // bump
        4 + // vec len
        (total_shares as usize) * 32
    }
}
