// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {LibAppStorage, AppStorage, ProtocolConfig, Raffle} from "../storage/AppStorage.sol";

/// @title LibRaffleViews
/// @notice Pure read helpers for the views facet.
library LibRaffleViews {
    function getRaffle(uint256 orderId) internal view returns (Raffle memory) {
        return LibAppStorage.appStorage().raffles[orderId];
    }

    function shareOwner(uint256 orderId, uint32 shareIndex) internal view returns (address) {
        return LibAppStorage.appStorage().shareOwner[orderId][shareIndex];
    }

    function shareCount(uint256 orderId, address user) internal view returns (uint32) {
        return LibAppStorage.appStorage().shareCount[orderId][user];
    }

    function buyerPaid(uint256 orderId, address user) internal view returns (uint256) {
        return LibAppStorage.appStorage().buyerPaid[orderId][user];
    }

    function buyerRefunded(uint256 orderId, address user) internal view returns (bool) {
        return LibAppStorage.appStorage().buyerRefunded[orderId][user];
    }

    function pendingDrawCount() internal view returns (uint256) {
        return LibAppStorage.appStorage().pendingDrawIds.length;
    }

    function pendingDrawAt(uint256 index) internal view returns (uint256 orderId, uint64 eligibleBlock) {
        AppStorage storage s = LibAppStorage.appStorage();
        orderId = s.pendingDrawIds[index];
        Raffle storage r = s.raffles[orderId];
        eligibleBlock = uint64(uint256(r.soldOutBlock) + uint256(r.drawDelayBlocks));
    }

    function orderIdByPrizeToken(address prizeToken, uint32 tokenOrderId) internal view returns (uint256) {
        return LibAppStorage.appStorage().tokenOrderIdToOrderId[prizeToken][tokenOrderId];
    }

    function orderIdByCreator(address creator, uint32 userOrderId) internal view returns (uint256) {
        return LibAppStorage.appStorage().userOrderIdToOrderId[creator][userOrderId];
    }

    function nextOrderId() internal view returns (uint256) {
        return LibAppStorage.appStorage().nextOrderId;
    }

    function feeRecipient() internal view returns (address) {
        return LibAppStorage.appStorage().feeRecipient;
    }

    function tokenOrderCount(address prizeToken) internal view returns (uint32) {
        return LibAppStorage.appStorage().tokenOrderCount[prizeToken];
    }

    function userOrderCount(address creator) internal view returns (uint32) {
        return LibAppStorage.appStorage().userOrderCount[creator];
    }

    function protocolConfig() internal view returns (ProtocolConfig memory) {
        return LibAppStorage.appStorage().protocolConfig;
    }
}
