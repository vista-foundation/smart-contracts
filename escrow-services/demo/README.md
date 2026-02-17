# Escrow Services CLI Demo

This directory hosts the command-line demonstration for the Escrow Services smart contract.  
It connects to the Cardano Preview network and submits real transactions that showcase every supported flow without relying on a browser UI.

## 🚀 Quick Start

1. **Get a Blockfrost Preview API key**
   - Visit [https://blockfrost.io/](https://blockfrost.io/)
   - Create a free account and a project on the **Preview** network
   - Copy the generated API key (starts with `preview_`)

2. **Configure the environment**
   ```bash
   cp env.template .env
   # edit .env and replace the API key placeholder
   ```

3. **Install dependencies**
   ```bash
   pnpm install
   ```

4. **Run the CLI demonstration**
   ```bash
   pnpm start
   # or
   node deploy-cli.js
   ```

The CLI executes a series of deposits and contract interactions, automatically waiting 45 seconds between each transaction so Blockfrost can index the results.

## 📁 Key Files

- `deploy-cli.js` – main CLI script executing the escrow scenarios
- `env.template` – environment template for Blockfrost settings
- `.env` – copy of the template with your credentials (ignored by git)
- `setup.sh` – helper script that copies `.env`, installs dependencies, and reminds you how to run the CLI
- `package.json` – minimal dependency list for the CLI workflow

## 🎯 Demonstrated Scenarios

- **Time-lock release** – see [`SCENARIOS.md`](./SCENARIOS.md) for actors and the validity window the CLI uses when relying on deadlines.
- **Multi-signature release** – signature-driven release without time bounds.
- **Authorized refund** – signatures return the entire balance to the depositor (no fees applied).
- **Depositor cancel** – depositor cancels before the deadline; the CLI sets `validTo` just before the datum deadline so the validator accepts it.
- **Fee-based release** – demonstrates the only path that enforces percentage fees; refund/cancel paths bypass fees entirely.

Each scenario uses small ADA values (5 ADA) so repeated executions remain affordable on the Preview network. Consult the top-level [`escrow-services/README.md`](../README.md#validity--fee-rules) for the full set of rules covering deadlines, validity ranges, and fee handling.

## 🔧 Environment Variables

```bash
BLOCKFROST_KEY=preview_your_actual_api_key_here
BLOCKFROST_URL=https://cardano-preview.blockfrost.io/api/v0
CARDANO_NETWORK=Preview
```

## 💳 Test Wallets

The CLI reuses the same funded Preview test wallets referenced in the repository:
- **Party A (Depositor)**
- **Party B (Beneficiary)**
- **Party C (Authorized / Fee recipient)**

> These credentials are for **testnet only**. Never reuse them on mainnet.

## 🛠 Troubleshooting

- **`BLOCKFROST_KEY environment variable is required`**  
  Copy `env.template` to `.env`, populate the key, and rerun the CLI.

- **`EMPTY_UTXO` or missing UTxO errors**  
  Ensure the previous transaction has been indexed (the CLI already waits 45 seconds). Rerun the command if necessary.

- **Network or provider errors**  
  Verify your internet connection and confirm that the Blockfrost Preview service is reachable.

## 📝 Notes

- All transactions interact with the real Cardano Preview testnet.
- The CLI logs every transaction hash so you can verify them on Blockfrost or any Preview explorer.
- Extend or customize the scenarios by editing `deploy-cli.js`.
