#!/usr/bin/env node

/**
 * Escrow Services - CLI Demonstration Script
 *
 * Executes the complete escrow lifecycle using Cardano Preview testnet wallets:
 *  - Time-lock release
 *  - Multi-signature release
 *  - Authorized refund
 *  - Depositor cancel
 *  - Fee-based release
 *
 * Each transaction submission waits 45 seconds to allow Blockfrost to index results.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
    Lucid,
    Blockfrost,
    Data,
    Constr,
    validatorToAddress,
    CML,
} = require('@lucid-evolution/lucid');
const { walletFromSeed } = require('@lucid-evolution/wallet');

const WAIT_MS = 45_000;
const ADA = 1_000_000n;
const TIMELOCK_BUFFER_MS = 2 * 60 * 1000; // 2 minutes
const CANCEL_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

const credentials = {
    PartyA: {
        seed: 'wild wreck ill odor often shift magic manage admit dwarf law input reason cable between pool task tuition romance garment cargo duck person top',
        address: 'addr_test1qqa87az35xekhtstdu0g3jaf7j876l7d36tw42w09c5jmg75q93dmghaearnkgkd74gxtxxtt6glhv5eyj6gg3hplz9s70m5zn',
    },
    PartyB: {
        seed: 'person holiday hawk federal comic noise resist broken front link believe panel volume nominee feed patrol history assume virus vast river please cable seed',
        address: 'addr_test1qpcvn6shugfpts2v7xjv5929dphdsht9ana763zy306ej2036vmla2rgq8xfpzy94r04f07qng9gk2jayarxwnyuu2vqq2uqjp',
    },
    PartyC: {
        seed: 'wreck bid swear pumpkin brain course job across figure blue weird absent switch reopen hurt someone empower silly because section section list decorate youth',
        address: 'addr_test1qrfvuy6u70qkucamwkwdy0l6crfjke5q8z9xtw60vslk2xljxy3aw0rut0nlsyw7as0luh84j0rayg5akywkendvrnys4efl0q',
    },
};

class EscrowCLI {
    constructor() {
        this.lucid = null;
        this.validator = null;
        this.contractAddress = null;
        this.network = process.env.CARDANO_NETWORK || 'Preview';
        this.blockfrostUrl =
            process.env.BLOCKFROST_URL || 'https://cardano-preview.blockfrost.io/api/v0';
        this.blockfrostKey = process.env.BLOCKFROST_KEY;
        this.validatorInfo = null;
        this.datumSchema = null;
        this.redeemerSchema = null;
        this.privateKeys = {};
        this.seedToRole = new Map([
            [credentials.PartyA.seed, 'depositor'],
            [credentials.PartyB.seed, 'beneficiary'],
            [credentials.PartyC.seed, 'authorized'],
        ]);
        this.addresses = {
            depositor: credentials.PartyA.address,
            beneficiary: credentials.PartyB.address,
            authorized: credentials.PartyC.address,
        };
        this.keyHashes = {};
    }

    async initialize() {
        console.log('🚀 Initializing Escrow Services CLI...\n');

        if (!this.blockfrostKey) {
            throw new Error(
                'BLOCKFROST_KEY environment variable is required. Populate .env before running the CLI.',
            );
        }

        console.log('🔗 Connecting to Cardano Preview network via Blockfrost...');
        console.log(`   Network: ${this.network}`);
        console.log(`   Blockfrost URL: ${this.blockfrostUrl}`);

        this.lucid = await Lucid(
            new Blockfrost(this.blockfrostUrl, this.blockfrostKey),
            this.network,
        );

        console.log('✅ Lucid connection established');

        await this.loadValidator();
        await this.deriveContractAddress();
        await this.deriveKeyHashes();
        await this.printWalletBalances();

        // default to depositor wallet for all submissions unless overridden
        this.lucid.selectWallet.fromSeed(credentials.PartyA.seed);
    }

    async loadValidator() {
        const plutusPath = path.join(__dirname, '..', 'plutus.json');

        if (!fs.existsSync(plutusPath)) {
            throw new Error(`Unable to find plutus.json at ${plutusPath}`);
        }

        const plutusData = JSON.parse(fs.readFileSync(plutusPath, 'utf8'));

        if (!plutusData.validators || plutusData.validators.length === 0) {
            throw new Error('plutus.json does not contain any validators');
        }

        const validatorEntry = plutusData.validators[0];
        const compiledCode = validatorEntry.compiledCode;
        if (!compiledCode) {
            throw new Error('Validator entry is missing compiledCode');
        }

        this.validatorInfo = validatorEntry;
        this.datumSchema = validatorEntry?.datum?.schema ?? null;
        this.redeemerSchema = validatorEntry?.redeemer?.schema ?? null;

        this.validator = {
            type: 'PlutusV3',
            script: compiledCode,
        };

        console.log('📄 Validator loaded');
        console.log(`   Script size: ${compiledCode.length} bytes`);
    }

    async deriveContractAddress() {
        this.contractAddress = validatorToAddress(this.network, this.validator);
        console.log(`🏗️ Contract address: ${this.contractAddress}`);
    }

    async deriveKeyHashes() {
        const toKeyHash = (address) => {
            const paymentCred = CML.Address.from_bech32(address).payment_cred();
            const pubKey = paymentCred?.as_pub_key();
            if (!pubKey) {
                throw new Error(`Unable to derive payment key hash for address ${address}`);
            }
            return pubKey.to_hex();
        };

        this.keyHashes = {
            depositor: toKeyHash(this.addresses.depositor),
            beneficiary: toKeyHash(this.addresses.beneficiary),
            authorized: toKeyHash(this.addresses.authorized),
        };

        const depositorWallet = walletFromSeed(credentials.PartyA.seed, { network: this.network });
        const beneficiaryWallet = walletFromSeed(credentials.PartyB.seed, { network: this.network });
        const authorizedWallet = walletFromSeed(credentials.PartyC.seed, { network: this.network });

        this.privateKeys = {
            depositor: depositorWallet.paymentKey,
            beneficiary: beneficiaryWallet.paymentKey,
            authorized: authorizedWallet.paymentKey,
        };

        console.log('🔐 Derived verification key hashes for all parties');
        console.log('   ', this.keyHashes);
    }

    async printWalletBalances() {
        console.log('\n💰 Checking current wallet balances...');

        const parties = [
            { label: 'Depositor (Party A)', seed: credentials.PartyA.seed, address: this.addresses.depositor },
            { label: 'Beneficiary (Party B)', seed: credentials.PartyB.seed, address: this.addresses.beneficiary },
            { label: 'Authorized (Party C)', seed: credentials.PartyC.seed, address: this.addresses.authorized },
        ];

        for (const party of parties) {
            this.lucid.selectWallet.fromSeed(party.seed);
            const utxos = await this.lucid.wallet().getUtxos();
            const lovelace = utxos.reduce(
                (sum, utxo) => sum + (utxo.assets.lovelace || 0n),
                0n,
            );
            console.log(
                `   ${party.label}: ${this.formatAda(lovelace)} ADA (${party.address})`,
            );
        }

        // reset selection back to depositor
        this.lucid.selectWallet.fromSeed(credentials.PartyA.seed);
    }

    formatAda(lovelace) {
        return (Number(lovelace) / 1_000_000).toFixed(2);
    }

    async runDemo() {
        console.log('\n============================================================');
        console.log('ESCROW SERVICES – CARDANO PREVIEW DEMONSTRATION (CLI ONLY)');
        console.log('============================================================\n');

        await this.runTimeLockScenario();
        await this.runMultiSigScenario();
        await this.runRefundScenario();
        await this.runCancelScenario();
        await this.runFeeScenario();

        console.log('\n🎉 All scenarios executed. Review the above transaction hashes to inspect them on Blockfrost.');
    }

    async runTimeLockScenario() {
        console.log('\n🕒 Scenario 1: Time-lock deposit and release (5 ADA, beneficiary unlock)');

        const amount = 5n * ADA;
        const deadlineMs = Date.now() + TIMELOCK_BUFFER_MS;

        const datum = this.buildDatum({
            depositorKeyHash: this.keyHashes.depositor,
            beneficiaryKeyHash: this.keyHashes.beneficiary,
            deadline: deadlineMs,
            requiredSignatures: 1,
            authorizedKeys: [this.keyHashes.beneficiary],
            feePercentage: 0,
            feeRecipientKeyHash: null,
        });

        const utxo = await this.createEscrow({
            label: 'Time-lock deposit',
            amount,
            datum,
        });

        await this.spendEscrow({
            label: 'Time-lock release',
            utxo,
            redeemerTag: 'Release',
            payments: [
                { address: this.addresses.beneficiary, assets: utxo.assets },
            ],
            signerSeeds: [credentials.PartyB.seed],
            signerKeyHashes: [this.keyHashes.beneficiary],
        });

        await this.printWalletBalances();
    }

    async runMultiSigScenario() {
        console.log('\n🔐 Scenario 2: Multi-signature release (5 ADA, 2-of-3 signatures)');

        const amount = 5n * ADA;

        const datum = this.buildDatum({
            depositorKeyHash: this.keyHashes.depositor,
            beneficiaryKeyHash: this.keyHashes.beneficiary,
            deadline: null,
            requiredSignatures: 2,
            authorizedKeys: [
                this.keyHashes.depositor,
                this.keyHashes.beneficiary,
                this.keyHashes.authorized,
            ],
            feePercentage: 0,
            feeRecipientKeyHash: null,
        });

        const utxo = await this.createEscrow({
            label: 'Multi-sig deposit',
            amount,
            datum,
        });

        await this.spendEscrow({
            label: 'Multi-sig release',
            utxo,
            redeemerTag: 'Release',
            payments: [
                { address: this.addresses.beneficiary, assets: utxo.assets },
            ],
            signerSeeds: [credentials.PartyC.seed, credentials.PartyA.seed],
            signerKeyHashes: [this.keyHashes.authorized, this.keyHashes.depositor],
        });

        await this.printWalletBalances();
    }

    async runRefundScenario() {
        console.log('\n↩️ Scenario 3: Authorized refund (5 ADA back to depositor)');

        const amount = 5n * ADA;

        const datum = this.buildDatum({
            depositorKeyHash: this.keyHashes.depositor,
            beneficiaryKeyHash: this.keyHashes.beneficiary,
            deadline: null,
            requiredSignatures: 2,
            authorizedKeys: [
                this.keyHashes.depositor,
                this.keyHashes.authorized,
            ],
            feePercentage: 0,
            feeRecipientKeyHash: null,
        });

        const utxo = await this.createEscrow({
            label: 'Refund deposit',
            amount,
            datum,
        });

        await this.spendEscrow({
            label: 'Authorized refund',
            utxo,
            redeemerTag: 'Refund',
            payments: [
                { address: this.addresses.depositor, assets: utxo.assets },
            ],
            signerSeeds: [credentials.PartyC.seed, credentials.PartyA.seed],
            signerKeyHashes: [this.keyHashes.authorized, this.keyHashes.depositor],
        });

        await this.printWalletBalances();
    }

    async runCancelScenario() {
        console.log('\n🛑 Scenario 4: Depositor cancels escrow before deadline (5 ADA)');

        const amount = 5n * ADA;
        const futureDeadlineMs = Date.now() + CANCEL_BUFFER_MS;
        const cancelValidTo = futureDeadlineMs - 100;

        const datum = this.buildDatum({
            depositorKeyHash: this.keyHashes.depositor,
            beneficiaryKeyHash: this.keyHashes.beneficiary,
            deadline: futureDeadlineMs,
            requiredSignatures: 1,
            authorizedKeys: [this.keyHashes.depositor],
            feePercentage: 0,
            feeRecipientKeyHash: null,
        });

        const utxo = await this.createEscrow({
            label: 'Cancelable deposit',
            amount,
            datum,
        });

        await this.spendEscrow({
            label: 'Depositor cancel',
            utxo,
            redeemerTag: 'Cancel',
            payments: [
                { address: this.addresses.depositor, assets: utxo.assets },
            ],
            signerSeeds: [credentials.PartyA.seed],
            signerKeyHashes: [this.keyHashes.depositor],
            validTo: cancelValidTo,
        });

        await this.printWalletBalances();
    }

    async runFeeScenario() {
        console.log('\n💸 Scenario 5: Fee-based release (5 ADA with 20% service fee)');

        const amount = 5n * ADA;
        const feePercentage = 2000; // 20% in basis points

        const datum = this.buildDatum({
            depositorKeyHash: this.keyHashes.depositor,
            beneficiaryKeyHash: this.keyHashes.beneficiary,
            deadline: null,
            requiredSignatures: 1,
            authorizedKeys: [
                this.keyHashes.authorized,
                this.keyHashes.beneficiary,
            ],
            feePercentage,
            feeRecipientKeyHash: this.keyHashes.authorized,
        });

        const utxo = await this.createEscrow({
            label: 'Fee deposit',
            amount,
            datum,
        });

        const totalLovelace = utxo.assets.lovelace;
        const feeAmount = (totalLovelace * BigInt(feePercentage)) / 10_000n;
        const beneficiaryAmount = totalLovelace - feeAmount;

        console.log(
            `   Fee split → Beneficiary: ${this.formatAda(beneficiaryAmount)} ADA, Fee recipient: ${this.formatAda(feeAmount)} ADA`,
        );

        await this.spendEscrow({
            label: 'Fee-based release',
            utxo,
            redeemerTag: 'Release',
            payments: [
                { address: this.addresses.beneficiary, assets: { lovelace: beneficiaryAmount } },
                { address: this.addresses.authorized, assets: { lovelace: feeAmount } },
            ],
            signerSeeds: [credentials.PartyC.seed],
            signerKeyHashes: [this.keyHashes.authorized],
        });

        await this.printWalletBalances();
    }

    bytesFromHex(hex) {
        return hex.toLowerCase();
    }

    buildDatum({
        depositorKeyHash,
        beneficiaryKeyHash,
        deadline,
        requiredSignatures,
        authorizedKeys,
        feePercentage,
        feeRecipientKeyHash,
    }) {
        const deadlineData =
            deadline === null
                ? new Constr(1, [])
                : new Constr(0, [BigInt(deadline)]);

        const feeRecipientData =
            feeRecipientKeyHash === null
                ? new Constr(1, [])
                : new Constr(0, [this.bytesFromHex(feeRecipientKeyHash)]);

        const authorizedKeyBytes = authorizedKeys.map((key) =>
            this.bytesFromHex(key),
        );

        return Data.to(
            new Constr(0, [
                this.bytesFromHex(depositorKeyHash),
                this.bytesFromHex(beneficiaryKeyHash),
                deadlineData,
                BigInt(requiredSignatures),
                authorizedKeyBytes,
                new Constr(0, [BigInt(feePercentage), feeRecipientData]),
            ]),
            this.datumSchema ?? undefined,
        );
    }

    buildRedeemer(tag) {
        switch (tag) {
            case 'Release':
                return Data.to(
                    new Constr(0, []),
                    this.redeemerSchema ?? undefined,
                );
            case 'Refund':
                return Data.to(
                    new Constr(1, []),
                    this.redeemerSchema ?? undefined,
                );
            case 'Cancel':
                return Data.to(
                    new Constr(2, []),
                    this.redeemerSchema ?? undefined,
                );
            default:
                throw new Error(`Unsupported redeemer tag: ${tag}`);
        }
    }

    async createEscrow({ label, amount, datum }) {
        console.log(`   ➡️ ${label}: locking ${this.formatAda(amount)} ADA into the contract...`);

        this.lucid.selectWallet.fromSeed(credentials.PartyA.seed);

        const txBuilder = this.lucid
            .newTx()
            .pay.ToContract(
                this.contractAddress,
                { kind: 'inline', value: datum },
                { lovelace: amount },
            );

        const tx = await txBuilder.complete();
        const signedTx = await tx.sign.withWallet().complete();
        const txHash = await signedTx.submit();

        console.log(`      Submitted: ${txHash}`);

        await this.waitForIndexer(label);

        const utxo = await this.findContractUtxo(txHash);
        console.log(`      Escrow UTxO located: ${utxo.txHash}#${utxo.outputIndex}`);
        this.lucid.selectWallet.fromSeed(credentials.PartyA.seed);
        return utxo;
    }

    async spendEscrow({ label, utxo, redeemerTag, payments, signerSeeds, signerKeyHashes, validFrom, validTo }) {
        console.log(`   ➡️ ${label}: spending UTxO ${utxo.txHash}#${utxo.outputIndex} with ${redeemerTag} redeemer...`);

        const walletSeedForBuild = signerSeeds[0] ?? credentials.PartyA.seed;
        this.lucid.selectWallet.fromSeed(walletSeedForBuild);

        const redeemer = this.buildRedeemer(redeemerTag);

        let txBuilder = this.lucid
            .newTx()
            .collectFrom([utxo], redeemer);

        for (const payment of payments) {
            txBuilder = txBuilder.pay.ToAddress(payment.address, payment.assets);
        }

        txBuilder = txBuilder.attach.SpendingValidator(this.validator);

        for (const keyHash of signerKeyHashes) {
            txBuilder = txBuilder.addSignerKey(keyHash);
        }

        if (typeof validFrom === 'number') {
            txBuilder = txBuilder.validFrom(validFrom);
        }
        if (typeof validTo === 'number') {
            txBuilder = txBuilder.validTo(validTo);
        }

        if (typeof validFrom === 'number' || typeof validTo === 'number') {
            console.log(
                `      Validity window -> from: ${validFrom ?? 'unbounded'}, to: ${validTo ?? 'unbounded'}`,
            );
        }

        const tx = await txBuilder.complete();

        const privateKeys = signerSeeds.map((seed) => this.getPrivateKeyForSeed(seed));

        let signBuilder = tx;
        for (const privateKey of privateKeys) {
            signBuilder = signBuilder.sign.withPrivateKey(privateKey);
        }

        const signedTx = await signBuilder.complete();
        const txHash = await signedTx.submit();

        console.log(`      Submitted: ${txHash}`);
        await this.waitForIndexer(label);
        this.lucid.selectWallet.fromSeed(credentials.PartyA.seed);

        return txHash;
    }

    getPrivateKeyForSeed(seed) {
        const role = this.seedToRole.get(seed);
        if (!role || !this.privateKeys[role]) {
            throw new Error('Unable to map seed to private key');
        }
        return this.privateKeys[role];
    }

    async findContractUtxo(txHash) {
        const maxAttempts = 6;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const utxos = await this.lucid.utxosAt(this.contractAddress);
            const match = utxos.find((utxo) => utxo.txHash === txHash);
            if (match) {
                return match;
            }
            if (attempt < maxAttempts) {
                console.log(
                    `      Contract UTxO not found yet (attempt ${attempt}/${maxAttempts}). Waiting 45 seconds before retry...`,
                );
                await this.sleep(WAIT_MS);
            }
        }
        throw new Error(
            `Contract UTxO for transaction ${txHash} not found after waiting. Please verify indexing status manually.`,
        );
    }

    async waitForIndexer(reason) {
        console.log(`      ⏳ Waiting 45 seconds for ${reason} to be indexed by Blockfrost...`);
        await this.sleep(WAIT_MS);
        console.log(`      ⌛ Done waiting for ${reason}.`);
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

async function main() {
    try {
        const cli = new EscrowCLI();
        await cli.initialize();
        await cli.runDemo();
    } catch (error) {
        console.error('\n❌ CLI execution failed:');
        console.error(error);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = { EscrowCLI, credentials };
