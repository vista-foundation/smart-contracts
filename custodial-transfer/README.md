# Custodial Transfer Smart Contract

A simple and efficient escrow smart contract for Cardano that enables secure asset transfers between parties through a trusted custodian. This contract mimics real-world shipping and logistics scenarios where a carrier holds assets until delivery conditions are met.

## 🔍 Overview

The custodial transfer contract facilitates secure asset transfers between three parties:
- **Sender (Party A)**: Deposits assets into escrow
- **Receiver (Party B)**: Intended recipient of the assets  
- **Custodian (Party C)**: Trusted third party who validates delivery

## 📊 Contract Flow

```mermaid
graph TD
    A[Sender deposits assets<br/>Any amount of ADA + tokens] --> B[Contract UTXO created<br/>with Datum]
    
    B --> C{What happens next?}
    
    C -->|Withdraw<br/>Signed by: Sender| D[ALL value → Sender<br/>Contract ENDS]
    
    C -->|Deliver<br/>Signed by: Receiver + Custodian| E[ALL value → Receiver<br/>Contract ENDS]
    
    C -->|Return<br/>Signed by: Receiver| F[ALL value → Sender<br/>Contract ENDS]
    
    G[Datum Structure<br/>sender: VerificationKeyHash<br/>receiver: VerificationKeyHash<br/>custodian: VerificationKeyHash] --> B
    
    style A fill:#e1f5fe
    style D fill:#e8f5e8
    style E fill:#e8f5e8
    style F fill:#e8f5e8
    style B fill:#fff3e0
    style G fill:#f3e5f5
```

## 🏗️ Data Structures

### Datum
The contract state stored in the UTXO:

```aiken
pub type Datum {
  sender: VerificationKeyHash,      // Party A who deposits
  receiver: VerificationKeyHash,    // Party B who receives
  custodian: VerificationKeyHash,   // Party C who validates
}
```

### Redeemer
The actions that can be performed:

```aiken
pub type Redeemer {
  Withdraw,  // Sender reclaims before delivery
  Deliver,   // Receiver gets assets with custodian approval
  Return,    // Receiver returns assets to sender
}
```

## ⚡ Operations

### 1. Deposit (Off-chain)
- **Who**: Sender
- **Action**: Send any assets (ADA + tokens) to the contract address
- **Result**: Creates a UTXO with the deposit datum
- **Signature**: Sender only

### 2. Withdraw
- **Who**: Sender  
- **When**: Before delivery occurs
- **Action**: Reclaim all deposited assets
- **Result**: All assets returned to sender, contract ends
- **Signature**: Sender only

### 3. Deliver
- **Who**: Receiver + Custodian
- **When**: Delivery is completed successfully
- **Action**: Transfer all assets to receiver
- **Result**: All assets go to receiver, contract ends
- **Signature**: Both receiver and custodian required

### 4. Return
- **Who**: Receiver
- **When**: Asset needs to be returned to sender
- **Action**: Send all assets back to sender
- **Result**: All assets returned to sender, contract ends
- **Signature**: Receiver only

## 🎯 Key Features

### ✅ Advantages
- **Simple Design**: Minimal datum with only essential party information
- **Flexible Assets**: Supports any combination of ADA and native tokens
- **Complete Transfer**: Entire UTXO value transferred (no partial transfers)
- **Clean Termination**: Contract ends after any operation (no lingering UTxOs)
- **Gas Efficient**: Minimal on-chain state and computation

### 🔒 Security Features
- **Signature Verification**: All operations require appropriate signatures
- **Complete Value Transfer**: Ensures all assets are properly transferred
- **No Continuing Outputs**: Prevents creation of useless UTxOs
- **Atomic Operations**: All transfers happen in single transactions

## 🔧 Building and Testing

### Build the Contract
```bash
cd custodial-transfer
aiken build
```

### Run Tests
```bash
aiken check
```

### Format Code
```bash
aiken fmt
```

## 📝 Usage Examples

### Example 1: Digital Asset Sale
1. **Seller deposits** 1000 TokenA + 5 ADA into escrow
2. **Buyer confirms** delivery with shipping company approval
3. **All assets transferred** to buyer automatically

### Example 2: Freelance Payment
1. **Client deposits** 50 ADA as payment
2. **Freelancer delivers** work, shipping company validates
3. **Payment released** to freelancer

### Example 3: Withdrawal Before Delivery
1. **Sender deposits** assets
2. **Sender changes mind** before delivery
3. **Sender withdraws** all assets, contract ends

## 🏛️ Contract Architecture

The contract follows a simple but robust design:

- **Stateless**: No complex state tracking needed
- **Value-focused**: Works with entire UTXO values
- **Party-centric**: Clear roles for all three parties
- **End-to-end**: Contract lifecycle from deposit to completion

## 🛠️ Integration

The contract can be integrated with:
- **Wallets**: For signing transactions
- **DApps**: For user interfaces
- **APIs**: For automated escrow services
- **Oracles**: For delivery confirmation

## 📄 License

Licensed under the Apache License, Version 2.0.

## 🤝 Contributing

Contributions are welcome! Please ensure all tests pass and follow the existing code style.

---

*This contract provides a foundation for secure, efficient asset transfers on Cardano. Its simplicity makes it both gas-efficient and easy to understand, while maintaining strong security guarantees.*
