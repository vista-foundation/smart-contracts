# Public Utility Smart Contracts

The smart contracts hosted in this repository are design to be used and serve as
"public utilities". By this we mean that the code contained within is:

* Open Source
* Royalty/Fee Free
* Hopefully useful in a variety of use cases

## Table of Contents

1. [Permissioned Minting](./minting/permissioned-mint)
    * Current Version: 1.0
    * This contract enables a specific wallet (via a permissioned credential) to control when new tokens may be minted under a defined policy.
    * Token burning remains open to all holders without restrictions.
    * 🔒 Built with [CIP-68 Metadata](https://cips.cardano.org/cips/cip68/) for enhanced interoperability.
    * 🛡️ **Audit Report**: [Download PDF](https://drive.google.com/file/d/1CEayqKyGgNc-s7To6HwfXTnvCCIvX7Ta/view)
