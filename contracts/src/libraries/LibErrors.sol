// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title LibErrors
/// @notice Shared custom errors for Scoop facets and libraries.
library LibErrors {
    error ReentrantCall();
    error NotInitialized();
    error AlreadyInitialized();
    error ZeroAddress();
    error InvalidShares();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidDrawDelay();
    error InvalidMsgValue();
    error NotSelling();
    error DeadlinePassed();
    error InsufficientShares();
    error NotSoldOut();
    error AlreadyDrawn();
    error DrawTooEarly();
    error NoBlockhash();
    /// @notice Anchored `blockhash(soldOutBlock + delay)` aged out of the EVM window; draw impossible → refund/recover.
    error DrawEntropyExpired();
    /// @notice ERC-20 pull credited fewer tokens than requested (fee-on-transfer / tax / deflation).
    error TransferAmountMismatch();
    error NotDrawn();
    error NotWinner();
    error PrizeAlreadyClaimed();
    error ProceedsAlreadyClaimed();
    error NotExpired();
    error NothingToRefund();
    error AlreadyRefunded();
    error NotCreator();
    error PrizeAlreadyRecovered();
    error NotPendingDraw();
    error TokenMismatch();
    error SharesLocked();
    error PriceLocked();
    error DrawDelayLocked();
    error InvalidConfig();
}
