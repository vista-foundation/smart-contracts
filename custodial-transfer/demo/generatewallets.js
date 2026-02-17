const { generateSeedPhrase, Lucid, Koios } = require('@lucid-evolution/lucid');
async function main() {
const lucid = await Lucid(
  new Koios("https://preview.koios.rest/api/v1"),
  'Preview'
);

let credentials= {};

const seed1 = generateSeedPhrase();
lucid.selectWallet.fromSeed(seed1);

credentials.PartyA = {
  seed: seed1,
  address: await lucid.wallet().address(),
}

const seed2 = generateSeedPhrase();
lucid.selectWallet.fromSeed(seed2);

credentials.PartyB = {
  seed: seed2,
  address: await lucid.wallet().address(),
}

const seed3 = generateSeedPhrase();
lucid.selectWallet.fromSeed(seed3);

credentials.PartyC = {
  seed: seed3,
  address: await  lucid.wallet().address(),
}

  console.log(credentials);
}

main();