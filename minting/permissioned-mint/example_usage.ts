/** CONFIG START **/
const onMainnet: boolean = false;
// This is a fake Blockfrost project ID, replace with your own
const projectId = "preprod1531080efba466afa5696785c4e8362c" // Your Blockfrost project ID
// Use this wallet at your own risk...
const mnemonic: string = "rug rug rug rug rug rug rug rug rug rug rug rug rug rug dad" // Your seed phrase.
const name: string = "RUGMEDADDY"
const token_name: string = "Rug Me Daddy";
const token_description: string = "Sometimes you just want Daddy to rug you!";
const token_ticker: string = "RUGME";
const token_logo: string = "ipfs://QmfTsmWsf99YRXRC4GSqa6H7FHXNVAkL13YTcRK1SQAtnt";
const fungible_quantity: bigint = 10n;
const token_decimals: bigint | undefined = undefined;
const token_image: string | undefined = undefined;
/** CONFIG END **/

/**!!! DO NOT EDIT BELOW THIS LINE !!!**/

import {
    AssetId,
    Address,
    AssetName,
    CborSet,
    Credential,
    ConstrPlutusData,
    PlutusList,
    PlutusMap,
    NativeScript,
    Ed25519KeyHashHex,
    PlutusData,
    PlutusV2Script,
    PolicyId,
    Value,
    Transaction,
    TransactionId,
    toHex,
    fromHex,
    addressFromValidator
} from "@blaze-cardano/core";
import {
    Blockfrost,
    // Value,
    Blaze,
    HotWallet,
    Data,
    Core,
} from "@blaze-cardano/sdk";
import {toLabel} from './util';
import {PermissionedMintMint} from "./plutus"

/**
 * This method submits a transaction to the chain.
 * @param url
 * @param project
 * @param tx - The Transaction
 * @returns A Promise that resolves to a TransactionId type
 */
const postTransactionToChain = async (url, project, tx: Transaction): Promise<string> => {
    const query = "/tx/submit";
    console.log(tx.toCbor());
    const response = await fetch(`${url}${query}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/cbor",
            Accept: "application/json",
            project_id: project,
        },
        body: fromHex(tx.toCbor()),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(
            `postTransactionToChain: failed to submit transaction to Blockfrost endpoint.\nError ${error}`,
        );
    }

    const txId = await response.text();
    return txId;
}

if (!projectId) {
    throw new Error("Missing blockfrost key");
}

const provider = new Blockfrost({
    network: onMainnet ? "cardano-mainnet" : "cardano-preprod",
    projectId,
});

const entropy = Core.mnemonicToEntropy(mnemonic, Core.wordlist);
const masterkey = Core.Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), "");

const wallet = await HotWallet.fromMasterkey(masterkey.hex(), provider, onMainnet ? 1 : 0);
const blaze = await Blaze.from(provider, wallet);

const address = wallet.address;
const cred = address.getProps().paymentPart;
console.log(address.toBech32());

const policy = new PermissionedMintMint({Inline: [{VerificationKeyCredential: [cred!.hash]}]}, true)
const policyId = policy.hash()
const flabel = toLabel(333)
const rlabel = toLabel(100)

const tokenMap = new Map<AssetId, bigint>();
const rtokenMap = new Map<AssetId, bigint>();
const encoder = new TextEncoder();
const uint8name = encoder.encode(name);
const assetId: AssetId = AssetId(policyId.toString() + flabel + toHex(uint8name))
const refAssetId: AssetId = AssetId(policyId.toString() + rlabel + toHex(uint8name))

tokenMap.set(assetId, fungible_quantity);
rtokenMap.set(refAssetId, 1n)

const mintMap = new Map<AssetName, bigint>();
mintMap.set(AssetName(flabel + toHex(uint8name)), fungible_quantity);
mintMap.set(AssetName(rlabel + toHex(uint8name)), 1n);

const metadata = new PlutusList();
const metaMap = new PlutusMap();

metaMap.insert(PlutusData.newBytes(encoder.encode("name")), PlutusData.newBytes(encoder.encode(token_name)));
metaMap.insert(PlutusData.newBytes(encoder.encode("description")), PlutusData.newBytes(encoder.encode(token_description)));
metaMap.insert(PlutusData.newBytes(encoder.encode("ticker")), PlutusData.newBytes(encoder.encode(token_ticker)));
metaMap.insert(PlutusData.newBytes(encoder.encode("logo")), PlutusData.newBytes(encoder.encode(token_logo)));

if (token_decimals !== undefined) {
    metaMap.insert(PlutusData.newBytes(encoder.encode("decimals")), PlutusData.newInteger(token_decimals));
}

if (token_image !== undefined) {
    metaMap.insert(PlutusData.newBytes(encoder.encode('image')), PlutusData.newBytes(encoder.encode(token_image)));
}

metadata.add(PlutusData.newMap(metaMap));
metadata.add(PlutusData.newInteger(1n))


const lockerAddress = addressFromValidator(onMainnet ? 1 : 0, policy);
console.log(lockerAddress.toBech32());
let tx;
try {
// Assumes that the wallet contains at least 5 ADA + tx fees.
    tx = await blaze
        .newTransaction()
        .lockAssets(lockerAddress, new Value(5_000_000n, rtokenMap), PlutusData.newConstrPlutusData(new ConstrPlutusData(0n, metadata)))
        .payAssets(address, new Value(5_000_000n, tokenMap))
        .addMint(PolicyId(policyId), mintMap, Data.to("Minting", PermissionedMintMint.rdmr))
        .addRequiredSigner(Ed25519KeyHashHex(cred!.hash))
        .provideScript(policy)
        .complete();
} catch (e) {
    console.error('Error building txn! Is the wallet funded?');
}

if (tx) {
    console.log("Balanced and unwitnessed transaction CBOR:");
    console.log(tx.toCbor() + "\n");

    const signed = await blaze.signTransaction(tx);

    console.log("Signed transaction CBOR:");
    console.log(signed.toCbor() + "\n");
    console.log(Core.fromHex(signed.toCbor()));

    const txId = await postTransactionToChain(blaze.provider.url, blaze.provider.headers().project_id, signed);

    console.log(
        `Transaction with ID ${txId} has been successfully submitted to the blockchain.`,
    );
}