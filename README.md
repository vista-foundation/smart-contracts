# Public Utility Smart Contracts

The smart contracts hosted in this repository are design to be used and serve as
"public utilities". By this we mean that the code contained within is:

* Open Source
* Royalty/Fee Free
* Hopefully useful in a variety of use cases

## Table of Contents

1. [Permissioned Minting](./minting/permissioned-mint)
    * Current Version: 1.0
    * This contract allows a specific wallet (permissioned credential) to
      control (via key signature) when new tokens may be minted under its
      policy.
    * This contract always allows holders to burn their tokens without requiring
      permissions