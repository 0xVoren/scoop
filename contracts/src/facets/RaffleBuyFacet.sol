// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, Raffle} from "../storage/AppStorage.sol";
import {LibRaffle} from "../libraries/LibRaffle.sol";
import {Modifiers} from "./Modifiers.sol";

/// @title RaffleBuyFacet
/// @notice Buy shares while a raffle is selling; sell-out enqueues pending draw.
contract RaffleBuyFacet is Modifiers {
    event SharesPurchased(uint256 indexed orderId, address indexed buyer, uint32 count, uint32 startIndex);
    event SoldOut(uint256 indexed orderId, address indexed prizeToken, uint64 soldOutBlock, uint64 eligibleBlock);

    /// @notice Buy `count` consecutive shares starting at the current `soldShares` index.
    function buyShares(uint256 orderId, uint32 count) external payable nonReentrant {
        Raffle storage r = LibAppStorage.appStorage().raffles[orderId];
        uint32 startIndex = r.soldShares;
        bool soldOut = LibRaffle.buyShares(orderId, count);
        emit SharesPurchased(orderId, msg.sender, count, startIndex);
        if (soldOut) {
            uint64 soldOutBlock = r.soldOutBlock;
            uint64 eligible = uint64(uint256(soldOutBlock) + uint256(r.drawDelayBlocks));
            emit SoldOut(orderId, r.prizeToken, soldOutBlock, eligible);
        }
    }
}
