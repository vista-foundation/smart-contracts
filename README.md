# Public Utility Smart Contracts

The smart contracts hosted in this repository are designed to be used and serve as
"public utilities". By this we mean that the code contained within is:

* Open Source
* Royalty/Fee Free
* Hopefully useful in a variety of use cases

## Table of Contents

1. [Permissioned Minting](./minting/permissioned-mint)
    * Current Version: 1.0
    * This contract allows a specific wallet (permissioned credential) to control (via key signature) when new tokens may be minted under its policy.
    * 🔒 Built with [CIP-68 Metadata](https://cips.cardano.org/cips/cip68/) for enhanced interoperability.
    * 🛡️ **Audit Report**: [Download PDF](https://drive.google.com/file/d/1CEayqKyGgNc-s7To6HwfXTnvCCIvX7Ta/view)

2. [Custodial Transfer](./custodial-transfer)
    * Current Version: 1.0
    * A simple and efficient escrow smart contract that enables secure asset transfers between parties through a trusted custodian. Mimics real-world shipping and logistics scenarios where a carrier holds assets until delivery conditions are met.
    * 🚚 **Operations**: Deposit, Withdraw (sender), Deliver (custodian), Return (receiver)
    * 🔒 Built with Aiken for Plutus V3

3. [Escrow Services](./escrow-services)
    * Current Version: 1.0
    * A powerful escrow smart contract with time-based and key-based unlock conditions. Supports configurable multi-signature authorization (1-of-N, 2-of-N) and optional service fees.
    * ⏰ **Features**: Time-lock release, multi-sig authorization, configurable fees (0-100%)
    * 🔐 **Operations**: Release (key/time-based), Refund (key/time-based), Cancel (depositor only)
    * 🔒 Built with Aiken for Plutus V3
