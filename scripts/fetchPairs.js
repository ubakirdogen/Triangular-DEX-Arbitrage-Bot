const hre = require("hardhat");
const { saveJSONToFile, saveObjToCsv, readFromJSONFile } = require("./helpers");
const { SUPER_ARBIT_ADDRESS, FACTORY_ADDRESSES, PAIRLIST_OUTPUT_FILE } = require("./config");

/* SuperArbit contract must be already deployed, because this script fetches batch data
 from blockchain using the smart contract */

const QUERY_STEP = 500;
const MAX_DAYS_OLD = 7; // The pool must be active latest 7 days ago in order to be added into results

const fetchData = async () => {
  const superArbit = await hre.ethers.getContractAt("SuperArbit", SUPER_ARBIT_ADDRESS);
  console.log(`Contract deployed at ${superArbit.address}`);
  const pairsArr = [];
  const timeLimit = Math.floor(Date.now() / 1000) - MAX_DAYS_OLD * 24 * 60 * 60;
  try {
    for (key of Object.keys(FACTORY_ADDRESSES)) {
      const factoryAddr = FACTORY_ADDRESSES[key];
      const swapFactory = await hre.ethers.getContractAt("IPancakeFactory", factoryAddr);
      const totalNumOfPairs = await swapFactory.allPairsLength();
      const loopLim = Math.floor(totalNumOfPairs.toNumber() / QUERY_STEP) + 1;
      console.log(`Factory: ${key}`);
      console.log(`Total Number of Pairs: ${totalNumOfPairs}`);
      console.log(`Loop limit: ${loopLim}\n`);
      for (let i = 0; i < loopLim; i++) {
        try {
          console.log(`Querying pairs from index ${i * QUERY_STEP} to ${(i + 1) * QUERY_STEP}...`);
          let data = await superArbit.retrievePairInfo(factoryAddr, i * QUERY_STEP, QUERY_STEP);
          data.forEach((e) => {
            if (e.lastBlockTimestamp >= timeLimit) {
              pairsArr.push({
                fromFactory: key,
                pairAddress: e.pairAddr,
                token0Address: e.token0Addr,
                token1Address: e.token1Addr,
                token0Symbol: e.token0Symbol,
                token1Symbol: e.token1Symbol,
                lastActivity: e.lastBlockTimestamp,
                poolId: e.poolId,
              });
            }
          });
        } catch (error) {
          console.log("Timeout.Trying again...");
          i--;
        }
      }
    }
  } catch (error) {
    console.log("Call Exception Error, aborting...");
    console.log(error);
  } finally {
    // write JSON string to a file
    saveJSONToFile(PAIRLIST_OUTPUT_FILE, pairsArr);
    console.log("JSON file is created.");
  }
};

fetchData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
