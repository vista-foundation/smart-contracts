import type { LucidEvolution } from '@lucid-evolution/lucid';
import { loadLucidModule } from './lucid';
import { credentials, SENDER_PASSPHRASE, RECEIVER_PASSPHRASE, CUSTODIAN_PASSPHRASE, RECEIVER_ADDRESS } from './credentials';
import { ContractState } from './state';
import { ENV } from './env';
// @ts-ignore - @noble/hashes uses .js exports
import { blake2b } from '@noble/hashes/blake2.js';
// @ts-ignore - @noble/hashes uses .js exports
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Computes the output tag from an OutputReference (txHash + outputIndex)
 * This must match the on-chain hash_output_reference function exactly.
 *
 * The OutputReference is CBOR-encoded as a constructor (tag 121) with two fields:
 * - transaction_id: ByteArray (32 bytes)
 * - output_index: Integer
 *
 * M-01 FIX: This tag ensures each output can only satisfy one validator execution,
 * preventing double satisfaction attacks.
 */
function computeOutputTag(txHash: string, outputIndex: number): string {
    // We need to CBOR encode the OutputReference the same way Aiken does
    // OutputReference is a record with transaction_id and output_index
    // In CBOR, this is encoded as a constructor (tag 121 for index 0) with an array of fields

    // Convert txHash from hex to bytes
    const txHashBytes = hexToBytes(txHash);

    // CBOR encode the OutputReference structure
    // Tag 121 (constructor 0) + array of 2 elements
    // Element 1: ByteArray (txHash) - major type 2
    // Element 2: Integer (outputIndex) - major type 0

    const cborParts: number[] = [];

    // Tag 121 for constructor index 0 (0xD8 0x79)
    cborParts.push(0xD8, 0x79);

    // Array of 2 elements (0x82)
    cborParts.push(0x82);

    // ByteArray: txHash (32 bytes, so 0x58 0x20 prefix)
    cborParts.push(0x58, 0x20);
    for (const byte of txHashBytes) {
        cborParts.push(byte);
    }

    // Integer: outputIndex (if small, just the value; if 0, just 0x00)
    if (outputIndex === 0) {
        cborParts.push(0x00);
    } else if (outputIndex < 24) {
        cborParts.push(outputIndex);
    } else if (outputIndex < 256) {
        cborParts.push(0x18, outputIndex);
    } else {
        // For larger indices, use 2-byte encoding
        cborParts.push(0x19, (outputIndex >> 8) & 0xFF, outputIndex & 0xFF);
    }

    const cborBytes = new Uint8Array(cborParts);

    // Hash with blake2b-256 (same as Aiken's blake2b_256)
    const hashBytes = blake2b(cborBytes, { dkLen: 32 });

    return bytesToHex(hashBytes);
}

export class CustodialTransferDemo {
    private lucid: LucidEvolution | null = null;
    private validator: any = null;
    private state: ContractState = {};
    private contractBlueprint: any = null;

    // We'll use direct constructor approach for simplicity

    async loadContractBlueprint() {
        if (!this.contractBlueprint) {
            try {
                console.log('📄 Loading contract blueprint...');
                const blueprintModule = await import('../../../plutus.json', { assert: { type: 'json' } });
                this.contractBlueprint = blueprintModule.default || blueprintModule;
                console.log('✅ Contract blueprint loaded successfully');
                console.log('🔍 Blueprint structure:', {
                    hasValidators: !!this.contractBlueprint?.validators,
                    validatorsCount: this.contractBlueprint?.validators?.length,
                    firstValidator: this.contractBlueprint?.validators?.[0]
                });

                // Validate blueprint structure
                if (!this.contractBlueprint.validators || this.contractBlueprint.validators.length === 0) {
                    console.error('❌ No validators found in blueprint');
                    this.contractBlueprint = null;
                } else if (!this.contractBlueprint.validators[0].compiledCode) {
                    console.error('❌ No compiled code found in first validator');
                    this.contractBlueprint = null;
                }
            } catch (error) {
                console.error('❌ Failed to load contract blueprint:', error);
                this.contractBlueprint = null;
            }
        }
        return this.contractBlueprint;
    }

