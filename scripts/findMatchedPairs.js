const { bnSqrt, saveJSONToFile, saveObjToCsv, readFromJSONFile } = require("./helpers");
const hre = require("hardhat");
const { PIVOT_TOKEN, PAIRLIST_OUTPUT_FILE, MATCHED_PAIRS_OUTPUT_FILE } = require("./config");

// helpers
function getPairsOtherToken(pair, firstToken) {
  if (pair["token0Address"] == firstToken) return pair["token1Address"];
  else if (pair["token1Address"] == firstToken) return pair["token0Address"];
  else return "";
}

function isTokenInPair(pair, token) {
  return pair["token0Address"] == token || pair["token1Address"] == token;
}

function printProgress(curr, total) {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(`${curr.toString()} of total ${total.toString()}`);
}

pairsArr = readFromJSONFile(PAIRLIST_OUTPUT_FILE);
const pivotPairs = pairsArr.filter((pair) => isTokenInPair(pair, PIVOT_TOKEN));
const pivotPairTokens = new Set(pivotPairs.map((p) => getPairsOtherToken(p, PIVOT_TOKEN)));

const otherPairs = pairsArr.filter((pair) => !isTokenInPair(pair, PIVOT_TOKEN));
console.log(`Total number of pivot pairs: ${pivotPairs.length}`);
console.log(`Total number of other pairs: ${otherPairs.length}`);

const matchPairs = [];
const includedPairs = new Set();
const lenPivotPairs = pivotPairs.length;

for (let [index, pivotPair] of pivotPairs.entries()) {
  printProgress(index + 1, lenPivotPairs);
  let firstToken = getPairsOtherToken(pivotPair, PIVOT_TOKEN);
  let pathPairs = "";
  let matchObj = {};
  matchObj[firstToken] = [];
  matchObj.startPool = pivotPair["pairAddress"];
  matchObj.middlePools = [];
  matchObj.endPools = [];
  for (let otherPair of otherPairs) {
    let secondToken = getPairsOtherToken(otherPair, firstToken);
    if (secondToken != "" && pivotPairTokens.has(secondToken)) {
      for (endPair of pivotPairs) {
        let otherToken = getPairsOtherToken(endPair, PIVOT_TOKEN);
        if (otherToken == secondToken) {
          const pathPairs = [
            pivotPair["pairAddress"].toLowerCase(),
            otherPair["pairAddress"].toLowerCase(),
            endPair["pairAddress"].toLowerCase(),
          ];
          const pathPairsJoined = pathPairs.sort().join();
          if (!includedPairs.has(pathPairsJoined)) {
            matchObj[firstToken].push(secondToken);
            matchObj.middlePools.push(otherPair["pairAddress"]);
            matchObj.endPools.push(endPair["pairAddress"]);
            includedPairs.add(pathPairsJoined);
          }
        }
      }
    }
  }
  if (matchObj[firstToken].length > 0) {
    matchPairs.push(matchObj);
  }
}
saveJSONToFile(MATCHED_PAIRS_OUTPUT_FILE, matchPairs);
