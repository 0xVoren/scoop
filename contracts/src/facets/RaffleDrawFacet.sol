// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibRaffleDraw} from "../libraries/LibRaffleDraw.sol";
import {Modifiers} from "./Modifiers.sol";

/// @title RaffleDrawFacet
/// @notice Permissionless blockhash draw after sell-out delay.
contract RaffleDrawFacet is Modifiers {
    event Drawn(uint256 indexed orderId, uint32 winnerShareIndex, uint64 drawBlock, address indexed winner);

    function draw(uint256 orderId) external nonReentrant {
        (uint32 winnerShareIndex, uint64 drawBlock, address winner) = LibRaffleDraw.draw(orderId);
        emit Drawn(orderId, winnerShareIndex, drawBlock, winner);
    }

    /// @notice Draw many raffles. All-or-nothing: first failure reverts the whole batch.
    function drawMany(uint256[] calldata orderIds) external nonReentrant {
        uint256 n = orderIds.length;
        for (uint256 i = 0; i < n; ++i) {
            (uint32 winnerShareIndex, uint64 drawBlock, address winner) = LibRaffleDraw.draw(orderIds[i]);
            emit Drawn(orderIds[i], winnerShareIndex, drawBlock, winner);
        }
    }
}