    async initialize() {
        console.log('🚀 Starting CustodialTransferDemo initialization...');
        console.log('📋 Credentials loaded:', {
            'PartyA (User A / Sender)': credentials.PartyA.address,
            'PartyB (User B / Final Receiver)': credentials.PartyB.address,
            'PartyC (Entity C / Custodian)': credentials.PartyC.address
        });

        try {
            this.log('Initializing Lucid with Blockfrost...');
            console.log('🔗 Attempting to connect to Blockfrost...');

            // Schemas not needed - using direct constructor approach

            // Load contract blueprint
            await this.loadContractBlueprint();

            // Load Lucid Evolution lazily
            const { Blockfrost, Lucid } = await loadLucidModule();

            // Initialize Lucid with Blockfrost (using preview testnet)
            this.lucid = await Lucid(
                new Blockfrost(ENV.BLOCKFROST_URL, ENV.BLOCKFROST_KEY),
                ENV.CARDANO_NETWORK as any
            );
            console.log('✅ Lucid instance created successfully');

            // Load the contract validator
            if (this.contractBlueprint && this.contractBlueprint.validators) {
                console.log('📄 Loading contract validator from plutus.json...');
                console.log(' Contract blueprint validator:', this.contractBlueprint.validators[0]);

                const compiledCode = this.contractBlueprint.validators[0].compiledCode;
                if (!compiledCode) {
                    console.error('❌ No compiled code found in validator');
                    this.validator = null;
                } else {
                    this.validator = {
                        type: 'PlutusV3',
                        script: compiledCode,
                    };

                    console.log('✅ Validator loaded successfully');
                    console.log('🔍 Validator script length:', this.validator.script?.length);

                    // Verify the validator object is not undefined
                    if (!this.validator || this.validator === undefined) {
                        console.error('❌ Validator object is undefined after creation');
                    }
                }
            } else {
                console.warn('⚠️ Contract blueprint not available, will use demo mode');
                this.validator = null;
            }

            this.log('✅ Lucid initialized successfully');
            await this.setupWallets();

        } catch (error) {
            console.error('❌ Lucid initialization failed:', error);
            console.log('📝 Error details:', {
                name: (error as any).name,
                message: (error as any).message,
                stack: (error as any).stack
            });
            this.log(`❌ Failed to initialize Lucid: ${error}`);
            // For demo purposes, we'll continue without real blockchain connection
            this.log('🔄 Continuing in demo mode...');
            await this.setupDemoMode();
        }
    }

    private async setupWallets() {
        console.log('🏦 Starting wallet setup...');
        try {
            // Load CML for address parsing
            const { CML } = await loadLucidModule();

            // Setup sender wallet
            console.log('👤 Setting up sender wallet (Party A)...');
            console.log('🔑 Sender seed phrase length:', SENDER_PASSPHRASE.split(' ').length);
            this.lucid?.selectWallet.fromSeed(SENDER_PASSPHRASE);
            console.log('✅ Sender wallet selected');

            const senderAddress = await this.lucid?.wallet().address();
            console.log('📍 Sender address generated:', senderAddress);
            console.log('📍 Expected sender address:', credentials.PartyA.address);

            this.state.senderKeyHash = CML.Address.from_bech32(senderAddress!).payment_cred()?.as_pub_key()?.to_hex();
            console.log('🔐 Sender key hash:', this.state.senderKeyHash);

            // Setup receiver wallet (Party B - User B)
            console.log('📦 Setting up receiver wallet (Party B - User B)...');
            console.log('🔑 Receiver seed phrase length:', RECEIVER_PASSPHRASE.split(' ').length);
            this.lucid?.selectWallet.fromSeed(RECEIVER_PASSPHRASE);
            console.log('✅ Receiver wallet selected');

            const receiverAddress = await this.lucid?.wallet().address();
            console.log('📍 Receiver address generated:', receiverAddress);
            console.log('📍 Expected receiver address:', credentials.PartyB.address);

            this.state.receiverKeyHash = CML.Address.from_bech32(receiverAddress!).payment_cred()?.as_pub_key()?.to_hex();
            console.log('🔐 Receiver key hash:', this.state.receiverKeyHash);

            // Setup custodian wallet (Party C - Entity C)
            console.log('🏛️ Setting up custodian wallet (Party C - Entity C)...');
            console.log('🔑 Custodian seed phrase length:', CUSTODIAN_PASSPHRASE.split(' ').length);
            this.lucid?.selectWallet.fromSeed(CUSTODIAN_PASSPHRASE);
            console.log('✅ Custodian wallet selected');

            const custodianAddress = await this.lucid?.wallet().address();
            console.log('📍 Custodian address generated:', custodianAddress);
            console.log('📍 Expected custodian address:', credentials.PartyC.address);

            this.state.custodianKeyHash = CML.Address.from_bech32(custodianAddress!).payment_cred()?.as_pub_key()?.to_hex();
            console.log('🔐 Custodian key hash:', this.state.custodianKeyHash);

            // Generate contract address from validator
            if (this.validator) {
                console.log('🏗️ Generating contract address from validator...');
                console.log('🔍 Validator before address generation:', this.validator);
                console.log('🔍 Validator type check:', typeof this.validator, this.validator.type, this.validator.script);

                // Validate validator structure
                if (!this.validator.type) {
                    console.error('❌ Validator missing type property');
                    console.log('🔄 Will generate contract address during transaction...');
                } else if (!this.validator.script) {
                    console.error('❌ Validator missing script property');
                    console.log('🔄 Will generate contract address during transaction...');
                } else {
                    try {
                        console.log('🔍 About to call validatorToAddress with:', this.validator);
                        const { validatorToAddress } = await loadLucidModule();
                        this.state.contractAddress = validatorToAddress("Preview", this.validator);
                        console.log('✅ Contract address generated using direct import:', this.state.contractAddress);
                        console.log('Computed smart contract address:', this.state.contractAddress);
                    } catch (error) {
                        console.error('❌ Failed to generate contract address:', error);
                        console.log('📝 Contract address generation error details:', {
                            name: (error as any).name,
                            message: (error as any).message,
                            stack: (error as any).stack,
                            validator: this.validator,
                        });
                        console.log('🔄 Will generate contract address during transaction...');
                    }
                }
            } else {
                console.log('⚠️ No validator available, contract address will be generated during transaction');
            }

            // Set back to sender as default
            console.log('🔄 Switching back to sender wallet as default...');
            this.lucid?.selectWallet.fromSeed(SENDER_PASSPHRASE);
            this.state.currentParty = 'sender';
            console.log('✅ Default wallet set to sender');

            console.log('📊 Final wallet state:', this.state);
            await this.updateWalletDisplays();
            console.log('✅ Wallet setup completed successfully');

        } catch (error) {
            console.error('❌ Wallet setup failed:', error);
            console.log('📝 Wallet setup error details:', {
                name: (error as any).name,
                message: (error as any).message,
                stack: (error as any).stack
            });
            this.log(`❌ Failed to setup wallets: ${error}`);
            console.log('🔄 Falling back to demo mode...');
            await this.setupDemoMode();
        }
    }

