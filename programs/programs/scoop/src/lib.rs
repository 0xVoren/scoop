//! Scoop Solana program — product parity with the EVM Diamond (see `docs/invariants-evm-solana.md`).
//!
//! Randomness: SlotHashes (no VRF)
//! Assets: native SOL (sentinel `Pubkey::default()`) + classic SPL Token (not Token-2022)
//! Fees: only `claim_proceeds` takes `raised / 100`

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::ProtocolConfig;

declare_id!("FC9im2jkXhYciLgvEMTgrmvmKMPFkehyM1g3EEnUrpHT");

#[program]
pub mod scoop {
    use super::*;

    /// Initialize Config + PendingDraws
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_recipient: Pubkey,
        protocol_config: ProtocolConfig,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, fee_recipient, protocol_config)
    }

    pub fn set_fee_recipient(ctx: Context<SetFeeRecipient>, fee_recipient: Pubkey) -> Result<()> {
        instructions::set_config::set_fee_recipient(ctx, fee_recipient)
    }

    pub fn set_protocol_config(
        ctx: Context<SetProtocolConfig>,
        protocol_config: ProtocolConfig,
    ) -> Result<()> {
        instructions::set_config::set_protocol_config(ctx, protocol_config)
    }

    /// Create raffle and escrow prize (0 fee) → Selling
    /// `prize_mint` / `payment_mint` = `Pubkey::default()` means native SOL
    pub fn create_raffle(
        ctx: Context<CreateRaffle>,
        prize_mint: Pubkey,
        payment_mint: Pubkey,
        prize_amount: u64,
        price_per_share: u64,
        total_shares: u32,
        deadline: i64,
        draw_delay_slots: u32,
    ) -> Result<()> {
        instructions::create_raffle::handler(
            ctx,
            prize_mint,
            payment_mint,
            prize_amount,
            price_per_share,
            total_shares,
            deadline,
            draw_delay_slots,
        )
    }

    /// Buy shares; sell-out → SoldOut + enqueue pending
    pub fn buy_shares(ctx: Context<BuyShares>, count: u32) -> Result<()> {
        instructions::buy_shares::handler(ctx, count)
    }

    /// Draw (permissionless); resolve SlotHashes window
    pub fn draw(ctx: Context<Draw>) -> Result<()> {
        instructions::draw::handler(ctx)
    }

    /// Batch draw: skip not-ready; dequeue successes
    pub fn draw_many<'info>(ctx: Context<'_, '_, 'info, 'info, DrawMany<'info>>) -> Result<()> {
        instructions::draw_many::handler(ctx)
    }

    /// Winner claims prize (0 fee)
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        instructions::claim_prize::handler(ctx)
    }

    /// Creator claims proceeds (1% → fee_recipient)
    pub fn claim_proceeds(ctx: Context<ClaimProceeds>) -> Result<()> {
        instructions::claim_proceeds::handler(ctx)
    }

    /// Expired refund (0 fee)
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    /// Expired prize recovery (0 fee)
    pub fn recover_prize(ctx: Context<RecoverPrize>) -> Result<()> {
        instructions::recover_prize::handler(ctx)
    }

    /// Close ShareBoard after terminal status; reclaim rent (cf. dRaffle close_entrants)
    pub fn close_share_board(ctx: Context<CloseShareBoard>) -> Result<()> {
        instructions::close_accounts::close_share_board(ctx)
    }

    /// Close BuyerRecord after refund or Drawn
    pub fn close_buyer_record(ctx: Context<CloseBuyerRecord>) -> Result<()> {
        instructions::close_accounts::close_buyer_record(ctx)
    }
}

#[cfg(test)]
mod invariant_tests {
    use super::*;
    use crate::constants::{
        protocol_fee, winner_share_index, MAX_SHARES, MIN_SHARES, MAX_DRAW_DELAY_SLOTS,
        MIN_DRAW_DELAY_SLOTS,
    };
    use crate::instructions::claim_proceeds::split_proceeds;
    use crate::instructions::draw::apply_draw;
    use crate::instructions::refund::ensure_expired;
    use crate::state::{PendingDraws, Raffle, RaffleStatus, ShareBoard};
    use crate::utils::randomness::{mock_entries, resolve_draw_slot};

    fn sample_raffle(status: RaffleStatus) -> Raffle {
        Raffle {
            raffle_id: 1,
            creator: Pubkey::new_unique(),
            prize_mint: Pubkey::default(),
            payment_mint: Pubkey::default(),
            prize_amount: 1_000_000_000,
            price_per_share: 100_000_000,
            total_shares: 11,
            sold_shares: 0,
            deadline: 1_700_000_000,
            draw_delay_slots: 5,
            sold_out_slot: 0,
            draw_slot: 0,
            winner_share_index: 0,
            status,
            prize_claimed: false,
            proceeds_claimed: false,
            prize_recovered: false,
            bump: 255,
            vault_bump: 0,
        }
    }

