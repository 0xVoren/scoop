// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {IScoopRaffle} from "../interfaces/IScoopRaffle.sol";
import {LibRaffle} from "../libraries/LibRaffle.sol";
import {Modifiers} from "./Modifiers.sol";

/// @title RaffleCreateFacet
/// @notice Opens a raffle and escrows the full prize in the Diamond.
/// @dev Create charges no protocol fee. `claimProceeds` later sends 1% of raised
///      (`raised / 100`) to `feeRecipient`. The winner receives 100% of the prize.
contract RaffleCreateFacet is IScoopRaffle, Modifiers {
    /// @inheritdoc IScoopRaffle
    function createRaffle(
        address prizeToken,
        address paymentToken,
        uint128 prizeAmount,
        uint128 pricePerShare,
        uint32 totalShares,
        uint64 deadline,
        uint32 drawDelayBlocks
    ) external payable nonReentrant returns (uint256 orderId) {
        uint32 tokenOrderId;
        uint32 userOrderId;
        (orderId, tokenOrderId, userOrderId) = LibRaffle.create(
            prizeToken, paymentToken, prizeAmount, pricePerShare, totalShares, deadline, drawDelayBlocks
        );

        emit RaffleCreated(
            orderId,
            msg.sender,
            prizeToken,
            paymentToken,
            prizeAmount,
            pricePerShare,
            totalShares,
            deadline,
            drawDelayBlocks,
            tokenOrderId,
            userOrderId
        );
    }
}