    private async setupDemoMode() {
        console.log('🎭 Setting up demo mode...');
        // Mock wallet setup for demo
        this.state.senderKeyHash = '1234567890abcdef1234567890abcdef12345678';
        this.state.receiverKeyHash = 'abcdef1234567890abcdef1234567890abcdef12';
        this.state.custodianKeyHash = 'fedcba0987654321fedcba0987654321fedcba09';
        this.state.currentParty = 'sender';

        console.log('🎭 Demo state configured:', this.state);
        await this.updateWalletDisplays();
        this.log('📝 Demo mode activated - using mock data');
        console.log('✅ Demo mode setup completed');
    }

    private async updateWalletDisplays() {
        console.log('💰 Updating wallet displays...');
        try {
            const senderElement = document.getElementById('sender-wallet');
            const receiverElement = document.getElementById('receiver-wallet');
            const custodianElement = document.getElementById('custodian-wallet');

            console.log('💰 Found wallet elements:', {
                sender: !!senderElement,
                receiver: !!receiverElement,
                custodian: !!custodianElement
            });

            if (this.lucid) {
                console.log('💰 Getting real wallet balances...');

                try {
                    // Get real wallet balances
                    console.log('💰 Checking sender balance...');
                    this.lucid.selectWallet.fromSeed(SENDER_PASSPHRASE);
                    const senderBalance = await this.lucid.wallet().getUtxos();
                    const senderAda = senderBalance.reduce((sum: bigint, utxo: any) => sum + utxo.assets.lovelace, 0n);
                    console.log('💰 Sender UTxOs:', senderBalance.length, 'Total ADA:', Number(senderAda) / 1000000);

                    console.log('💰 Checking receiver balance...');
                    this.lucid.selectWallet.fromSeed(RECEIVER_PASSPHRASE);
                    const receiverBalance = await this.lucid.wallet().getUtxos();
                    const receiverAda = receiverBalance.reduce((sum: bigint, utxo: any) => sum + utxo.assets.lovelace, 0n);
                    console.log('💰 Receiver UTxOs:', receiverBalance.length, 'Total ADA:', Number(receiverAda) / 1000000);

                    console.log('💰 Checking custodian balance...');
                    this.lucid.selectWallet.fromSeed(CUSTODIAN_PASSPHRASE);
                    const custodianBalance = await this.lucid.wallet().getUtxos();
                    const custodianAda = custodianBalance.reduce((sum: bigint, utxo: any) => sum + utxo.assets.lovelace, 0n);
                    console.log('💰 Custodian UTxOs:', custodianBalance.length, 'Total ADA:', Number(custodianAda) / 1000000);

                    if (senderElement) senderElement.textContent = `Wallet: ${Number(senderAda) / 1000000} ADA`;
                    if (receiverElement) receiverElement.textContent = `Wallet: ${Number(receiverAda) / 1000000} ADA`;
                    if (custodianElement) custodianElement.textContent = `Wallet: ${Number(custodianAda) / 1000000} ADA`;

                    console.log('✅ Real wallet balances updated');
                } catch (balanceError) {
                    console.warn('⚠️ Failed to get real balances, using demo mode:', balanceError);
                    // Fall back to demo mode if balance checking fails
                    if (senderElement) senderElement.textContent = `Wallet: 1000 ADA (Demo)`;
                    if (receiverElement) receiverElement.textContent = `Wallet: 1000 ADA (Demo)`;
                    if (custodianElement) custodianElement.textContent = `Wallet: 1000 ADA (Demo)`;
                }
            } else {
                console.log('🎭 Using demo mode wallet displays...');
                // Demo mode - show mock balances
                if (senderElement) senderElement.textContent = `Wallet: 1000 ADA (Demo)`;
                if (receiverElement) receiverElement.textContent = `Wallet: 1000 ADA (Demo)`;
                if (custodianElement) custodianElement.textContent = `Wallet: 1000 ADA (Demo)`;
                console.log('✅ Demo wallet balances updated');
            }
        } catch (error) {
            console.error('❌ Failed to update wallet displays:', error);
            console.log('📝 Wallet display error details:', {
                name: (error as any).name,
                message: (error as any).message,
                stack: (error as any).stack
            });
            this.log(`❌ Failed to update wallet displays: ${error}`);

            // Emergency fallback - always show something
            const senderElement = document.getElementById('sender-wallet');
            const receiverElement = document.getElementById('receiver-wallet');
            const custodianElement = document.getElementById('custodian-wallet');

            if (senderElement) senderElement.textContent = `Wallet: Error - Demo Mode`;
            if (receiverElement) receiverElement.textContent = `Wallet: Error - Demo Mode`;
            if (custodianElement) custodianElement.textContent = `Wallet: Error - Demo Mode`;
        }
    }

