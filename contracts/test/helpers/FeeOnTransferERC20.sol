// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

/// @notice ERC-20 that skims 1% on every transfer / transferFrom (fee-on-transfer).
contract FeeOnTransferERC20 {
    string public name = "FeeOnTransfer";
    string public symbol = "FOT";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        uint256 fee = amount / 100;
        uint256 send = amount - fee;
        balanceOf[from] -= amount;
        balanceOf[to] += send;
        // fee burned (removed from supply accounting for simplicity)
        totalSupply -= fee;
    }
}
