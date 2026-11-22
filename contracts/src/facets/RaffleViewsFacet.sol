// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {ProtocolConfig, Raffle} from "../storage/AppStorage.sol";
import {LibRaffleViews} from "../libraries/LibRaffleViews.sol";

/// @title RaffleViewsFacet
/// @notice Read path for raffles, shares, indexes, and pending draws.
contract RaffleViewsFacet {
    function getRaffle(uint256 orderId) external view returns (Raffle memory raffle) {
        raffle = LibRaffleViews.getRaffle(orderId);
    }

    function shareOwner(uint256 orderId, uint32 shareIndex) external view returns (address) {
        return LibRaffleViews.shareOwner(orderId, shareIndex);
    }

    function shareCount(uint256 orderId, address user) external view returns (uint32) {
        return LibRaffleViews.shareCount(orderId, user);
    }

    function buyerPaid(uint256 orderId, address user) external view returns (uint256) {
        return LibRaffleViews.buyerPaid(orderId, user);
    }

    function buyerRefunded(uint256 orderId, address user) external view returns (bool) {
        return LibRaffleViews.buyerRefunded(orderId, user);
    }

    function pendingDrawCount() external view returns (uint256) {
        return LibRaffleViews.pendingDrawCount();
    }

    function pendingDrawAt(uint256 index) external view returns (uint256 orderId, uint64 eligibleBlock) {
        return LibRaffleViews.pendingDrawAt(index);
    }

    function orderIdByPrizeToken(address prizeToken, uint32 tokenOrderId) external view returns (uint256 orderId) {
        orderId = LibRaffleViews.orderIdByPrizeToken(prizeToken, tokenOrderId);
    }

    function orderIdByCreator(address creator, uint32 userOrderId) external view returns (uint256 orderId) {
        orderId = LibRaffleViews.orderIdByCreator(creator, userOrderId);
    }

    function nextOrderId() external view returns (uint256) {
        return LibRaffleViews.nextOrderId();
    }

    function tokenOrderCount(address prizeToken) external view returns (uint32) {
        return LibRaffleViews.tokenOrderCount(prizeToken);
    }

    function userOrderCount(address creator) external view returns (uint32) {
        return LibRaffleViews.userOrderCount(creator);
    }

    function protocolConfig() external view returns (ProtocolConfig memory) {
        return LibRaffleViews.protocolConfig();
    }
}