    async depositFunds() {
        console.log('💰 Starting deposit transaction...');
        try {
            const amountInput = document.getElementById('deposit-amount') as HTMLInputElement;
            const amount = parseFloat(amountInput.value) * 1000000; // Convert to lovelace

            console.log('💰 Deposit details:', {
                inputValue: amountInput.value,
                amountInLovelace: amount,
                lucidAvailable: !!this.lucid,
                validatorAvailable: !!this.validator
            });

            this.log(`💰 Depositing ${amountInput.value} ADA to contract...`);

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for deposit...');
                this.log('📝 Demo mode: Simulating deposit transaction');
                this.state.amount = BigInt(amount);
                this.state.contractAddress = 'addr_tes...';
                this.simulateDeposit(amount);
                return;
            }

            console.log('🔗 Using real blockchain for deposit...');
            // Switch to sender wallet
            this.lucid.selectWallet.fromSeed(SENDER_PASSPHRASE);
            console.log('👤 Switched to sender wallet');
            this.showSigningStatus('sender', 'deposit');

            // Generate contract address from validator if not already generated
            if (!this.state.contractAddress) {
                console.log('🏗️ Generating contract address from validator...');
                console.log('🔍 Validator check:', this.validator);

                if (!this.validator) {
                    throw new Error('No validator available for contract address generation');
                }

                try {
                    console.log('🔄 Trying direct import of validatorToAddress...');
                    const { validatorToAddress } = await loadLucidModule();
                    this.state.contractAddress = validatorToAddress("Preview", this.validator);
                    console.log('✅ Contract address generated using direct import:', this.state.contractAddress);
                    console.log('Computed smart contract address:', this.state.contractAddress);
                } catch (error) {
                    console.error('❌ Failed to generate contract address:', error);
                    throw new Error(`Failed to generate contract address: ${error}`);
                }
            } else {
                console.log('📍 Using existing contract address:', this.state.contractAddress);
            }
            const { Data, Constr } = await loadLucidModule();
            // Create datum using Data.to() and Constr (constructor index 0 with 3 fields)
            const datum = Data.to(new Constr(0, [
                this.state.senderKeyHash!,
                this.state.receiverKeyHash!,
                this.state.custodianKeyHash!
            ]));
            console.log('📄 Datum created:', datum);

            console.log('🔨 Building transaction...');
            // Build transaction
            const tx = await this.lucid
                .newTx()
                .pay.ToContract(this.state.contractAddress, { kind: 'inline', value: datum }, { lovelace: BigInt(amount) })
                .complete();
            console.log('✅ Transaction built successfully');

            console.log('✍️ Signing transaction...');
            const signedTx = await tx.sign.withWallet().complete();
            console.log('✅ Transaction signed');

            console.log('📤 Submitting transaction...');
            const txHash = await signedTx.submit();
            console.log('✅ Transaction submitted with hash:', txHash);

            this.log(`✅ Deposit transaction submitted: ${txHash}`);
            this.state.amount = BigInt(amount);
            this.state.depositTxHash = txHash;

            // Update UI
            this.updateDepositUI();

        } catch (error) {
            console.error('❌ Deposit transaction failed:', error);
            console.log('📝 Deposit error details:', {
                name: (error as any).name,
                message: (error as any).message,
                stack: (error as any).stack
            });
            this.log(`❌ Deposit failed: ${error}`);
        }
    }

    private simulateDeposit(amount: number) {
        console.log('🎭 Simulating deposit:', amount / 1000000, 'ADA');
        this.state.amount = BigInt(amount);
        this.state.depositTxHash = 'demo-tx-hash-' + Date.now(); // Mock tx hash for demo
        this.updateDepositUI();
        this.log(`✅ Simulated deposit of ${amount / 1000000} ADA`);
    }

    private updateDepositUI() {
        console.log('🔄 Updating deposit UI...');
        const depositBtn = document.getElementById('deposit-btn') as HTMLButtonElement;
        const withdrawBtn = document.getElementById('withdraw-btn') as HTMLButtonElement;
        const deliverBtn = document.getElementById('deliver-btn') as HTMLButtonElement;
        const refuseBtn = document.getElementById('refuse-btn') as HTMLButtonElement;
        const senderStatus = document.getElementById('sender-status');
        const custodianStatus = document.getElementById('custodian-status');
        const receiverStatus = document.getElementById('receiver-status');

        if (depositBtn) depositBtn.disabled = true;
        if (withdrawBtn) withdrawBtn.disabled = false;
        if (deliverBtn) deliverBtn.disabled = false;
        if (refuseBtn) refuseBtn.disabled = false;

        if (senderStatus) senderStatus.textContent = `Contract created with ${Number(this.state.amount) / 1000000} ADA`;
        if (receiverStatus) receiverStatus.textContent = 'Contract available - can refuse delivery';
        if (custodianStatus) custodianStatus.textContent = 'Contract available - can facilitate delivery';

        console.log('✅ Deposit UI updated');
    }

    async withdrawFunds() {
        console.log('⬆️ Starting withdrawal transaction...');
        try {
            this.log('⬆️ Withdrawing funds (sender action)...');

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for withdrawal...');
                this.log('📝 Demo mode: Simulating withdrawal transaction');
                this.simulateWithdraw();
                return;
            }

            console.log('🔗 Using real blockchain for withdrawal...');
            // Switch to sender wallet
            this.lucid.selectWallet.fromSeed(SENDER_PASSPHRASE);
            console.log('👤 Switched to sender wallet for withdrawal');
            this.showSigningStatus('sender', 'withdrawal');

            // Ensure we have a contract address
            if (!this.state.contractAddress) {
                console.log('🏗️ Generating contract address from validator...');
                console.log('🔍 Validator check:', this.validator);

                if (!this.validator) {
                    throw new Error('No validator available for contract address generation');
                }

                try {
                    console.log('🔄 Trying direct import of validatorToAddress...');
                    const { validatorToAddress } = await loadLucidModule();
                    this.state.contractAddress = validatorToAddress("Preview", this.validator);
                    console.log('✅ Contract address generated using direct import:', this.state.contractAddress);
                    console.log('Computed smart contract address:', this.state.contractAddress);
                } catch (error) {
                    console.error('❌ Failed to generate contract address:', error);
                    throw new Error(`Failed to generate contract address: ${error}`);
                }
            }

            // Find contract UTxO using the deposit transaction hash
            console.log('🔍 Looking for UTxO from deposit transaction:', this.state.depositTxHash);
            const utxos = await this.lucid.utxosAt(this.state.contractAddress!);
            console.log('🔍 Contract UTxOs found:', utxos.length);
            
            // Find the specific UTxO created by our deposit transaction
            const contractUtxo = utxos.find(utxo => 
                utxo.txHash === this.state.depositTxHash
            );
            
            if (!contractUtxo) {
                console.log('❌ Available UTxOs:', utxos.map(u => ({ txHash: u.txHash, outputIndex: u.outputIndex })));
                throw new Error(`Contract UTxO not found for transaction ${this.state.depositTxHash}`);
            }
            
            console.log('✅ Found correct UTxO:', { txHash: contractUtxo.txHash, outputIndex: contractUtxo.outputIndex });

            // Create redeemer for withdrawal (constructor index 0, no fields)
            const { Data, Constr } = await loadLucidModule();
            const redeemer = Data.to(new Constr(0, []));
            console.log('📄 Redeemer created:', redeemer);

            console.log('🔨 Building withdrawal transaction...');

            // Use the actual UTxO value, not the stored amount
            const contractValue = contractUtxo.assets.lovelace;
            console.log('💰 Contract UTxO value:', contractValue);
            console.log('💰 Original deposit amount:', this.state.amount);

            // Get sender address for receiving funds
            const senderAddress = await this.lucid.wallet().address();
            console.log('👤 Sender address for withdrawal:', senderAddress);

            // M-01 FIX: Compute output tag from input's OutputReference
            const outputTag = computeOutputTag(contractUtxo.txHash, contractUtxo.outputIndex);
            console.log('🏷️ Output tag computed:', outputTag);

            // Build transaction - funds go back to sender WITH output tag (M-01 fix)
            const tx = await this.lucid
                .newTx()
                .collectFrom([contractUtxo], redeemer)
                .pay.ToAddressWithData(senderAddress, { kind: 'inline', value: outputTag }, { lovelace: contractValue })
                .attach.SpendingValidator(this.validator)
                .addSignerKey(this.state.senderKeyHash!)
                .complete();

            const signedTx = await tx.sign.withWallet().complete();
            const txHash = await signedTx.submit();
            console.log('✅ Withdrawal transaction submitted:', txHash);

            this.log(`✅ Withdrawal transaction submitted: ${txHash}`);
            this.updateWithdrawUI();

        } catch (error) {
            console.error('❌ Withdrawal failed:', error);
            this.log(`❌ Withdrawal failed: ${error}`);
        }
    }

    private simulateWithdraw() {
        console.log('🎭 Simulating withdrawal...');
        this.updateWithdrawUI();
        this.log(`✅ Simulated withdrawal of ${Number(this.state.amount) / 1000000} ADA back to sender`);
    }

    private updateWithdrawUI() {
        console.log('🔄 Updating withdrawal UI...');
        const withdrawBtn = document.getElementById('withdraw-btn') as HTMLButtonElement;
        const deliverBtn = document.getElementById('deliver-btn') as HTMLButtonElement;
        const refuseBtn = document.getElementById('refuse-btn') as HTMLButtonElement;
        const senderStatus = document.getElementById('sender-status');
        const custodianStatus = document.getElementById('custodian-status');
        const receiverStatus = document.getElementById('receiver-status');

        if (withdrawBtn) withdrawBtn.disabled = true;
        if (deliverBtn) deliverBtn.disabled = true;
        if (refuseBtn) refuseBtn.disabled = true;

        if (senderStatus) senderStatus.textContent = 'Funds withdrawn - contract completed';
        if (receiverStatus) receiverStatus.textContent = 'Contract completed - sender withdrew';
        if (custodianStatus) custodianStatus.textContent = 'Contract completed - sender withdrew';

        console.log('✅ Withdrawal UI updated');
    }

    async deliverToReceiver() {
        console.log('🚚 Starting delivery transaction...');
        try {
            this.log('🚚 Entity C (Custodian) confirming delivery to User B...');

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for delivery...');
                this.log('📝 Demo mode: Simulating delivery transaction');
                this.simulateDeliver();
                return;
            }

            console.log('🔗 Using real blockchain for delivery...');
            // Switch to custodian wallet (Entity C confirms delivery)
            this.lucid.selectWallet.fromSeed(CUSTODIAN_PASSPHRASE);
            console.log('🏛️ Switched to custodian wallet for delivery confirmation');

            // Ensure we have a contract address
            if (!this.state.contractAddress) {
                console.log('🏗️ Generating contract address from validator...');
                console.log('🔍 Validator check:', this.validator);

                if (!this.validator) {
                    throw new Error('No validator available for contract address generation');
                }

                try {
                    console.log('🔄 Trying direct import of validatorToAddress...');
                    const { validatorToAddress } = await loadLucidModule();
                    this.state.contractAddress = validatorToAddress("Preview", this.validator);
                    console.log('✅ Contract address generated using direct import:', this.state.contractAddress);
                    console.log('Computed smart contract address:', this.state.contractAddress);
                } catch (error) {
                    console.error('❌ Failed to generate contract address:', error);
                    throw new Error(`Failed to generate contract address: ${error}`);
                }
            }

            // Find contract UTxO using the deposit transaction hash
            console.log('🔍 Looking for UTxO from deposit transaction:', this.state.depositTxHash);
            const utxos = await this.lucid.utxosAt(this.state.contractAddress!);
            console.log('🔍 Contract UTxOs found:', utxos.length);
            
            // Find the specific UTxO created by our deposit transaction
            const contractUtxo = utxos.find(utxo => 
                utxo.txHash === this.state.depositTxHash
            );
            
            if (!contractUtxo) {
                console.log('❌ Available UTxOs:', utxos.map(u => ({ txHash: u.txHash, outputIndex: u.outputIndex })));
                throw new Error(`Contract UTxO not found for transaction ${this.state.depositTxHash}`);
            }
            
            console.log('✅ Found correct UTxO:', { txHash: contractUtxo.txHash, outputIndex: contractUtxo.outputIndex });

            // Create redeemer for delivery (constructor index 1, no fields)
            const { Data, Constr } = await loadLucidModule();
            const redeemer = Data.to(new Constr(1, []));

            // Debug: Print key hashes to identify which one is missing
            console.log('🔍 Key hash debugging:');
            console.log('  Sender key hash:', this.state.senderKeyHash);
            console.log('  Receiver key hash:', this.state.receiverKeyHash);
            console.log('  Custodian key hash:', this.state.custodianKeyHash);

            // Build transaction - funds go to receiver, but both receiver and custodian must sign
            console.log('🔨 Building transaction...');
            
            // Use the actual UTxO value, not the stored amount
            const contractValue = contractUtxo.assets.lovelace;
            console.log('💰 Contract UTxO value:', contractValue);
            console.log('💰 Original deposit amount:', this.state.amount);

            // M-01 FIX: Compute output tag from input's OutputReference
            const outputTag = computeOutputTag(contractUtxo.txHash, contractUtxo.outputIndex);
            console.log('🏷️ Output tag computed:', outputTag);

            // Custodian wallet already selected above for transaction building
            // Only custodian signs to confirm delivery (Entity C confirms delivery to User B)
            // Output includes tag to prevent double satisfaction (M-01 fix)
            const tx = await this.lucid
                .newTx()
                .collectFrom([contractUtxo], redeemer)
                .pay.ToAddressWithData(RECEIVER_ADDRESS, { kind: 'inline', value: outputTag }, { lovelace: contractValue })
                .attach.SpendingValidator(this.validator)
                .addSignerKey(this.state.custodianKeyHash!)
                .complete();
            
            console.log('✍️ Signing transaction...');
            
            // Only custodian needs to sign to confirm delivery
            this.showSigningStatus('custodian', 'delivery');
            console.log('✍️ Custodian signing delivery confirmation...');
            const finalTx = await tx.sign.withWallet().complete();
            
            console.log('✅ Transaction signed by custodian');
            console.log('📤 Submitting transaction...');
            const txHash = await finalTx.submit();
            console.log('✅ Delivery transaction submitted:', txHash);

            this.log(`✅ Delivery transaction submitted: ${txHash}`);
            this.updateDeliverUI();

        } catch (error) {
            console.error('❌ Delivery failed:', error);
            this.log(`❌ Delivery failed: ${error}`);
        }
    }

    private simulateDeliver() {
        console.log('🎭 Simulating delivery...');
        this.updateDeliverUI();
        this.log(`✅ Simulated delivery of ${Number(this.state.amount) / 1000000} ADA to receiver (authorized by custodian)`);
    }

    private updateDeliverUI() {
        console.log('🔄 Updating delivery UI...');
        const withdrawBtn = document.getElementById('withdraw-btn') as HTMLButtonElement;
        const deliverBtn = document.getElementById('deliver-btn') as HTMLButtonElement;
        const refuseBtn = document.getElementById('refuse-btn') as HTMLButtonElement;
        const receiverStatus = document.getElementById('receiver-status');
        const custodianStatus = document.getElementById('custodian-status');

        if (withdrawBtn) withdrawBtn.disabled = true;
        if (deliverBtn) deliverBtn.disabled = true;
        if (refuseBtn) refuseBtn.disabled = true;

        if (receiverStatus) receiverStatus.textContent = `Delivery accepted - received ${Number(this.state.amount) / 1000000} ADA`;
        if (custodianStatus) custodianStatus.textContent = `Successfully facilitated delivery`;

        console.log('✅ Delivery UI updated');
    }

    async refuseDelivery() {
        console.log('❌ Starting refuse delivery transaction...');
        try {
            this.log('❌ User B refusing delivery and returning to sender...');

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for return...');
                this.log('📝 Demo mode: Simulating return transaction');
                this.simulateReturn();
                return;
            }

            console.log('🔗 Using real blockchain for return...');
            // Switch to receiver wallet (User B refuses delivery)
            this.lucid.selectWallet.fromSeed(RECEIVER_PASSPHRASE);
            console.log('📦 Switched to receiver wallet for refusal');
            this.showSigningStatus('receiver', 'refusal');

            // Ensure we have a contract address
            if (!this.state.contractAddress) {
                console.log('🏗️ Generating contract address from validator...');
                console.log('🔍 Validator check:', this.validator);

                if (!this.validator) {
                    throw new Error('No validator available for contract address generation');
                }

                try {
                    console.log('🔄 Trying direct import of validatorToAddress...');
                    const { validatorToAddress } = await loadLucidModule();
                    this.state.contractAddress = validatorToAddress("Preview", this.validator);
                    console.log('✅ Contract address generated using direct import:', this.state.contractAddress);
                    console.log('Computed smart contract address:', this.state.contractAddress);
                } catch (error) {
                    console.error('❌ Failed to generate contract address:', error);
                    throw new Error(`Failed to generate contract address: ${error}`);
                }
            }

            // Find contract UTxO using the deposit transaction hash
            console.log('🔍 Looking for UTxO from deposit transaction:', this.state.depositTxHash);
            const utxos = await this.lucid.utxosAt(this.state.contractAddress!);
            console.log('🔍 Contract UTxOs found:', utxos.length);
            
            // Find the specific UTxO created by our deposit transaction
            const contractUtxo = utxos.find(utxo => 
                utxo.txHash === this.state.depositTxHash
            );
            
            if (!contractUtxo) {
                console.log('❌ Available UTxOs:', utxos.map(u => ({ txHash: u.txHash, outputIndex: u.outputIndex })));
                throw new Error(`Contract UTxO not found for transaction ${this.state.depositTxHash}`);
            }
            
            console.log('✅ Found correct UTxO:', { txHash: contractUtxo.txHash, outputIndex: contractUtxo.outputIndex });

            // Create redeemer for return (constructor index 2, no fields)
            const { Data, Constr } = await loadLucidModule();
            const redeemer = Data.to(new Constr(2, []));

            // Get sender address for receiving funds
            this.lucid.selectWallet.fromSeed(SENDER_PASSPHRASE);
            const senderAddress = await this.lucid.wallet().address();
            console.log('👤 Sender address for return:', senderAddress);
            
            // Switch back to receiver wallet for signing
            this.lucid.selectWallet.fromSeed(RECEIVER_PASSPHRASE);

            // Use the actual UTxO value, not the stored amount
            const contractValue = contractUtxo.assets.lovelace;
            console.log('💰 Contract UTxO value:', contractValue);
            console.log('💰 Original deposit amount:', this.state.amount);
            
            // M-01 FIX: Compute output tag from input's OutputReference
            const outputTag = computeOutputTag(contractUtxo.txHash, contractUtxo.outputIndex);
            console.log('🏷️ Output tag computed:', outputTag);

            // Receiver wallet already selected above, receiver refuses delivery
            console.log('📦 User B (receiver) will refuse delivery and return funds');

            // Build transaction - funds go to sender, receiver must sign (User B refuses)
            // Output includes tag to prevent double satisfaction (M-01 fix)
            const tx = await this.lucid
                .newTx()
                .collectFrom([contractUtxo], redeemer)
                .pay.ToAddressWithData(senderAddress, { kind: 'inline', value: outputTag }, { lovelace: contractValue })
                .attach.SpendingValidator(this.validator)
                .addSignerKey(this.state.receiverKeyHash!)
                .complete();

            const signedTx = await tx.sign.withWallet().complete();
            const txHash = await signedTx.submit();
            console.log('✅ Return transaction submitted:', txHash);

            this.log(`✅ Return transaction submitted: ${txHash}`);
            this.updateReturnUI();

        } catch (error) {
            console.error('❌ Return failed:', error);
            this.log(`❌ Return failed: ${error}`);
        }
    }

    private simulateReturn() {
        console.log('🎭 Simulating return...');
        this.updateReturnUI();
        this.log(`✅ Simulated return of ${Number(this.state.amount) / 1000000} ADA to sender`);
    }

    private updateReturnUI() {
        console.log('🔄 Updating return UI...');
        const withdrawBtn = document.getElementById('withdraw-btn') as HTMLButtonElement;
        const deliverBtn = document.getElementById('deliver-btn') as HTMLButtonElement;
        const refuseBtn = document.getElementById('refuse-btn') as HTMLButtonElement;
        const senderStatus = document.getElementById('sender-status');
        const custodianStatus = document.getElementById('custodian-status');
        const receiverStatus = document.getElementById('receiver-status');

        if (withdrawBtn) withdrawBtn.disabled = true;
        if (deliverBtn) deliverBtn.disabled = true;
        if (refuseBtn) refuseBtn.disabled = true;

        if (senderStatus) senderStatus.textContent = `Funds returned - received ${Number(this.state.amount) / 1000000} ADA`;
        if (receiverStatus) receiverStatus.textContent = 'Successfully refused delivery - funds returned';
        if (custodianStatus) custodianStatus.textContent = 'Contract completed - delivery refused';

        console.log('✅ Return UI updated');
    }

    private log(message: string) {
        const logElement = document.getElementById('transaction-log');
        if (logElement) {
            const timestamp = new Date().toLocaleTimeString();
            logElement.innerHTML += `<div>[${timestamp}] ${message}</div>`;
            logElement.scrollTop = logElement.scrollHeight;
        }
        console.log(`[LOG] ${message}`);
    }

    // UI feedback for transaction signing
    private showSigningStatus(party: 'sender' | 'custodian' | 'receiver', action: string) {
        const partyLabels = {
            sender: 'User A (Sender)',
            custodian: 'Entity C (Custodian)', 
            receiver: 'User B (Receiver)'
        };
        
        const message = `✍️ ${partyLabels[party]} is signing ${action} transaction...`;
        this.log(message);
        
        // Update the party's status in the UI
        const statusElements = {
            sender: document.getElementById('sender-status'),
            custodian: document.getElementById('custodian-status'),
            receiver: document.getElementById('receiver-status')
        };
        
        const statusElement = statusElements[party];
        if (statusElement) {
            const originalText = statusElement.textContent;
            statusElement.textContent = `🔐 Signing transaction...`;
            statusElement.style.backgroundColor = '#fff3cd';
            statusElement.style.color = '#856404';
            
            // Reset after 3 seconds
            setTimeout(() => {
                if (statusElement.textContent === '🔐 Signing transaction...') {
                    statusElement.textContent = originalText || '';
                    statusElement.style.backgroundColor = '';
                    statusElement.style.color = '';
                }
            }, 3000);
        }
    }

    clearLog() {
        console.log('🧹 Clearing transaction log...');
        const logElement = document.getElementById('transaction-log');
        if (logElement) {
            logElement.innerHTML = '';
        }
    }

    async refreshBalances() {
        console.log('🔄 Refreshing all wallet balances...');
        this.log('🔄 Refreshing wallet balances...');
        
        // Show loading state
        const senderElement = document.getElementById('sender-wallet');
        const custodianElement = document.getElementById('custodian-wallet');
        const receiverElement = document.getElementById('receiver-wallet');
        
        if (senderElement) senderElement.textContent = 'Wallet: Loading...';
        if (custodianElement) custodianElement.textContent = 'Wallet: Loading...';
        if (receiverElement) receiverElement.textContent = 'Wallet: Loading...';
        
        // Call the existing balance update method
        await this.setupWallets();
        this.log('✅ Wallet balances refreshed');
    }
}
