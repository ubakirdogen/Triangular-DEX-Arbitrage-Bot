const ethers = require("ethers");
const fs = require("fs");
const ObjectsToCsv = require("objects-to-csv");

const bnSqrt = (value) => {
  const ONE = ethers.BigNumber.from(1);
  const TWO = ethers.BigNumber.from(2);
  let x = ethers.BigNumber.from(value);
  let z = x.add(ONE).div(TWO);
  let y = x;
  while (z.sub(y).isNegative()) {
    y = z;
    z = x.div(z).add(z).div(TWO);
  }
  return y;
};

const saveJSONToFile = (filepath, data) => {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), (err) => {
    if (err) {
      throw err;
    }
  });
};

const saveObjToCsv = async (obj, filepath) => {
  const csv = new ObjectsToCsv(obj);
  await csv.toDisk(filepath);
  console.log("CSV file is created. Path: ", filepath);
};

const readFromJSONFile = (filepath) =>
  JSON.parse(fs.readFileSync(filepath, "utf8"));

exports.bnSqrt = bnSqrt;
exports.saveJSONToFile = saveJSONToFile;
exports.saveObjToCsv = saveObjToCsv;
exports.readFromJSONFile = readFromJSONFile;