    // --- F1 fee 1% ---
    #[test]
    fn fee_one_percent() {
        assert_eq!(protocol_fee(1100), 11);
        assert_eq!(protocol_fee(99), 0);
        assert_eq!(protocol_fee(100), 1);
        let (fee, creator) = split_proceeds(1100);
        assert_eq!(fee, 11);
        assert_eq!(creator, 1089);
        assert_eq!(fee + creator, 1100); // F6 remainder to creator
    }

    // --- H1 share bounds ---
    #[test]
    fn share_bounds() {
        assert_eq!(MIN_SHARES, 2);
        assert_eq!(MAX_SHARES, 10_000);
        assert!(MIN_SHARES <= 2 && MAX_SHARES >= 10_000);
        // Bounds inclusive
        assert!((MIN_SHARES..=MAX_SHARES).contains(&2));
        assert!((MIN_SHARES..=MAX_SHARES).contains(&10_000));
        assert!(!(MIN_SHARES..=MAX_SHARES).contains(&1));
        assert!(!(MIN_SHARES..=MAX_SHARES).contains(&10_001));
    }

    // --- D1 draw-delay bounds ---
    #[test]
    fn draw_delay_bounds() {
        assert_eq!(MIN_DRAW_DELAY_SLOTS, 1);
        assert_eq!(MAX_DRAW_DELAY_SLOTS, 128);
        assert!((MIN_DRAW_DELAY_SLOTS..=MAX_DRAW_DELAY_SLOTS).contains(&1));
        assert!((MIN_DRAW_DELAY_SLOTS..=MAX_DRAW_DELAY_SLOTS).contains(&128));
        assert!(!(MIN_DRAW_DELAY_SLOTS..=MAX_DRAW_DELAY_SLOTS).contains(&0));
        assert!(!(MIN_DRAW_DELAY_SLOTS..=MAX_DRAW_DELAY_SLOTS).contains(&129));
    }

    // --- D2 draw eligibility TooEarly ---
    #[test]
    fn draw_too_early() {
        // Window covers eligible..current to distinguish too-early vs missing hash
        let entries = mock_entries(&[(20, 1), (19, 2), (18, 3), (17, 4), (16, 5), (15, 6)]);
        assert!(resolve_draw_slot(10, 5, 15, &entries).is_err()); // eligible=15, current<=eligible
        let (slot, _) = resolve_draw_slot(10, 5, 16, &entries).unwrap();
        assert_eq!(slot, 15);
    }

    // --- D5 late: anchored hash aged out → DrawEntropyExpired (no clamp to latest) ---
    #[test]
    fn late_window_entropy_expired() {
        let entries = mock_entries(&[(500, 1), (499, 2), (450, 3)]);
        // eligible = 1+1 = 2 << oldest 450
        assert!(resolve_draw_slot(1, 1, 510, &entries).is_err());
    }

    // --- D6 draw once ---
    #[test]
    fn draw_once_then_reject() {
        let mut raffle = sample_raffle(RaffleStatus::SoldOut);
        raffle.sold_out_slot = 100;
        raffle.draw_delay_slots = 5;
        raffle.total_shares = 4;
        raffle.sold_shares = 4;

        let board = ShareBoard {
            raffle_id: 1,
            bump: 1,
            owners: vec![
                Pubkey::new_unique(),
                Pubkey::new_unique(),
                Pubkey::new_unique(),
                Pubkey::new_unique(),
            ],
        };
        let mut pending = PendingDraws {
            bump: 1,
            raffle_ids: vec![1],
        };
        let entries = mock_entries(&[(110, 7), (109, 8), (106, 9), (105, 10)]);
        let (idx, slot, _) = apply_draw(&mut raffle, &board, &mut pending, 120, &entries).unwrap();
        assert_eq!(raffle.status, RaffleStatus::Drawn);
        assert_eq!(slot, 105);
        assert!(idx < 4);
        assert!(!pending.contains(1));

        // Second draw must fail
        assert!(apply_draw(&mut raffle, &board, &mut pending, 130, &entries).is_err());
        let _ = board; // keep
    }

    // --- R1/R4 expire-refund state machine ---
    #[test]
    fn expire_refund_path() {
        use crate::utils::randomness::SLOT_HASHES_RETENTION;
        let mut raffle = sample_raffle(RaffleStatus::Selling);
        raffle.deadline = 1_000;
        // Before deadline: no refund
        assert!(ensure_expired(&mut raffle, 1_000, 0, None).is_err());
        // After deadline: Selling → Expired
        ensure_expired(&mut raffle, 1_001, 0, None).unwrap();
        assert_eq!(raffle.status, RaffleStatus::Expired);
        // SoldOut inside entropy window: no refund
        let mut sold = sample_raffle(RaffleStatus::SoldOut);
        sold.deadline = 1_000;
        sold.sold_out_slot = 100;
        sold.draw_delay_slots = 5;
        assert!(ensure_expired(&mut sold, 2_000, 200, None).is_err());
        // SoldOut entropy expired (slot > eligible + retention) → Expired
        let mut pending = PendingDraws {
            bump: 1,
            raffle_ids: vec![1],
        };
        ensure_expired(
            &mut sold,
            2_000,
            100 + 5 + SLOT_HASHES_RETENTION + 1,
            Some(&mut pending),
        )
        .unwrap();
        assert_eq!(sold.status, RaffleStatus::Expired);
        assert!(!pending.contains(1));
        let mut drawn = sample_raffle(RaffleStatus::Drawn);
        drawn.deadline = 1_000;
        assert!(ensure_expired(&mut drawn, 2_000, 999_999, None).is_err());
    }

