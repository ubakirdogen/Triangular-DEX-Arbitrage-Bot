//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./interfaces/IPancakeFactory.sol";
import "./interfaces/IPancakePair.sol";
import "./interfaces/IPancakeRouter02.sol";
import "./interfaces/IERC20.sol";

contract SuperArbit {
  struct PairInfo {
    address pairAddr;
    address token0Addr;
    address token1Addr;
    string token0Symbol;
    string token1Symbol;
    uint32 lastBlockTimestamp;
    uint32 poolId;
  }

  struct PairReserve {
    uint112 reserve0;
    uint112 reserve1;
  }

  address owner;

  modifier onlyOwner() {
    require(owner == msg.sender, "Ownable: caller is not the owner");
    _;
  }

  constructor() {
    owner = msg.sender;
  }

  function getBatchReserves(address[] calldata pairs) public view onlyOwner returns (PairReserve[] memory) {
    PairReserve[] memory pairReserveList = new PairReserve[](pairs.length);
    for (uint256 i = 0; i < pairs.length; i++) {
      (uint112 reserve0, uint112 reserve1, ) = IPancakePair(pairs[i]).getReserves();
      pairReserveList[i] = PairReserve(reserve0, reserve1);
    }
    return pairReserveList;
  }

  function getContractSize(address _addr) public view returns (uint32) {
    uint32 size;
    assembly {
      size := extcodesize(_addr)
    }
    return size;
  }

  function retrievePairInfo(
    address factoryAddr,
    uint256 factoryStartIdx,
    uint256 numOfPairs
  ) public view onlyOwner returns (PairInfo[] memory) {
    IPancakeFactory factory = IPancakeFactory(factoryAddr);
    uint256 totalNumOfPairs = factory.allPairsLength();
    uint256 availNumOfPairs = (
      factoryStartIdx + numOfPairs > totalNumOfPairs ? totalNumOfPairs - factoryStartIdx : numOfPairs
    );
    PairInfo[] memory pairInfoList = new PairInfo[](availNumOfPairs);
    for (uint256 i = 0; i < availNumOfPairs; i++) {
      uint256 currIdx = factoryStartIdx + i;
      address pairAddr = factory.allPairs(currIdx);
      IPancakePair pair = IPancakePair(pairAddr);
      (, , uint32 blockTs) = pair.getReserves();
      address token0Addr = pair.token0();
      address token1Addr = pair.token1();
      bool success0;
      bool success1;
      bytes memory result0;
      bytes memory result1;
      if (getContractSize(token0Addr) != 148 && getContractSize(token1Addr) != 148) {
        (success0, result0) = token0Addr.staticcall(abi.encodeWithSignature("symbol()"));
        (success1, result1) = token1Addr.staticcall(abi.encodeWithSignature("symbol()"));
      }
      PairInfo memory pairInfo;
      if ((success0 && success1) && (result0.length == 96) && (result1.length == 96)) {
        pairInfo = PairInfo(
          pairAddr,
          token0Addr,
          token1Addr,
          abi.decode(result0, (string)),
          abi.decode(result1, (string)),
          blockTs,
          uint32(currIdx)
        );
      } else {
        pairInfo = PairInfo(address(0), address(0), address(0), "", "", 0, uint32(currIdx));
      }
      pairInfoList[i] = pairInfo;
    }
    return pairInfoList;
  }

  function SafeTransferFrom(
    address token,
    address from,
    address to,
    uint256 value
  ) internal {
    // bytes4(keccak256(bytes('transferFrom(address,address,uint256)')));
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
    require(success && (data.length == 0 || abi.decode(data, (bool))), "Safe: transferFrom failed");
  }

  // amounts ->[amountIn, [amount1Out,0] or [0,amount1Out], [amount2Out,0] or [0,amount2Out]...]
  function superSwap(
    uint256[] memory amounts,
    address[] memory pools,
    address startToken
  ) public onlyOwner {
    SafeTransferFrom(startToken, msg.sender, pools[0], amounts[0]);
    for (uint256 i; i < pools.length; i++) {
      uint256 amount0Out = amounts[i * 2 + 1];
      uint256 amount1Out = amounts[i * 2 + 2];
      address _to = i == pools.length - 1 ? msg.sender : pools[i + 1];
      IPancakePair(pools[i]).swap(amount0Out, amount1Out, _to, new bytes(0));
    }
  }

  function superSwapBatch(
    uint256[][] memory amountsArr,
    address[][] memory poolsArr,
    address startToken
  ) external onlyOwner returns (bool[] memory) {
    require(amountsArr.length == poolsArr.length, "unbalanced");
    uint256 size = amountsArr.length;
    bool[] memory results = new bool[](size);
    for (uint256 i = 0; i < size; i++) {
      (results[i], ) = address(this).delegatecall(
        abi.encodeWithSignature("superSwap(uint256[],address[],address)", amountsArr[i], poolsArr[i], startToken)
      );
    }
    return results;
  }
}
