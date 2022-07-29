const { ethers } = require("hardhat");
const hre = require("hardhat");
const { PIVOT_TOKEN } = require("./config");

const WBNB_ADDR = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

async function deploy() {
  // Get the contract to deploy
  const SuperArbit = await hre.ethers.getContractFactory("SuperArbit");
  const superArbit = await SuperArbit.deploy();

  await superArbit.deployed();
  console.log("SuperArbit deployed to:", superArbit.address);

  // Approve super arbit contract to swap WBNB
  const wbnbToken = await ethers.getContractAt("IERC20", PIVOT_TOKEN);
  await wbnbToken.approve(superArbit.address, "0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
}

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
