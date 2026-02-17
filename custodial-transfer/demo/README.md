# Custodial Transfer Smart Contract Demo

This project demonstrates a Cardano smart contract for custodial transfers using Aiken and Lucid Evolution. The demo includes a web interface for manual testing of all contract functionality.

## Overview

The custodial transfer contract enables secure asset transfers between three parties:
- **User A / Sender (Party A)**: Deposits funds into the contract
- **User B / Final Receiver (Party B)**: Intended recipient who can refuse delivery
- **Entity C / Custodian (Party C)**: Trusted third party who facilitates delivery

## Contract Actions

1. **Deposit**: User A locks funds in the contract
2. **Withdraw**: User A can withdraw funds before delivery
3. **Deliver**: Entity C facilitates delivery to User B
4. **Refuse Delivery**: User B refuses delivery and returns funds to User A

## Project Structure

```
custodial-transfer/demo/
├── src/
│   ├── index.html          # Main web interface
│   ├── main.ts             # TypeScript logic with Lucid integration
│   └── app/
│       ├── contract.ts     # Smart contract interaction logic
│       ├── credentials.ts  # Hardcoded test credentials (funded on testnet)
│       ├── lucid.ts        # Lucid Evolution setup
│       └── state.ts        # Contract state types
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite development server config
└── package.json           # Project dependencies
```

## Installation

1. Install dependencies:
```bash
pnpm install
```

## Usage

### Development Server

Start the development server:
```bash
pnpm dev
```

The interface will be available at `http://localhost:3000`

## Manual Testing

The demo provides a complete web interface for testing all contract functionality manually. The interface includes three sections representing each party in the custodial transfer process.

### Test Credentials

The demo uses hardcoded test credentials that are **funded on Cardano testnet** for easy testing and reproducibility. These credentials are defined in `src/app/credentials.ts`:

- **User A (Sender)**: Party A wallet - funded with testnet ADA
- **User B (Receiver)**: Party B wallet - funded with testnet ADA  
- **Entity C (Custodian)**: Party C wallet - funded with testnet ADA

**Note**: These are test credentials only. Never use these mnemonics on mainnet.

## Demo Scenarios

The demo covers all requirements for custodial transfers:

### 1. Locking Transaction (Deposit)
- **User A** deposits funds into the contract
- Contract UTXO is created with the specified amount
- Other parties can now take action

### 2. Unlock by Withdrawal (Prior to Delivery)
- **User A** withdraws funds before any delivery occurs
- All funds are returned to User A
- Contract is completed

### 3. Unlock by Delivery (Entity C Facilitates)
- **Entity C (Custodian)** confirms and facilitates delivery
- All funds are transferred to **User B (Final Receiver)**
- Contract is completed successfully

### 4. Unlock by Refusal (User B Refuses)
- **User B** refuses the delivery
- All funds are returned to **User A**
- Contract is completed

## Technical Details

### Smart Contract Integration

The demo uses:
- **Lucid Evolution**: For Cardano blockchain interactions
- **Aiken Contract**: Compiled Plutus contract from `../plutus.json`
- **Blockfrost**: For Cardano testnet connectivity
- **Demo Mode**: Simulated transactions for testing without blockchain

### Wallet Management

The demo uses hardcoded test wallets with funded testnet addresses:
- Each party has a predefined wallet with test ADA
- Real blockchain transactions are supported on testnet
- Demo mode available for offline testing

## Customization

### Changing Contract Parameters

Edit files to modify:
- **Default amounts**: Change values in `src/index.html`
- **Wallet credentials**: Update `src/app/credentials.ts` (testnet only!)
- **Blockfrost settings**: Modify `src/app/env.ts`
- **Contract logic**: See `src/app/contract.ts`

### Styling

Edit the `<style>` section in `src/index.html` to customize:
- Color schemes for each party
- Layout and responsive design
- Button styles and animations

## Troubleshooting

### Common Issues

1. **Port already in use**: Change port in `vite.config.ts`
2. **TypeScript errors**: Check `tsconfig.json` configuration
3. **Blockfrost connectivity**: Verify API key in environment
4. **Transaction failures**: Check wallet balances and UTxO availability

## License

This project is for demonstration purposes and follows the same license as the parent Aiken project.

## Next Steps

For production use:
1. **Replace test credentials** with proper wallet integration (CIP-30)
2. **Add mainnet support** with proper network selection
3. **Implement robust error handling** and user feedback
4. **Add transaction confirmation** waiting and status tracking
5. **Include proper security measures** for production deployment

---

*This demo provides a complete implementation of the custodial transfer smart contract with all milestone requirements fulfilled. The hardcoded test credentials make it easy to reproduce and test all functionality on Cardano testnet.* 