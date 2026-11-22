// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, Raffle} from "../storage/AppStorage.sol";
import {LibConstants} from "../libraries/LibConstants.sol";
import {LibRaffleClaim} from "../libraries/LibRaffleClaim.sol";
import {Modifiers} from "./Modifiers.sol";

/// @title RaffleClaimFacet
/// @notice Prize/proceeds claims and expire refunds/recovery.
/// @dev `claimProceeds` sends `raised / 100` to `feeRecipient` in the same tx. Prize claims take no fee.
contract RaffleClaimFacet is Modifiers {
    event PrizeClaimed(uint256 indexed orderId, address indexed winner, uint256 amount);
    event ProceedsClaimed(uint256 indexed orderId, address indexed creator, uint256 creatorAmount, uint256 feeAmount);
    event Refunded(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event PrizeRecovered(uint256 indexed orderId, address indexed creator, uint256 amount);

    function claimPrize(uint256 orderId) external nonReentrant {
        Raffle storage r = LibAppStorage.appStorage().raffles[orderId];
        uint256 amount = r.prizeAmount;
        LibRaffleClaim.claimPrize(orderId);
        emit PrizeClaimed(orderId, msg.sender, amount);
    }

    function claimProceeds(uint256 orderId) external nonReentrant {
        Raffle storage r = LibAppStorage.appStorage().raffles[orderId];
        uint256 raised = uint256(r.pricePerShare) * uint256(r.totalShares);
        uint256 fee = raised / LibConstants.FEE_DENOMINATOR;
        LibRaffleClaim.claimProceeds(orderId);
        emit ProceedsClaimed(orderId, msg.sender, raised - fee, fee);
    }

    function refund(uint256 orderId) external nonReentrant {
        uint256 amount = LibAppStorage.appStorage().buyerPaid[orderId][msg.sender];
        LibRaffleClaim.refund(orderId);
        emit Refunded(orderId, msg.sender, amount);
    }

    function recoverPrize(uint256 orderId) external nonReentrant {
        Raffle storage r = LibAppStorage.appStorage().raffles[orderId];
        uint256 amount = r.prizeAmount;
        LibRaffleClaim.recoverPrize(orderId);
        emit PrizeRecovered(orderId, msg.sender, amount);
    }
}
