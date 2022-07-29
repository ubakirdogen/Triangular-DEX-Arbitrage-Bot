const { bnSqrt, saveJSONToFile, saveObjToCsv, readFromJSONFile } = require("./helpers");
const { ethers, network } = require("hardhat");
const hre = require("hardhat");
const { recoverAddress } = require("ethers/lib/utils");
const { PIVOT_TOKEN } = require("./config");

const generateTriads = function (matchPairFile) {
  const matchPairList = readFromJSONFile(matchPairFile);
  const tokenTriads = [];
  for (let match of matchPairList) {
    let firstToken = Object.keys(match)[0];
    for (let i in match[firstToken]) {
      let triadObj = {};
      triadObj.path = [PIVOT_TOKEN, firstToken, match[firstToken][i], PIVOT_TOKEN];
      triadObj.pools = [match.startPool, match.middlePools[i], match.endPools[i]];
      tokenTriads.push(triadObj);
    }
  }
  return tokenTriads;
};

const addPairReserves = async function (triads, superArbit, batchSize) {
  const pairAddrList = triads.map((e) => e.pools).flat();
  let pairReserveList = [];
  const numOfPairs = pairAddrList.length;
  const loopLim = Math.floor(numOfPairs / batchSize);
  let i = 0;
  let pairAddrBatch;
  while (i <= loopLim) {
    if (i != loopLim) {
      pairAddrBatch = pairAddrList.slice(i * batchSize, (i + 1) * batchSize);
    } else {
      pairAddrBatch = pairAddrList.slice(i * batchSize, i * batchSize + (numOfPairs % batchSize));
    }
    try {
      pairReserveList = pairReserveList.concat(await superArbit.getBatchReserves(pairAddrBatch));
      i++;
    } catch (error) {
      console.log("Trying again step ", i);
    }
  }
  const triadsWithRes = [];
  for (const [index, triad] of triads.entries()) {
    let numLegs = triad.pools.length;
    triad.reserves = pairReserveList.slice(index * numLegs, (index + 1) * numLegs);
    triadsWithRes.push(triad);
  }
  return triadsWithRes;
};

// params
const RATIO_SCALE_FACT = 100000;
const RATIO_SCALE_FACT_BN = ethers.BigNumber.from(RATIO_SCALE_FACT);
const MAX_RATIO_LIM = ethers.BigNumber.from(1.5 * RATIO_SCALE_FACT);
const R1 = ethers.BigNumber.from(0.9969 * RATIO_SCALE_FACT); // %0,3 input fee
const R2 = ethers.BigNumber.from(1 * RATIO_SCALE_FACT); // %0 output fee
const APPROX_GAS_FEE = ethers.BigNumber.from("1250000000000000"); //("1250000000000000"); //250000 gas * 5 gwei per gas

const getAmountsOut = function (amountIn, reserves, r1, ratioScaleFact) {
  const amounts = [];
  let amountInTemp = amountIn;
  for (const reserve of reserves) {
    amountInTemp = getAmountOut(amountInTemp, reserve[0], reserve[1], r1, ratioScaleFact);
    amounts.push(amountInTemp);
  }
  return amounts;
};

const getAmountOut = function (amountIn, res0, res1, r1, ratioScaleFact) {
  return amountIn
    .mul(r1)
    .mul(res1)
    .div(res0.mul(ratioScaleFact).add(amountIn.mul(r1)));
};

const calculateProfit = function (triadsWithRes) {
  lucrPaths = [];
  for (const triad of triadsWithRes) {
    let reserves = [];
    for (const [i, pool] of triad.pools.entries()) {
      const resPool = triad.reserves[i];
      let resFirst;
      let resSecond;
      if (triad.path[i].toLowerCase() < triad.path[i + 1].toLowerCase()) reserves.push([resPool.reserve0, resPool.reserve1]);
      else reserves.push([resPool.reserve1, resPool.reserve0]);
    }
    let res = calcRatio(reserves, R1, R2);
    if (res.ratio != undefined) {
      if (res.reverse) {
        triad.path.reverse();
        triad.pools.reverse();
        // reverse the reserves array for backward trades
        reserves.reverse();
        reserves.map((r) => r.reverse());
      }
      const { optAmountIn, amountOut } = calcOptiAmountIn(reserves, R1, R2);
      const expectedProfit = amountOut.sub(optAmountIn).sub(APPROX_GAS_FEE);
      // populate only profitable triads
      if (expectedProfit.gt(0)) {
        triad.reserves = reserves.map((rs) => rs.map((r) => r.toString()));
        swapAmounts = getAmountsOut(optAmountIn, reserves, R1, RATIO_SCALE_FACT_BN);
        triad.swapAmounts = swapAmounts.map((s) => s.toString());
        triad.ratio = res.ratio.toNumber() / RATIO_SCALE_FACT;
        triad.optimumAmountInBN = optAmountIn.toString();
        triad.AmountOutBN = amountOut.toString();
        triad.expectedProfitBN = expectedProfit.toString();
        if (optAmountIn.eq(0)) triad.realRatio = NaN;
        else triad.realRatio = amountOut.sub(optAmountIn).mul(10000).div(optAmountIn).toNumber() / 10000;
        triad.optimumAmountIn = parseFloat(ethers.utils.formatEther(optAmountIn));
        triad.AmountOut = parseFloat(ethers.utils.formatEther(amountOut));
        triad.expectedProfit = parseFloat(ethers.utils.formatEther(expectedProfit));
        lucrPaths.push(triad);
      }
    }
  }
  return lucrPaths;
};