    // --- Winner index in [0, total) ---
    #[test]
    fn winner_in_range() {
        for shares in [2u32, 11, 100, 10_000] {
            let mut hash = [0u8; 32];
            for b in 0..=255u8 {
                hash[0] = b;
                let idx = winner_share_index(&hash, shares);
                assert!(idx < shares);
            }
        }
    }

    // --- pending enqueue/dequeue ---
    #[test]
    fn pending_add_remove() {
        let mut p = PendingDraws {
            bump: 1,
            raffle_ids: vec![],
        };
        p.add(1);
        p.add(2);
        p.add(1); // noop
        assert_eq!(p.raffle_ids.len(), 2);
        p.remove(1).unwrap();
        assert!(!p.contains(1));
        assert!(p.contains(2));
        assert!(p.remove(1).is_err());
    }

    #[test]
    fn pending_and_share_board_space() {
        assert_eq!(PendingDraws::space(0), 8 + 1 + 4);
        assert_eq!(PendingDraws::space(4), 8 + 1 + 4 + 32);
        assert_eq!(ShareBoard::space(11), 8 + 8 + 1 + 4 + 11 * 32);
    }

    #[test]
    fn native_mint_helpers() {
        use crate::constants::{is_native, native_mint};
        use crate::utils::asset::require_mint_path;
        assert_eq!(native_mint(), Pubkey::default());
        assert!(is_native(&Pubkey::default()));
        assert!(!is_native(&Pubkey::new_unique()));
        assert!(require_mint_path(&Pubkey::default()));
        assert!(!require_mint_path(&Pubkey::new_unique()));
    }

    #[test]
    fn enforce_create_config_locks() {
        use crate::instructions::create_raffle::enforce_create_config;
        use crate::state::{Config, ProtocolConfig};

        let mut config = Config {
            authority: Pubkey::new_unique(),
            fee_recipient: Pubkey::new_unique(),
            next_raffle_id: 1,
            protocol_config: ProtocolConfig::default(),
            bump: 1,
        };
        let mint = Pubkey::default();
        let other = Pubkey::new_unique();

        // Launch defaults OK
        enforce_create_config(&config, &mint, &mint, 1_000, 100, 11, 5).unwrap();
        // Different tokens locked
        assert!(enforce_create_config(&config, &mint, &other, 1_000, 100, 11, 5).is_err());
        // Custom shares locked
        assert!(enforce_create_config(&config, &mint, &mint, 1_000, 100, 10, 5).is_err());
        // Custom price locked
        assert!(enforce_create_config(&config, &mint, &mint, 1_000, 99, 11, 5).is_err());
        // Custom draw delay locked
        assert!(enforce_create_config(&config, &mint, &mint, 1_000, 100, 11, 32).is_err());

        config.protocol_config.allow_custom_draw_delay = true;
        enforce_create_config(&config, &mint, &mint, 1_000, 100, 11, 32).unwrap();

        config.protocol_config.allow_custom_price = true;
        enforce_create_config(&config, &mint, &mint, 1_000, 77, 11, 32).unwrap();
        config.protocol_config.allow_custom_price = false;
        config.protocol_config.price_divisor = 0;
        assert!(enforce_create_config(&config, &mint, &mint, 1_000, 100, 11, 32).is_err());
    }

    #[test]
    fn apply_draw_rejects_not_sold_out() {
        let mut raffle = sample_raffle(RaffleStatus::Selling);
        let board = ShareBoard {
            raffle_id: 1,
            bump: 1,
            owners: vec![Pubkey::new_unique(); 2],
        };
        let mut pending = PendingDraws {
            bump: 1,
            raffle_ids: vec![1],
        };
        let entries = mock_entries(&[(10, 1)]);
        assert!(apply_draw(&mut raffle, &board, &mut pending, 20, &entries).is_err());
    }

    #[test]
    fn expire_already_expired_and_uninitialized() {
        let mut expired = sample_raffle(RaffleStatus::Expired);
        ensure_expired(&mut expired, 9_999, 9_999, None).unwrap();

        let mut blank = sample_raffle(RaffleStatus::Selling);
        blank.creator = Pubkey::default();
        assert!(ensure_expired(&mut blank, 9_999, 9_999, None).is_err());
    }
}
