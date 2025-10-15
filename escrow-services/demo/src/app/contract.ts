import type { LucidEvolution } from '@lucid-evolution/lucid';
import { loadLucidModule } from './lucid';
import { credentials, DEPOSITOR_PASSPHRASE, BENEFICIARY_PASSPHRASE, AUTHORIZED_PASSPHRASE, BENEFICIARY_ADDRESS } from './credentials';
import { ContractState } from './state';
import { ENV } from './env';

export class EscrowServicesDemo {
    private lucid: LucidEvolution | null = null;
    private validator: any = null;
    private state: ContractState = {};
    private contractBlueprint: any = null;

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
        console.log('🚀 Starting EscrowServicesDemo initialization...');
        console.log('📋 Credentials loaded:', {
            'Depositor (Party A)': credentials.PartyA.address,
            'Beneficiary (Party B)': credentials.PartyB.address,
            'Authorized Key (Party C)': credentials.PartyC.address
        });

        try {
            this.log('Initializing Lucid with Blockfrost...');
            console.log('🔗 Attempting to connect to Blockfrost...');

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
            throw new Error(`Failed to initialize Lucid: ${error}`);
        }
    }

    private async setupWallets() {
        console.log('🏦 Starting wallet setup...');
        try {
            // Load CML for address parsing
            const { CML } = await loadLucidModule();

            // Setup depositor wallet
            console.log('👤 Setting up depositor wallet (Party A)...');
            console.log('🔑 Depositor seed phrase length:', DEPOSITOR_PASSPHRASE.split(' ').length);
            this.lucid!.selectWallet.fromSeed(DEPOSITOR_PASSPHRASE);
            console.log('✅ Depositor wallet selected');

            const depositorAddress = await this.lucid!.wallet().address();
            console.log('📍 Depositor address generated:', depositorAddress);
            console.log('📍 Expected depositor address:', credentials.PartyA.address);

            this.state.depositorKeyHash = CML.Address.from_bech32(depositorAddress!).payment_cred()?.as_pub_key()?.to_hex();
            console.log('🔐 Depositor key hash:', this.state.depositorKeyHash);

            // Setup beneficiary wallet
            console.log('📦 Setting up beneficiary wallet (Party B)...');
            console.log('🔑 Beneficiary seed phrase length:', BENEFICIARY_PASSPHRASE.split(' ').length);
            this.lucid!.selectWallet.fromSeed(BENEFICIARY_PASSPHRASE);
            console.log('✅ Beneficiary wallet selected');

            const beneficiaryAddress = await this.lucid!.wallet().address();
            console.log('📍 Beneficiary address generated:', beneficiaryAddress);
            console.log('📍 Expected beneficiary address:', credentials.PartyB.address);

            this.state.beneficiaryKeyHash = CML.Address.from_bech32(beneficiaryAddress!).payment_cred()?.as_pub_key()?.to_hex();
            console.log('🔐 Beneficiary key hash:', this.state.beneficiaryKeyHash);

            // Setup authorized key wallet
            console.log('🔑 Setting up authorized key wallet (Party C)...');
            console.log('🔑 Authorized key seed phrase length:', AUTHORIZED_PASSPHRASE.split(' ').length);
            this.lucid!.selectWallet.fromSeed(AUTHORIZED_PASSPHRASE);
            console.log('✅ Authorized key wallet selected');

            const authorizedAddress = await this.lucid!.wallet().address();
            console.log('📍 Authorized address generated:', authorizedAddress);
            console.log('📍 Expected authorized address:', credentials.PartyC.address);

            this.state.authorizedKeyHash = CML.Address.from_bech32(authorizedAddress!).payment_cred()?.as_pub_key()?.to_hex();
            console.log('🔐 Authorized key hash:', this.state.authorizedKeyHash);

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

            // Set back to depositor as default
            console.log('🔄 Switching back to depositor wallet as default...');
            this.lucid!.selectWallet.fromSeed(DEPOSITOR_PASSPHRASE);
            this.state.currentParty = 'depositor';
            console.log('✅ Default wallet set to depositor');

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
            throw new Error(`Failed to setup wallets: ${error}`);
        }
    }


    private async updateWalletDisplays() {
        console.log('💰 Updating wallet displays...');
        try {
            const depositorElement = document.getElementById('depositor-wallet');
            const beneficiaryElement = document.getElementById('beneficiary-wallet');
            const authorizedElement = document.getElementById('authorized-wallet');

            console.log('💰 Found wallet elements:', {
                depositor: !!depositorElement,
                beneficiary: !!beneficiaryElement,
                authorized: !!authorizedElement
            });

            console.log('💰 Getting real wallet balances...');

            // Get real wallet balances
            console.log('💰 Checking depositor balance...');
            this.lucid!.selectWallet.fromSeed(DEPOSITOR_PASSPHRASE);
            const depositorBalance = await this.lucid!.wallet().getUtxos();
            const depositorAda = depositorBalance.reduce((sum: bigint, utxo: any) => sum + utxo.assets.lovelace, 0n);
            console.log('💰 Depositor UTxOs:', depositorBalance.length, 'Total ADA:', Number(depositorAda) / 1000000);

            console.log('💰 Checking beneficiary balance...');
            this.lucid!.selectWallet.fromSeed(BENEFICIARY_PASSPHRASE);
            const beneficiaryBalance = await this.lucid!.wallet().getUtxos();
            const beneficiaryAda = beneficiaryBalance.reduce((sum: bigint, utxo: any) => sum + utxo.assets.lovelace, 0n);
            console.log('💰 Beneficiary UTxOs:', beneficiaryBalance.length, 'Total ADA:', Number(beneficiaryAda) / 1000000);

            console.log('💰 Checking authorized key balance...');
            this.lucid!.selectWallet.fromSeed(AUTHORIZED_PASSPHRASE);
            const authorizedBalance = await this.lucid!.wallet().getUtxos();
            const authorizedAda = authorizedBalance.reduce((sum: bigint, utxo: any) => sum + utxo.assets.lovelace, 0n);
            console.log('💰 Authorized key UTxOs:', authorizedBalance.length, 'Total ADA:', Number(authorizedAda) / 1000000);

            if (depositorElement) depositorElement.textContent = `Wallet: ${Number(depositorAda) / 1000000} ADA`;
            if (beneficiaryElement) beneficiaryElement.textContent = `Wallet: ${Number(beneficiaryAda) / 1000000} ADA`;
            if (authorizedElement) authorizedElement.textContent = `Wallet: ${Number(authorizedAda) / 1000000} ADA`;

            console.log('✅ Real wallet balances updated');
        } catch (error) {
            console.error('❌ Failed to update wallet displays:', error);
            console.log('📝 Wallet display error details:', {
                name: (error as any).name,
                message: (error as any).message,
                stack: (error as any).stack
            });
            this.log(`❌ Failed to update wallet displays: ${error}`);
            throw new Error(`Failed to update wallet displays: ${error}`);
        }
    }

    // Time-Lock Escrow Functions
    async createTimeLockEscrow() {
        console.log('⏰ Starting time-lock escrow creation...');
        try {
            const amountInput = document.getElementById('timelock-amount') as HTMLInputElement;
            const durationSelect = document.getElementById('timelock-duration') as HTMLSelectElement;
            const amount = parseFloat(amountInput.value) * 1000000; // Convert to lovelace
            const duration = parseInt(durationSelect.value);

            console.log('⏰ Time-lock escrow details:', {
                inputValue: amountInput.value,
                amountInLovelace: amount,
                duration: duration,
                lucidAvailable: !!this.lucid,
                validatorAvailable: !!this.validator
            });

            this.log(`⏰ Creating time-lock escrow: ${amountInput.value} ADA for ${duration / 3600} hours...`);

            // Switch to depositor wallet
            this.lucid!.selectWallet.fromSeed(DEPOSITOR_PASSPHRASE);
            console.log('👤 Switched to depositor wallet');

            // Generate contract address if needed
            if (!this.state.contractAddress) {
                const { validatorToAddress } = await loadLucidModule();
                this.state.contractAddress = validatorToAddress("Preview", this.validator!);
                console.log('✅ Contract address generated:', this.state.contractAddress);
            }

            // Create deadline (current time + duration)
            const deadline = Math.floor(Date.now() / 1000) + duration;
            this.state.deadline = deadline;

            const { Data, Constr } = await loadLucidModule();
            // Create datum for time-lock escrow
            const datum = Data.to(new Constr(0, [
                this.state.depositorKeyHash!,
                this.state.beneficiaryKeyHash!,
                new Constr(1, [BigInt(deadline)]), // Some(deadline)
                BigInt(1), // required_signatures
                [this.state.beneficiaryKeyHash!], // authorized_keys (beneficiary can unlock)
                new Constr(0, [BigInt(0), new Constr(0, [])]) // fee_config (no fees)
            ]));
            console.log('📄 Time-lock datum created:', datum);

            console.log('🔨 Building time-lock transaction...');
            const tx = await this.lucid!
                .newTx()
                .pay.ToContract(this.state.contractAddress!, { kind: 'inline', value: datum }, { lovelace: BigInt(amount) })
                .complete();

            console.log('✍️ Signing transaction...');
            const signedTx = await tx.sign.withWallet().complete();

            console.log('📤 Submitting transaction...');
            const txHash = await signedTx.submit();
            console.log('✅ Time-lock escrow transaction submitted:', txHash);

            this.log(`✅ Time-lock escrow created: ${txHash}`);
            this.state.amount = BigInt(amount);
            this.state.depositTxHash = txHash;
            this.updateTimeLockUI();

        } catch (error) {
            console.error('❌ Time-lock escrow creation failed:', error);
            this.log(`❌ Time-lock escrow failed: ${error}`);
        }
    }


    private updateTimeLockUI() {
        const statusElement = document.getElementById('timelock-status');
        if (statusElement) {
            const unlockTime = new Date(this.state.deadline! * 1000);
            statusElement.textContent = `✅ Time-lock escrow created! ${Number(this.state.amount) / 1000000} ADA locked until ${unlockTime.toLocaleString()}`;
            statusElement.className = 'status success';
            statusElement.style.display = 'block';
        }
    }

    async releaseTimeLockEscrow() {
        console.log('🔓 Starting time-lock release...');
        try {
            this.log('🔓 Releasing time-lock escrow (time-based unlock)...');

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for time-lock release...');
                this.log('📝 Demo mode: Simulating time-lock release transaction');
                this.updateTimeLockReleaseUI();
                return;
            }

            // Switch to beneficiary wallet
            this.lucid.selectWallet.fromSeed(BENEFICIARY_PASSPHRASE);
            console.log('👤 Switched to beneficiary wallet for release');

            // Find contract UTxO
            const utxos = await this.lucid.utxosAt(this.state.contractAddress!);
            const contractUtxo = utxos.find(utxo => utxo.txHash === this.state.depositTxHash);
            
            if (!contractUtxo) {
                throw new Error(`Contract UTxO not found for transaction ${this.state.depositTxHash}`);
            }

            // Create redeemer for release
            const { Data, Constr } = await loadLucidModule();
            const redeemer = Data.to(new Constr(0, [])); // Release

            // Build transaction
            const tx = await this.lucid
                .newTx()
                .collectFrom([contractUtxo], redeemer)
                .pay.ToAddress(BENEFICIARY_ADDRESS, { lovelace: contractUtxo.assets.lovelace })
                .attach.SpendingValidator(this.validator)
                .addSignerKey(this.state.beneficiaryKeyHash!)
                .complete();

            const signedTx = await tx.sign.withWallet().complete();
            const txHash = await signedTx.submit();

            this.log(`✅ Time-lock release transaction submitted: ${txHash}`);
            this.updateTimeLockReleaseUI();

        } catch (error) {
            console.error('❌ Time-lock release failed:', error);
            this.log(`❌ Time-lock release failed: ${error}`);
        }
    }


    private updateTimeLockReleaseUI() {
        const statusElement = document.getElementById('timelock-status');
        if (statusElement) {
            statusElement.textContent = `✅ Time-lock released! ${Number(this.state.amount) / 1000000} ADA transferred to beneficiary`;
            statusElement.className = 'status success';
            statusElement.style.display = 'block';
        }
    }

    // Multi-Signature Escrow Functions
    async createMultiSigEscrow() {
        console.log('🔑 Starting multi-sig escrow creation...');
        try {
            const amountInput = document.getElementById('multisig-amount') as HTMLInputElement;
            const requiredSelect = document.getElementById('multisig-required') as HTMLSelectElement;
            const amount = parseFloat(amountInput.value) * 1000000;
            const requiredSigs = parseInt(requiredSelect.value);

            this.log(`🔑 Creating multi-sig escrow: ${amountInput.value} ADA with ${requiredSigs} required signatures...`);

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for multi-sig escrow...');
                this.log('📝 Demo mode: Simulating multi-sig escrow transaction');
                this.state.amount = BigInt(amount);
                this.state.requiredSignatures = requiredSigs;
                this.state.contractAddress = 'addr_tes...';
                this.state.depositTxHash = 'demo-tx-hash-' + Date.now();
                this.updateMultiSigUI();
                return;
            }

            // Switch to depositor wallet
            this.lucid.selectWallet.fromSeed(DEPOSITOR_PASSPHRASE);

            // Generate contract address if needed
            if (!this.state.contractAddress) {
                const { validatorToAddress } = await loadLucidModule();
                this.state.contractAddress = validatorToAddress("Preview", this.validator);
            }

            const { Data, Constr } = await loadLucidModule();
            // Create datum for multi-sig escrow
            const datum = Data.to(new Constr(0, [
                this.state.depositorKeyHash!,
                this.state.beneficiaryKeyHash!,
                new Constr(0, []), // None (no deadline)
                BigInt(requiredSigs), // required_signatures
                [this.state.depositorKeyHash!, this.state.beneficiaryKeyHash!, this.state.authorizedKeyHash!], // authorized_keys
                new Constr(0, [BigInt(0), new Constr(0, [])]) // fee_config (no fees)
            ]));

            const tx = await this.lucid
                .newTx()
                .pay.ToContract(this.state.contractAddress, { kind: 'inline', value: datum }, { lovelace: BigInt(amount) })
                .complete();

            const signedTx = await tx.sign.withWallet().complete();
            const txHash = await signedTx.submit();

            this.log(`✅ Multi-sig escrow created: ${txHash}`);
            this.state.amount = BigInt(amount);
            this.state.requiredSignatures = requiredSigs;
            this.state.depositTxHash = txHash;
            this.updateMultiSigUI();

        } catch (error) {
            console.error('❌ Multi-sig escrow creation failed:', error);
            this.log(`❌ Multi-sig escrow failed: ${error}`);
        }
    }


    private updateMultiSigUI() {
        const statusElement = document.getElementById('multisig-status');
        if (statusElement) {
            statusElement.textContent = `✅ Multi-sig escrow created! ${Number(this.state.amount) / 1000000} ADA locked with ${this.state.requiredSignatures} signature requirement`;
            statusElement.className = 'status success';
            statusElement.style.display = 'block';
        }
    }

    async releaseMultiSigEscrow() {
        console.log('🔓 Starting multi-sig release...');
        try {
            this.log('🔓 Releasing multi-sig escrow (key-based unlock)...');

            if (!this.lucid || !this.validator) {
                console.log('🎭 Using demo mode for multi-sig release...');
                this.log('📝 Demo mode: Simulating multi-sig release transaction');
                this.updateMultiSigReleaseUI();
                return;
            }

            // For demo, we'll use authorized key to sign
            this.lucid.selectWallet.fromSeed(AUTHORIZED_PASSPHRASE);
            console.log('👤 Switched to authorized key wallet for release');

            // Find contract UTxO
            const utxos = await this.lucid!.utxosAt(this.state.contractAddress!);
            const contractUtxo = utxos.find(utxo => utxo.txHash === this.state.depositTxHash);
            
            if (!contractUtxo) {
                throw new Error(`Contract UTxO not found for transaction ${this.state.depositTxHash}`);
            }

            // Create redeemer for release
            const { Data, Constr } = await loadLucidModule();
            const redeemer = Data.to(new Constr(0, [])); // Release

            // Build transaction
            const tx = await this.lucid!
                .newTx()
                .collectFrom([contractUtxo], redeemer)
                .pay.ToAddress(BENEFICIARY_ADDRESS, { lovelace: contractUtxo.assets.lovelace })
                .attach.SpendingValidator(this.validator)
                .addSignerKey(this.state.authorizedKeyHash!)
                .complete();

            const signedTx = await tx.sign.withWallet().complete();
            const txHash = await signedTx.submit();

            this.log(`✅ Multi-sig release transaction submitted: ${txHash}`);
            this.updateMultiSigReleaseUI();

        } catch (error) {
            console.error('❌ Multi-sig release failed:', error);
            this.log(`❌ Multi-sig release failed: ${error}`);
        }
    }


    private updateMultiSigReleaseUI() {
        const statusElement = document.getElementById('multisig-status');
        if (statusElement) {
            statusElement.textContent = `✅ Multi-sig released! ${Number(this.state.amount) / 1000000} ADA transferred to beneficiary`;
            statusElement.className = 'status success';
            statusElement.style.display = 'block';
        }
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
        const depositorElement = document.getElementById('depositor-wallet');
        const beneficiaryElement = document.getElementById('beneficiary-wallet');
        const authorizedElement = document.getElementById('authorized-wallet');
        
        if (depositorElement) depositorElement.textContent = 'Wallet: Loading...';
        if (beneficiaryElement) beneficiaryElement.textContent = 'Wallet: Loading...';
        if (authorizedElement) authorizedElement.textContent = 'Wallet: Loading...';
        
        // Call the existing balance update method
        await this.updateWalletDisplays();
        this.log('✅ Wallet balances refreshed');
    }
}
