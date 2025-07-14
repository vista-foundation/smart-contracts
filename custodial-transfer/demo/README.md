# Custodial Transfer Smart Contract Demo

This project demonstrates a Cardano smart contract for custodial transfers using Aiken and Lucid Evolution. The demo includes a web interface and Playwright tests that can be recorded for demonstration purposes.

## Overview

The custodial transfer contract allows:
- **Party A (Sender)**: Deposits funds into the contract
- **Party B (Receiver)**: Can either deliver to Party C or return to Party A
- **Party C (Custodian)**: Receives funds when delivery is successful

## Contract Actions

1. **Deposit**: Party A locks funds in the contract
2. **Withdraw**: Party A can withdraw funds before delivery
3. **Deliver**: Party B delivers funds to Party C (custodian)
4. **Return**: Party B returns funds to Party A

## Project Structure

```
custodial-transfer/example/
├── src/
│   ├── index.html          # Main web interface
│   └── main.ts             # TypeScript logic with Lucid integration
├── tests/
│   ├── custodial-transfer.spec.ts  # Comprehensive test suite
│   └── video-demo.spec.ts          # Video recording tests
├── playwright.config.ts    # Playwright configuration
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite development server config
└── package.json           # Project dependencies
```

## Installation

1. Install dependencies:
```bash
pnpm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Usage

### Development Server

Start the development server:
```bash
pnpm dev
```

The interface will be available at `http://localhost:3000`

### Running Tests

Run all tests:
```bash
pnpm test
```

Run tests with UI:
```bash
pnpm test:ui
```

Run tests in headed mode (visible browser):
```bash
pnpm test:headed
```

### Recording Videos for Demonstration

The project includes special video recording tests designed for creating demonstration videos:

1. **Complete Demo**: Records all scenarios in sequence
```bash
npx playwright test video-demo.spec.ts --project=chromium --headed
```

2. **Individual Scenarios**: Record specific scenarios
```bash
npx playwright test "Individual Scenario" --project=chromium --headed
```

Video files will be saved in the `test-results` directory.

## Demo Scenarios

The demo covers all scenarios mentioned in the requirements:

### 1. Locking Transaction (Deposit)
- Party A deposits funds into the contract
- Contract is created with the specified amount
- Other parties can now take action

### 2. Unlock by Withdrawal
- Party A withdraws funds before delivery
- Funds are returned to the sender
- Contract is completed

### 3. Unlock by Delivery
- Party B delivers funds to Party C (custodian)
- Custodian receives the funds
- Contract is completed successfully

### 4. Unlock by Return
- Party B returns funds to Party A
- Sender receives the funds back
- Contract is completed

## Technical Details

### Smart Contract Integration

The demo uses:
- **Lucid Evolution**: For Cardano blockchain interactions
- **Aiken Contract**: Compiled Plutus contract from `plutus.json`
- **Demo Mode**: Simulated transactions for testing without real blockchain

### Wallet Management

The demo uses hardcoded test mnemonics for simplicity:
- Each party has a predefined wallet
- Transactions are simulated in demo mode
- Real blockchain interaction is supported but requires proper setup

### Test Configuration

- **Playwright**: End-to-end testing framework
- **Video Recording**: Automatic recording for demonstration
- **Screenshots**: Captured at key moments
- **Trace Files**: For debugging test runs

## Creating the Approval Video

To create the video for approval:

1. Run the complete video demo test:
```bash
npx playwright test "Complete Video Demo" --project=chromium --headed
```

2. The test will:
   - Show all four scenarios in sequence
   - Take screenshots at key moments
   - Record a video of the entire process
   - Include proper timing for clear demonstration

3. Find the video in `test-results/video-demo-Complete-Video-Demo/video.webm`

## Customization

### Changing Contract Parameters

Edit `main.ts` to modify:
- Default deposit amounts
- Wallet configurations
- Contract addresses
- Transaction parameters

### Styling

Edit the `<style>` section in `index.html` to customize:
- Color schemes
- Layout
- Animation effects
- Responsive design

### Test Scenarios

Edit test files to:
- Add new scenarios
- Modify timing for video recording
- Change assertion conditions
- Add custom interactions

## Troubleshooting

### Common Issues

1. **Port already in use**: Change port in `vite.config.ts`
2. **Playwright installation**: Run `npx playwright install`
3. **TypeScript errors**: Check `tsconfig.json` configuration
4. **Video recording**: Ensure adequate disk space

### Debug Mode

Run tests with debug mode:
```bash
npx playwright test --debug
```

## License

This project is for demonstration purposes and follows the same license as the parent Aiken project.

## Next Steps

For production use:
1. Replace hardcoded mnemonics with proper wallet integration
2. Add real Blockfrost API key
3. Implement proper error handling
4. Add transaction confirmation waiting
5. Include network selection options 