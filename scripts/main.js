const { generateTriads, addPairReserves, calculateProfit } = require("./arbUtils");
const hre = require("hardhat");
const { ethers, network } = require("hardhat");
const { PIVOT_TOKEN, SUPER_ARBIT_ADDRESS, MATCHED_PAIRS_OUTPUT_FILE, MAX_GAS, MAX_TRADE_INPUT } = require("./config");

let execCount = 0; // Delete later...

const checkProfitAndExecute = async function (lucrPaths, router, signer, gasPrice) {
  console.log("Static batch check starts...");
  const startToken = PIVOT_TOKEN;
  for (const lucrPath of lucrPaths) {
    const pools = lucrPath.pools;
    amounts = [lucrPath.optimumAmountInBN];
    for (let i = 0; i < lucrPath.path.length - 1; i++) {
      if (lucrPath.path[i].toLowerCase() < lucrPath.path[i + 1].toLowerCase()) {
        amounts.push("0");
        amounts.push(lucrPath.swapAmounts[i]);
      } else {
        amounts.push(lucrPath.swapAmounts[i]);
        amounts.push("0");
      }
      lucrPath.execAmounts = amounts;
      lucrPath.execPools = pools;
    }
  }
  const amountsArr = lucrPaths.map((l) => l.execAmounts);
  const poolsArr = lucrPaths.map((l) => l.execPools);
  let result = [];
  try {
    result = await router.callStatic.superSwapBatch(amountsArr, poolsArr, startToken, { gasLimit: MAX_GAS * 10 });
  } catch (error) {
    console.log(`reason:${error.reason}`);
  }
  const lucrPathsPassed = lucrPaths.filter((l, index) => result[index]);
  // execute!
  console.log("Number of triads, which passed static check: ", lucrPathsPassed.length);
  for (const path of lucrPathsPassed) {
    path.gas = "0";
    if (parseFloat(path.optimumAmountIn) < MAX_TRADE_INPUT) {
      console.log("Amount In= ", path.optimumAmountIn);
      try {
        let gas = await router.estimateGas.superSwap(path.execAmounts, path.execPools, startToken);
        console.log("Gas(static) used: ", gas);
        path.gas = gas.toString();
        const gasCost = gas.mul(gasPrice);
        const newProfit = ethers.BigNumber.from(path.expectedProfitBN).sub(gasCost);
        console.log("New Profit", parseFloat(ethers.utils.formatEther(newProfit)));
        if (newProfit.gt(0)) {
          await router.callStatic.superSwap(path.execAmounts, path.execPools, startToken, { gasLimit: MAX_GAS });
          router.superSwap(path.execAmounts, path.execPools, startToken, { gasLimit: MAX_GAS });
          console.log("!!!!EXECUTED!!!");
          execCount++;
        }
      } catch (error) {
        console.log(error.reason);
      }
    }
  }
  return lucrPathsPassed;
};

const main = async () => {
  // ---connect to router and other stuff, reorg later---
  const router = await ethers.getContractAt("SuperArbit", SUPER_ARBIT_ADDRESS);
  const signer = await ethers.getSigner();

  // Fetch the current gas price from the BSC network
  const gasPrice = await ethers.provider.getGasPrice();
  console.log("Current gas price:", parseFloat(ethers.utils.formatUnits(gasPrice, "gwei")), "gwei");

  let triads = generateTriads(MATCHED_PAIRS_OUTPUT_FILE); // generate triads with pivot token -> WBNB
  let allLucrPathsPassed = [];
  while (true) {
    const stepSize = 333;
    const numOfTriads = triads.length;
    const loopLim = Math.floor(numOfTriads / stepSize);
    console.log(`\nNumber of Triads from JSON:${numOfTriads}, Total number of batches:${loopLim}\n`);
    let i = 0;
    let triadsSliced;

    while (i <= loopLim) {
      console.log(`Processing batch ${i + 1} of total ${loopLim}`);
      if (i != loopLim) {
        triadsSliced = triads.slice(i * stepSize, (i + 1) * stepSize);
      } else {
        triadsSliced = triads.slice(i * stepSize, i * stepSize + (numOfTriads % stepSize));
      }
      const triadsWithRes = await addPairReserves(triadsSliced, router, (batchSize = stepSize * 3));
      const lucrPaths = calculateProfit(triadsWithRes);
      console.log("Length of lucrative triads in current batch:", lucrPaths.length);
      //-------------------------------------
      //--Here comes the check/execute stuff
      const lucrPathsPassed = await checkProfitAndExecute(lucrPaths, router, signer, gasPrice);
      if (lucrPathsPassed.length > 0) allLucrPathsPassed = allLucrPathsPassed.concat(lucrPathsPassed);
      console.log("Length all lucrative paths passed: ", allLucrPathsPassed.length);
      console.log(`-------Total number of executions: ${execCount}\n`);
      i++;
    }
  }
};

main().then();
