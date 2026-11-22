// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, AppStorage, ProtocolConfig, Raffle, RaffleStatus} from "../storage/AppStorage.sol";
import {LibAsset} from "./LibAsset.sol";
import {LibConstants} from "./LibConstants.sol";
import {LibErrors} from "./LibErrors.sol";

/// @title LibRaffle
/// @notice Raffle state transitions shared by facets.
/// @dev Create escrows the full prize and charges no fee. `claimProceeds` (later) takes 1% of
///      raised only (`raised / FEE_DENOMINATOR`) and pays `feeRecipient`. The winner receives
///      100% of the prize. No prize-side fee.
library LibRaffle {
    /// @notice Validate parameters, assign the three indexes, persist a `Selling` raffle, and pull the prize.
    /// @dev Checks, then effects, then {LibAsset.pull}. The caller must hold the reentrancy lock:
    ///      `pull` can call back into the Diamond on ERC-777-like tokens.
    ///      `prizeToken` and `paymentToken` may be equal. `address(0)` is native BNB.
    /// @param prizeToken Prize asset to escrow from `msg.sender`.
    /// @param paymentToken Asset buyers will pay later. Not transferred here.
    /// @param prizeAmount Non-zero prize, in token wei. Native prize must arrive as `msg.value`.
    /// @param pricePerShare Non-zero share price, in payment-token wei.
    /// @param totalShares Share count in [{LibConstants.MIN_SHARES}, {LibConstants.MAX_SHARES}].
    /// @param deadline Unix time strictly greater than `block.timestamp`.
    /// @param drawDelayBlocks Inclusive range [{LibConstants.MIN_DRAW_DELAY_BLOCKS}, {LibConstants.MAX_DRAW_DELAY_BLOCKS}].
    /// @return orderId Global id taken from `nextOrderId` (starts at 1).
    /// @return tokenOrderId 1-based index for `prizeToken`.
    /// @return userOrderId 1-based index for `msg.sender`.
    function create(
        address prizeToken,
        address paymentToken,
        uint128 prizeAmount,
        uint128 pricePerShare,
        uint32 totalShares,
        uint64 deadline,
        uint32 drawDelayBlocks
    ) internal returns (uint256 orderId, uint32 tokenOrderId, uint32 userOrderId) {
        AppStorage storage s = LibAppStorage.appStorage();
        if (!s.initialized) revert LibErrors.NotInitialized();
        if (prizeAmount == 0 || pricePerShare == 0) revert LibErrors.InvalidAmount();
        if (totalShares < LibConstants.MIN_SHARES || totalShares > LibConstants.MAX_SHARES) {
            revert LibErrors.InvalidShares();
        }
        if (deadline <= block.timestamp) revert LibErrors.InvalidDeadline();
        if (
            drawDelayBlocks < LibConstants.MIN_DRAW_DELAY_BLOCKS || drawDelayBlocks > LibConstants.MAX_DRAW_DELAY_BLOCKS
        ) {
            revert LibErrors.InvalidDrawDelay();
        }
        _enforceCreateConfig(s, prizeToken, paymentToken, prizeAmount, pricePerShare, totalShares, drawDelayBlocks);

        orderId = s.nextOrderId;
        s.nextOrderId = orderId + 1;

        tokenOrderId = s.tokenOrderCount[prizeToken] + 1;
        s.tokenOrderCount[prizeToken] = tokenOrderId;
        userOrderId = s.userOrderCount[msg.sender] + 1;
        s.userOrderCount[msg.sender] = userOrderId;

        s.tokenOrderIdToOrderId[prizeToken][tokenOrderId] = orderId;
        s.userOrderIdToOrderId[msg.sender][userOrderId] = orderId;

        // `status` defaults to `Selling` (0). Remaining counters and claim flags stay zero.
        s.raffles[orderId] = Raffle({
            creator: msg.sender,
            prizeToken: prizeToken,
            paymentToken: paymentToken,
            prizeAmount: prizeAmount,
            pricePerShare: pricePerShare,
            totalShares: totalShares,
            soldShares: 0,
            deadline: deadline,
            drawDelayBlocks: drawDelayBlocks,
            soldOutBlock: 0,
            drawBlock: 0,
            winnerShareIndex: 0,
            tokenOrderId: tokenOrderId,
            userOrderId: userOrderId,
            status: RaffleStatus.Selling,
            prizeClaimed: false,
            proceedsClaimed: false,
            prizeRecovered: false
        });

        // Interaction last. Native value was already attached to this call; ERC-20 is pulled now.
        LibAsset.pull(prizeToken, msg.sender, prizeAmount);
    }

    /// @dev Apply progressive launch locks. Flags start false; owner opens them later.
    function _enforceCreateConfig(
        AppStorage storage s,
        address prizeToken,
        address paymentToken,
        uint128 prizeAmount,
        uint128 pricePerShare,
        uint32 totalShares,
        uint32 drawDelayBlocks
    ) private view {
        ProtocolConfig memory cfg = s.protocolConfig;
        if (!cfg.allowDifferentTokens && prizeToken != paymentToken) revert LibErrors.TokenMismatch();
        if (!cfg.allowCustomShares && totalShares != cfg.defaultShares) revert LibErrors.SharesLocked();
        if (!cfg.allowCustomPrice) {
            if (cfg.priceDivisor == 0) revert LibErrors.InvalidConfig();
            if (uint256(prizeAmount) % uint256(cfg.priceDivisor) != 0) revert LibErrors.PriceLocked();
            if (pricePerShare != uint128(uint256(prizeAmount) / uint256(cfg.priceDivisor))) {
                revert LibErrors.PriceLocked();
            }
        }
        if (!cfg.allowCustomDrawDelay && drawDelayBlocks != cfg.defaultDrawDelayBlocks) {
            revert LibErrors.DrawDelayLocked();
        }
    }

    /// @notice Buy `count` shares; on sell-out enqueue pending draw.
    /// @dev Effects then {LibAsset.pull}. Caller must hold reentrancy lock.
    /// @return soldOut True when this purchase filled the raffle.
    function buyShares(uint256 orderId, uint32 count) internal returns (bool soldOut) {
        AppStorage storage s = LibAppStorage.appStorage();
        Raffle storage r = s.raffles[orderId];
        if (r.creator == address(0) || r.status != RaffleStatus.Selling) revert LibErrors.NotSelling();
        if (block.timestamp > r.deadline) revert LibErrors.DeadlinePassed();
        if (count == 0) revert LibErrors.InvalidAmount();
        if (r.soldShares + count > r.totalShares) revert LibErrors.InsufficientShares();

        uint32 startIndex = r.soldShares;
        for (uint32 i = 0; i < count; ++i) {
            s.shareOwner[orderId][startIndex + i] = msg.sender;
        }
        r.soldShares = startIndex + count;
        s.shareCount[orderId][msg.sender] += count;
        uint256 paid = uint256(r.pricePerShare) * uint256(count);
        s.buyerPaid[orderId][msg.sender] += paid;

        soldOut = r.soldShares == r.totalShares;
        if (soldOut) {
            r.status = RaffleStatus.SoldOut;
            r.soldOutBlock = uint64(block.number);
            pendingDrawAdd(s, orderId);
        }

        LibAsset.pull(r.paymentToken, msg.sender, paid);
    }

    function pendingDrawAdd(AppStorage storage s, uint256 orderId) internal {
        if (s.pendingDrawIndex[orderId] != 0) return;
        s.pendingDrawIds.push(orderId);
        s.pendingDrawIndex[orderId] = s.pendingDrawIds.length; // 1-based
    }

    function pendingDrawRemove(AppStorage storage s, uint256 orderId) internal {
        uint256 idxPlus = s.pendingDrawIndex[orderId];
        if (idxPlus == 0) revert LibErrors.NotPendingDraw();
        uint256 idx = idxPlus - 1;
        uint256 last = s.pendingDrawIds.length - 1;
        if (idx != last) {
            uint256 moved = s.pendingDrawIds[last];
            s.pendingDrawIds[idx] = moved;
            s.pendingDrawIndex[moved] = idx + 1;
        }
        s.pendingDrawIds.pop();
        delete s.pendingDrawIndex[orderId];
    }
}
