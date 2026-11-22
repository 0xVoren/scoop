// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, AppStorage, Raffle, RaffleStatus} from "../storage/AppStorage.sol";
import {LibAsset} from "./LibAsset.sol";
import {LibConstants} from "./LibConstants.sol";
import {LibErrors} from "./LibErrors.sol";
import {LibRaffle} from "./LibRaffle.sol";
import {LibRaffleDraw} from "./LibRaffleDraw.sol";

/// @title LibRaffleClaim
/// @notice Prize / proceeds claims and lazy-expire refunds. Fee is 1% of raised on proceeds only.
library LibRaffleClaim {
    /// @notice Winner takes 100% of the prize. No protocol fee on the prize side.
    function claimPrize(uint256 orderId) internal {
        AppStorage storage s = LibAppStorage.appStorage();
        Raffle storage r = s.raffles[orderId];
        if (r.status != RaffleStatus.Drawn) revert LibErrors.NotDrawn();
        if (r.prizeClaimed) revert LibErrors.PrizeAlreadyClaimed();

        address winner = s.shareOwner[orderId][r.winnerShareIndex];
        if (msg.sender != winner) revert LibErrors.NotWinner();

        r.prizeClaimed = true;
        LibAsset.push(r.prizeToken, winner, r.prizeAmount);
    }

    /// @notice Creator takes `raised - fee`; `fee = raised / 100` goes to the fee sink (`feeRecipient`).
    /// @dev Sink may later be a splitter for Dev + lockers; this library only pushes the fee.
    function claimProceeds(uint256 orderId) internal {
        AppStorage storage s = LibAppStorage.appStorage();
        Raffle storage r = s.raffles[orderId];
        if (r.status != RaffleStatus.Drawn) revert LibErrors.NotDrawn();
        if (msg.sender != r.creator) revert LibErrors.NotCreator();
        if (r.proceedsClaimed) revert LibErrors.ProceedsAlreadyClaimed();

        r.proceedsClaimed = true;
        uint256 raised = uint256(r.pricePerShare) * uint256(r.totalShares);
        uint256 fee = raised / LibConstants.FEE_DENOMINATOR;
        address feeRecipient = s.feeRecipient;
        LibAsset.push(r.paymentToken, feeRecipient, fee);
        LibAsset.push(r.paymentToken, r.creator, raised - fee);
    }

    /// @notice Lazy-expire: buyer refunds their paid amount once. No fee.
    /// @dev Also allows SoldOut → Expired when anchored draw entropy has aged out.
    function refund(uint256 orderId) internal {
        AppStorage storage s = LibAppStorage.appStorage();
        Raffle storage r = s.raffles[orderId];
        _ensureExpired(s, r, orderId);

        uint256 paid = s.buyerPaid[orderId][msg.sender];
        if (paid == 0) revert LibErrors.NothingToRefund();
        if (s.buyerRefunded[orderId][msg.sender]) revert LibErrors.AlreadyRefunded();

        s.buyerRefunded[orderId][msg.sender] = true;
        LibAsset.push(r.paymentToken, msg.sender, paid);
    }

    /// @notice Lazy-expire: creator recovers full prize once. No fee.
    function recoverPrize(uint256 orderId) internal {
        AppStorage storage s = LibAppStorage.appStorage();
        Raffle storage r = s.raffles[orderId];
        _ensureExpired(s, r, orderId);
        if (msg.sender != r.creator) revert LibErrors.NotCreator();
        if (r.prizeRecovered) revert LibErrors.PrizeAlreadyRecovered();

        r.prizeRecovered = true;
        LibAsset.push(r.prizeToken, r.creator, r.prizeAmount);
    }

    /// @dev Selling past deadline → Expired.
    ///      SoldOut with `blockhash(eligible) == 0` → Expired + pending dequeue (draw impossible).
    ///      Already Expired (deadline or entropy) stays open for further refunds/recover.
    ///      Drawn never expires.
    function _ensureExpired(AppStorage storage s, Raffle storage r, uint256 orderId) private {
        if (r.creator == address(0)) revert LibErrors.NotExpired();

        if (r.status == RaffleStatus.Expired) {
            return;
        }

        if (r.status == RaffleStatus.SoldOut) {
            if (!LibRaffleDraw.isDrawEntropyExpired(r.soldOutBlock, r.drawDelayBlocks)) {
                revert LibErrors.NotExpired();
            }
            r.status = RaffleStatus.Expired;
            LibRaffle.pendingDrawRemove(s, orderId);
            return;
        }

        if (block.timestamp <= r.deadline) revert LibErrors.NotExpired();
        if (r.status == RaffleStatus.Drawn) revert LibErrors.NotExpired();
        if (r.status == RaffleStatus.Selling) {
            r.status = RaffleStatus.Expired;
        } else {
            revert LibErrors.NotExpired();
        }
    }
}
