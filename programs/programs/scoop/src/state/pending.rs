use anchor_lang::prelude::*;

use crate::errors::ScoopError;

/// Enumerable pending-draw set — seeds: ["pending"]
/// Keeper scans `raffle_ids` here, then reads each Raffle PDA for `eligible_slot = sold_out_slot + draw_delay_slots`.
#[account]
pub struct PendingDraws {
    pub bump: u8,
    pub raffle_ids: Vec<u64>,
}

impl PendingDraws {
    /// Initial space: discriminator + bump + vec header + reserved ids
    pub const INIT_RESERVE: usize = 64;
    pub fn space(capacity: usize) -> usize {
        8 + 1 + 4 + capacity * 8
    }

    pub fn contains(&self, raffle_id: u64) -> bool {
        self.raffle_ids.contains(&raffle_id)
    }

    pub fn add(&mut self, raffle_id: u64) {
        if self.contains(raffle_id) {
            return;
        }
        self.raffle_ids.push(raffle_id);
    }

    /// swap-remove, parity with EVM `pendingDrawRemove`
    pub fn remove(&mut self, raffle_id: u64) -> Result<()> {
        let Some(idx) = self.raffle_ids.iter().position(|&id| id == raffle_id) else {
            return err!(ScoopError::NotPendingDraw);
        };
        let last = self.raffle_ids.len() - 1;
        self.raffle_ids.swap(idx, last);
        self.raffle_ids.pop();
        Ok(())
    }
}
