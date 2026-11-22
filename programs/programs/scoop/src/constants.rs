//! Protocol constants — numeric parity with EVM `LibConstants` and invariants table.

use anchor_lang::prelude::Pubkey;

/// fee = raised / FEE_DENOMINATOR (claim_proceeds only)
pub const FEE_DENOMINATOR: u64 = 100;

pub const MIN_SHARES: u32 = 2;
pub const MAX_SHARES: u32 = 10_000;

pub const MIN_DRAW_DELAY_SLOTS: u32 = 1;
pub const MAX_DRAW_DELAY_SLOTS: u32 = 128;

/// Launch defaults (forced when allow_* = false)
pub const LAUNCH_SHARES: u32 = 11;
pub const LAUNCH_PRICE_DIVISOR: u32 = 10;
pub const LAUNCH_DRAW_DELAY_SLOTS: u32 = 5;

/// Native SOL sentinel mint = Pubkey::default() (all-zero), cf. EVM address(0)
pub fn native_mint() -> Pubkey {
    Pubkey::default()
}

/// PDA seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const PENDING_SEED: &[u8] = b"pending";
pub const RAFFLE_SEED: &[u8] = b"raffle";
pub const SHARES_SEED: &[u8] = b"shares";
pub const BUYER_SEED: &[u8] = b"buyer";

/// Winner share index: `u64::from_le_bytes(hash[0..8]) % total_shares`
/// Winner index byte order is fixed little-endian (see invariants §1.2).
pub fn winner_share_index(hash: &[u8; 32], total_shares: u32) -> u32 {
    debug_assert!(total_shares > 0);
    let mut buf = [0u8; 8];
    buf.copy_from_slice(&hash[0..8]);
    let n = u64::from_le_bytes(buf);
    (n % u64::from(total_shares)) as u32
}

/// Protocol fee: raised / 100; raised < 100 → 0
pub fn protocol_fee(raised: u64) -> u64 {
    raised / FEE_DENOMINATOR
}

/// Whether this is the native SOL path (sentinel mint)
pub fn is_native(mint: &Pubkey) -> bool {
    *mint == Pubkey::default()
}
