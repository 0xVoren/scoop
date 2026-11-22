// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @title LibConstants
/// @notice Shared numeric bounds. Fee is `amount / FEE_DENOMINATOR` (1%).
library LibConstants {
    uint256 internal constant FEE_DENOMINATOR = 100; // fee = amount / 100
    uint32 internal constant MIN_SHARES = 2;
    /// @dev Caps per-share storage writes on sell-out when custom shares are unlocked.
    uint32 internal constant MAX_SHARES = 10_000;
    uint32 internal constant MIN_DRAW_DELAY_BLOCKS = 1;
    uint32 internal constant MAX_DRAW_DELAY_BLOCKS = 128;
    /// @dev Launch defaults when corresponding allow* flags are false.
    uint32 internal constant LAUNCH_SHARES = 11;
    uint32 internal constant LAUNCH_PRICE_DIVISOR = 10; // pricePerShare = prizeAmount / 10
    uint32 internal constant LAUNCH_DRAW_DELAY_BLOCKS = 5;
}
