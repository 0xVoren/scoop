//! Custom errors — semantic parity with EVM `LibErrors`.
use anchor_lang::prelude::*;

#[error_code]
pub enum ScoopError {
    #[msg("Program not initialized")]
    NotInitialized,
    #[msg("Invalid amount (zero)")]
    InvalidAmount,
    #[msg("Shares out of bounds [2, 10000]")]
    InvalidShares,
    #[msg("Deadline must be strictly after now")]
    InvalidDeadline,
    #[msg("Draw delay slots out of bounds [1, 128]")]
    InvalidDrawDelay,
    #[msg("Prize/payment mint mismatch while allow_different_tokens=false")]
    TokenMismatch,
    #[msg("Custom shares locked by protocol config")]
    SharesLocked,
    #[msg("Custom price locked by protocol config")]
    PriceLocked,
    #[msg("Custom draw delay locked by protocol config")]
    DrawDelayLocked,
    #[msg("Invalid protocol config")]
    InvalidConfig,
    #[msg("Raffle is not in Selling status")]
    NotSelling,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Not enough shares remaining")]
    InsufficientShares,
    #[msg("Raffle is not SoldOut")]
    NotSoldOut,
    #[msg("Draw too early (slot <= sold_out_slot + delay)")]
    DrawTooEarly,
    #[msg("No usable SlotHash in current window")]
    NoSlotHash,
    #[msg("Anchored eligible SlotHash aged out; draw impossible — refund/recover")]
    DrawEntropyExpired,
    #[msg("SPL transfer credited fewer tokens than requested (fee-on-transfer)")]
    TransferAmountMismatch,
    #[msg("Raffle is not Drawn")]
    NotDrawn,
    #[msg("Prize already claimed")]
    PrizeAlreadyClaimed,
    #[msg("Caller is not the winner")]
    NotWinner,
    #[msg("Caller is not the creator")]
    NotCreator,
    #[msg("Proceeds already claimed")]
    ProceedsAlreadyClaimed,
    #[msg("Nothing to refund")]
    NothingToRefund,
    #[msg("Already refunded")]
    AlreadyRefunded,
    #[msg("Prize already recovered")]
    PrizeAlreadyRecovered,
    #[msg("Raffle not expired (or SoldOut/Drawn)")]
    NotExpired,
    #[msg("Raffle not in pending draw set")]
    NotPendingDraw,
    #[msg("Fee recipient cannot be default pubkey")]
    InvalidFeeRecipient,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Native lamports mismatch")]
    NativeAmountMismatch,
    #[msg("Token-2022 / unexpected token program (MVP: classic Token only)")]
    UnsupportedTokenProgram,
    #[msg("Invalid SlotHashes sysvar account")]
    InvalidSlotHashes,
    #[msg("Raffle already drawn")]
    AlreadyDrawn,
}