function calcOptiAmountIn(reserves, r1, r2) {
  // straight implementation for triangular case
  // use loop version for cyclic arb. with more legs
  // "Cyclic Arbitrage in Decentralized Exchanges - Wang,Chen, Zhou"
  const a12 = reserves[0][0];
  const a21 = reserves[0][1];
  const a23 = reserves[1][0];
  const a32 = reserves[1][1];
  const a31 = reserves[2][0];
  const a13 = reserves[2][1];

  const a_13 = a12.mul(a23).div(a23.add(r1.mul(r2).mul(a21).div(RATIO_SCALE_FACT_BN.pow(2))));
  const a_31 = a21
    .mul(a32)
    .mul(r1)
    .mul(r2)
    .div(RATIO_SCALE_FACT_BN.pow(2).mul(a23.add(r1.mul(r2).mul(a21).div(RATIO_SCALE_FACT_BN.pow(2)))));
  const a = a_13.mul(a31).div(a31.add(r1.mul(r2).mul(a_31).div(RATIO_SCALE_FACT_BN.pow(2))));
  const a_ = r1
    .mul(r2)
    .mul(a13)
    .mul(a_31)
    .div(RATIO_SCALE_FACT_BN.pow(2).mul(a31.add(r1.mul(r2).mul(a_31).div(RATIO_SCALE_FACT_BN.pow(2)))));
  const optAmountIn = bnSqrt(r1.mul(r2).mul(a_).mul(a).div(RATIO_SCALE_FACT_BN.pow(2)))
    .sub(a)
    .mul(RATIO_SCALE_FACT_BN)
    .div(r1);
  // calculate achievable amountOut
  let amountOut;
  let amountIn = optAmountIn;
  reserves.forEach((r) => {
    amountOut = r1
      .mul(r2)
      .mul(r[1])
      .mul(amountIn)
      .div(RATIO_SCALE_FACT_BN.pow(2))
      .div(r[0].add(r1.mul(amountIn).div(RATIO_SCALE_FACT_BN)));
    amountIn = amountOut;
  });
  return { optAmountIn, amountOut };
}

function calcRatio(reserves, r1, r2) {
  let result = { ratio: undefined, reverse: undefined };
  try {
    const feeRatio = RATIO_SCALE_FACT_BN.pow(7).div(r1.pow(3)).div(r2.pow(3));
    const num = reserves[0][1].mul(reserves[1][1]).mul(reserves[2][1]);
    const den = reserves[0][0].mul(reserves[1][0]).mul(reserves[2][0]);
    const forwardRatio = num.mul(RATIO_SCALE_FACT).div(den);
    const reverseRatio = den.mul(RATIO_SCALE_FACT).div(num);
    if (forwardRatio.gt(RATIO_SCALE_FACT_BN) && forwardRatio.lt(MAX_RATIO_LIM) && forwardRatio.gt(feeRatio)) {
      result = { ratio: forwardRatio.sub(feeRatio), reverse: false };
    } else if (reverseRatio.gt(RATIO_SCALE_FACT_BN) && reverseRatio.lt(MAX_RATIO_LIM) && reverseRatio.gt(feeRatio)) {
      result = { ratio: reverseRatio.sub(feeRatio), reverse: true };
    }
  } catch (error) {}

  return result;
}

exports.generateTriads = generateTriads;
exports.addPairReserves = addPairReserves;
exports.calculateProfit = calculateProfit;
exports.APPROX_GAS_FEE = APPROX_GAS_FEE;
