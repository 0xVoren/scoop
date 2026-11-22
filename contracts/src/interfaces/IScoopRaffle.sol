// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Raffle} from "../storage/AppStorage.sol";

/// @title IScoopRaffle
/// @notice Create a raffle. The full prize is escrowed in the Diamond. Create charges no fee.
/// @dev Protocol fee is 1% of creator proceeds only, taken later in `claimProceeds` (`raised / 100`)
///      and sent to `feeRecipient`. The winner receives 100% of the prize.
interface IScoopRaffle {
    /// @notice Emitted when a raffle is created and the prize is escrowed.
    /// @param orderId Global id, starting at 1.
    /// @param creator Caller who escrowed the prize.
    /// @param prizeToken Prize asset. `address(0)` is native BNB.
    /// @param paymentToken Payment asset. `address(0)` is native BNB. May equal `prizeToken`.
    /// @param prizeAmount Prize escrowed, in token wei.
    /// @param pricePerShare Price of one share, in payment-token wei.
    /// @param totalShares Shares for sale. At least {LibConstants.MIN_SHARES}.
    /// @param deadline Unix time after which new buys are rejected.
    /// @param drawDelayBlocks Blocks after sell-out before the raffle may be drawn.
    /// @param tokenOrderId 1-based index of this raffle among raffles with the same prize token.
    /// @param userOrderId 1-based index of this raffle among raffles created by `creator`.
    event RaffleCreated(
        uint256 indexed orderId,
        address indexed creator,
        address indexed prizeToken,
        address paymentToken,
        uint128 prizeAmount,
        uint128 pricePerShare,
        uint32 totalShares,
        uint64 deadline,
        uint32 drawDelayBlocks,
        uint32 tokenOrderId,
        uint32 userOrderId
    );

    /// @notice Escrow `prizeAmount` and open a raffle in `Selling`.
    /// @dev Native prize must be sent as `msg.value`. ERC-20 prize requires `msg.value == 0` and prior approval.
    ///      No protocol fee is charged here.
    /// @param prizeToken Prize asset. `address(0)` is native BNB.
    /// @param paymentToken Payment asset buyers will use later. `address(0)` is native BNB.
    /// @param prizeAmount Prize amount, in token wei. Must be non-zero.
    /// @param pricePerShare Price of one share, in payment-token wei. Must be non-zero.
    /// @param totalShares Number of shares. Inclusive bounds 2 through 10_000.
    /// @param deadline Unix timestamp strictly after `block.timestamp`.
    /// @param drawDelayBlocks Delay after sell-out, inclusive bounds 1 through 128.
    /// @return orderId Newly assigned global raffle id.
    function createRaffle(
        address prizeToken,
        address paymentToken,
        uint128 prizeAmount,
        uint128 pricePerShare,
        uint32 totalShares,
        uint64 deadline,
        uint32 drawDelayBlocks
    ) external payable returns (uint256 orderId);
}

/// @title IScoopRaffleViews
/// @notice Minimal read surface required by create tests. Pending-draw views are added later.
interface IScoopRaffleViews {
    /// @notice Return the raffle record. An unknown id returns the zero struct.
    /// @param orderId Global raffle id.
    /// @return raffle Stored raffle.
    function getRaffle(uint256 orderId) external view returns (Raffle memory raffle);

    /// @notice Map a prize token's 1-based index to the global raffle id.
    /// @param prizeToken Prize asset. `address(0)` is native BNB.
    /// @param tokenOrderId 1-based index. `0` and unknown indexes return `0`.
    /// @return orderId Global raffle id, or `0` if that index was never assigned.
    function orderIdByPrizeToken(address prizeToken, uint32 tokenOrderId) external view returns (uint256 orderId);

    /// @notice Map a creator's 1-based index to the global raffle id.
    /// @param creator Address that called `createRaffle`.
    /// @param userOrderId 1-based index. `0` and unknown indexes return `0`.
    /// @return orderId Global raffle id, or `0` if that index was never assigned.
    function orderIdByCreator(address creator, uint32 userOrderId) external view returns (uint256 orderId);
}
