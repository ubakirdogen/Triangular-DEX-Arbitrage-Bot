# Simple Bot for Triangular DEX Arbitrage

## 1. Description

This bot is designed to make automated crypto token cyclic-arbitrage transactions on DEX platforms(Decentralized Exchange) for profit. The implemented form of the arbitrage is cyclic-arbitrage with three legs, so the name "Triangular". In triangular arbitrage, the aim is to start with an asset(here it is crypto tokens) and do 3 swap transactions to end with the start token. An example would be: WBNB->BUSD->Cake->WBNB The bot constantly searches for arbitrage opportunites on different DEX platforms and if the trade is profitable(end amount > start amount + transaction fees), then the trade is executed. It can be used on DEX platforms where Uniswap V2 AMM(Automated Market Maker) is utilized for swap calculations. 

I used/tested this bot on Binance Smart Chain(BSC) where significant number of DEX platforms can be found, which are all Uniswap V2 clones (Such as PancakeSwap, biSwap, MDEX etc.) yet it can be used on other EVM-compatible blockchains like Ethereum, Avalanche etc. with slight modification of parameters.
The algorithm(profitibility calculations, calculation of optimum input token amount etc.) used in this project is taken from [this paper](https://arxiv.org/pdf/2105.02784.pdf)

A smart contract is also written for batched data fetching from blockchain(to speed up the searching as well as for minimizing the number of request from RPC Node API) and batched static checking of swap transactions to see if they go through without executing actual transaction. In order to run the bot, the contract must be deployed on mainnet of the blockchain(for example on BSC)
This project is built on Hardhat/ethers.js

## 2. Run on local

### 2.1 Requirements

After cloning this repo: (node.js must be already installed)

```bash
$ npm install
```

### 2.2. Usage

Usage is based on BSC.
Before starting, change the name of the file ".env sample" to ".env" and update the information, which is then needed in hardhat.config.js

1. After installing the dependencies, first compile and deploy the contract(for BSC)

```bash
$ npx hardhat compile
$ npx hardhat run ./scripts/superArbitDeploy.js --network bscmain_bscrpc
```

2. After contract deployment, update the contract address in config.js(SUPER_ARBIT_ADDRESS)
   First we fetch all the swap pairs from available DEX platform pools.Only pairs from pools, that are active in last 7 days(can be changed), are fetched.
   This scripts outputs all the available pairs in a json file.(see pairsList.json)

```bash
$ npx hardhat run ./scripts/fetchPairs.js --network bscmain_bscrpc
```

3. Next step is to find all possible routes which starts with pivot token(WBNB) and ends also with the same token with two other tokens in between.
   After succesful run, this script outputs the result also in a json file.(see matchedPairs.json)

```bash
$ npx hardhat run ./scripts/findMatchedPairs.js --network bscmain_bscrpc
```

4. In the last step, run the main.js to check arbitrage opportunities as well as execute transactions if they are profitable.

```bash
$ npx hardhat run ./scripts/main.js --network bscmain_bscrpc
```

## Disclaimer

Use this bot at your own risk!
This bot occasionally finds arbitrage opportunities and execute them. Sometimes it is possible that the transactions are reverted, which can result from many reasons.(For example, a swap transaction is executed before ours, which changes the balances one of the swap pools, so the calculation is not valid anymore). So the bot must be improved in order to catch such situations.
