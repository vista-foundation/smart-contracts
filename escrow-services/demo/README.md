# Escrow Services Demo

This directory contains the interactive demonstration for the Escrow Services smart contract.

## 🚀 Quick Start

### 1. Get Blockfrost API Key
1. Go to [https://blockfrost.io/](https://blockfrost.io/)
2. Create a free account
3. Create a new project for **Preview** network
4. Copy your API key (starts with `preview_...`)

### 2. Setup Environment
```bash
# Copy environment template
cp env.template .env

# Edit .env file and replace the placeholder with your actual API key
nano .env
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Run Demos

#### CLI Demo
```bash
node deploy-cli.js
```

#### Web Interface Demo
```bash
pnpm dev
```
Then open http://localhost:3000

## 📁 Project Structure

```
demo/
├── src/
│   ├── app/
│   │   ├── contract.ts       # Main demo logic with real transactions
│   │   ├── credentials.ts    # Hardcoded test wallets (same as custodial-transfer)
│   │   ├── env.ts           # Environment configuration
│   │   ├── lucid.ts         # Lucid Evolution loader
│   │   ├── polyfills.ts     # Browser compatibility
│   │   └── state.ts         # State management
│   ├── index.html           # Web interface
│   └── main.ts              # Entry point
├── deploy-cli.js            # CLI demonstration script
├── env.template             # Environment template
├── setup.sh                 # Setup script
└── package.json             # Dependencies
```

## 🎯 Demo Features

### Time-Lock Escrow
- Deposit assets with automatic unlock after deadline
- Demonstrates time-based conditions
- Real blockchain transactions

### Multi-Signature Escrow
- Require multiple signatures to release funds
- Demonstrates key-based conditions
- Flexible M-of-N signature schemes

### Real Blockchain Integration
- Connects to Cardano Preview network
- Uses Lucid Evolution for transaction building
- Real wallet balance checking
- Actual UTXO management

## 🔧 Configuration

### Environment Variables (.env)
```bash
BLOCKFROST_KEY=preview_your_actual_api_key_here
BLOCKFROST_URL=https://cardano-preview.blockfrost.io/api/v0
CARDANO_NETWORK=Preview
```

### Test Wallets
The demo uses hardcoded test wallets (same as custodial-transfer):
- **Depositor (Party A)**: Funded testnet wallet
- **Beneficiary (Party B)**: Funded testnet wallet  
- **Authorized Key (Party C)**: Funded testnet wallet

**Note**: These are test credentials only. Never use on mainnet.

## 🎥 Video Recording

This demo is designed for grant demonstration videos. See `../DEMO_INSTRUCTIONS.md` for detailed recording instructions.

## 🔍 Troubleshooting

### "Cannot convert undefined to a BigInt"
- Your Blockfrost API key is invalid or not set
- Make sure you're using a Preview network key
- Check that .env file exists and has correct format

### "BLOCKFROST_KEY environment variable is required"
- Copy `env.template` to `.env`
- Edit `.env` with your actual API key

### Dependencies Issues
- Run `pnpm install` to install all dependencies
- Make sure you have Node.js v18+ installed

### Port 3000 Already in Use
```bash
pnpm dev --port 3001
```

## 📝 Notes

- All transactions are real Preview network transactions
- No mock or simulation modes - everything is authentic
- Requires active internet connection for Blockfrost API
- API key must be for Preview network (not Mainnet)
