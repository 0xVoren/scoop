// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, AppStorage, Raffle, RaffleStatus} from "../storage/AppStorage.sol";
import {LibErrors} from "./LibErrors.sol";
import {LibRaffle} from "./LibRaffle.sol";

/// @title LibRaffleDraw
/// @notice Anchored blockhash draw after sell-out delay; dequeues pending draw on success.
/// @dev Spec (externally verifiable):
///      - `eligible = soldOutBlock + drawDelayBlocks`
///      - Callable iff `block.number > eligible`
///      - Entropy = `blockhash(eligible)` only (never the caller's current head)
///      - `winnerShareIndex = uint256(keccak256(abi.encodePacked(blockhash(eligible), orderId))) % totalShares`
///      - If `blockhash(eligible) == 0` (aged out of the ~256 window) → `DrawEntropyExpired`;
///        callers must use refund / recoverPrize (SoldOut → Expired), not a later hash.
library LibRaffleDraw {
    /// @notice Resolve the anchored draw block `soldOutBlock + delay`.
    /// @dev Does **not** clamp to a newer block. Late draws that lost `blockhash(eligible)` revert.
    function resolveDrawBlock(uint64 soldOutBlock, uint32 delay) internal view returns (uint64 drawBlock) {
        uint256 eligible = uint256(soldOutBlock) + uint256(delay);
        if (block.number <= eligible) revert LibErrors.DrawTooEarly();

        bytes32 h = blockhash(eligible);
        if (h == bytes32(0)) revert LibErrors.DrawEntropyExpired();

        return uint64(eligible);
    }

    /// @notice Whether a SoldOut raffle can no longer be drawn (eligible hash aged out).
    function isDrawEntropyExpired(uint64 soldOutBlock, uint32 delay) internal view returns (bool) {
        uint256 eligible = uint256(soldOutBlock) + uint256(delay);
        if (block.number <= eligible) return false;
        return blockhash(eligible) == bytes32(0);
    }

    /// @notice Expand chain entropy with `orderId` so multi-raffle reuse of the same block is unbiased.
    function expandEntropy(bytes32 blockHash, uint256 orderId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(blockHash, orderId));
    }

    /// @notice Draw a sold-out raffle. Writes winner once and removes from pending set.
    /// @return winnerShareIndex Winning share index in `[0, totalShares)`.
    /// @return drawBlock Block whose hash was used (`eligible`, always).
    /// @return winner Address that owns `winnerShareIndex`.
    function draw(uint256 orderId) internal returns (uint32 winnerShareIndex, uint64 drawBlock, address winner) {
        AppStorage storage s = LibAppStorage.appStorage();
        Raffle storage r = s.raffles[orderId];
        if (r.status != RaffleStatus.SoldOut) revert LibErrors.NotSoldOut();

        drawBlock = resolveDrawBlock(r.soldOutBlock, r.drawDelayBlocks);
        bytes32 entropy = expandEntropy(blockhash(drawBlock), orderId);
        winnerShareIndex = uint32(uint256(entropy) % uint256(r.totalShares));
        winner = s.shareOwner[orderId][winnerShareIndex];

        r.status = RaffleStatus.Drawn;
        r.drawBlock = drawBlock;
        r.winnerShareIndex = winnerShareIndex;
        LibRaffle.pendingDrawRemove(s, orderId);
    }
}
