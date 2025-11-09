# Escrow Services Demo Scenarios

This document explains each scenario executed by `deploy-cli.js`. Every transaction occurs on the Cardano Preview network and uses the funded test wallets bundled with the repo. For an overview of datum fields, fee rules, and validity requirements, see the main [`escrow-services/README.md`](../README.md#validity--fee-rules).

## Shared Context
- **Depositor (Party A)** funds each escrow with 5 ADA.
- **Beneficiary (Party B)** receives funds when unlock conditions are satisfied.
- **Authorized (Party C)** co-signs or collects fees where appropriate.
- After every transaction, the CLI waits 45 seconds to give Blockfrost time to index the result.

## 1. Time-Lock Release
- **Goal**: Demonstrate time-based unlock with beneficiary signature.
- **Setup**: Party A locks 5 ADA; deadline set to “now + 1 hour”.
- **Unlock Path**: Party B signs the release (with time-based option as fallback).
- **Expected Result**: 5 ADA transferred to Party B.

## 2. Multi-Signature Release (2-of-3)
- **Goal**: Show configurable multi-sig conditions.
- **Setup**: Party A locks 5 ADA; datum requires any 2 of Party A, Party B, Party C.
- **Unlock Path**: Party C and Party A sign the release.
- **Expected Result**: 5 ADA transferred to Party B.

## 3. Authorized Refund
- **Goal**: Return locked funds to the depositor when authorized parties agree.
- **Setup**: Party A locks 5 ADA; datum requires signatures from Party C plus one other authorized key.
- **Unlock Path**: Party C and Party A sign the refund.
- **Expected Result**: 5 ADA returned to Party A.

## 4. Depositor Cancel (Before Deadline)
- **Goal**: Allow depositor to cancel before the deadline.
- **Setup**: Party A locks 5 ADA; deadline set 24 hours in the future; depositor is the only authorized signer.
- **Validity Tip**: The CLI sets `validTo` just before the datum deadline so the validator accepts the cancel.
- **Expected Result**: 5 ADA returned to Party A; escrow terminates cleanly.

## 5. Fee-Based Release
- **Goal**: Demonstrate configurable fees routed to a service provider.
- **Setup**: Party A locks 5 ADA; datum enforces a 20% fee (1 ADA) to Party C; remaining value goes to Party B.
- **Validity Tip**: Because this release is signature-driven, no `validFrom` bound is required; fee enforcement still applies.
- **Expected Result**: 4 ADA transferred to Party B, 1 ADA fee to Party C.

> Time-based unlocks (scenarios 1 and 5 if run without signatures) would additionally set `validFrom` at or after the datum deadline per the main README.

