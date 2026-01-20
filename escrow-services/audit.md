## Technical Security Review of

# Escrow Services Smart Contract

### Rodrigo Molina


         - December Cardano Developer
- 1 Executive Summary and Scope Contents
   - 1.1 Scope
   - 1.2 Methodology
- 2 Technical Analysis
   - 2.1 Contract Architecture
      - 2.1.1 Core Data Structures
      - 2.1.2 Validator Functions
   - 2.2 Key Helper Functions
      - 2.2.1 Output Verification
      - 2.2.2 Signature Verification
      - 2.2.3 Fee Distribution
      - 2.2.4 Time Validation
- 3 Security Analysis
   - 3.1 Common Cardano Vulnerabilities Assessment
      - 3.1.1 Double Satisfaction
      - 3.1.2 Datum Trust / UTxO Creation
      - 3.1.3 Input Identification
      - 3.1.4 Continuing Output Prevention
   - 3.2 Authorization Model Analysis
   - 3.3 Value Handling Analysis
      - 3.3.1 Fee Calculation
      - 3.3.2 Value Conservation
   - 3.4 Time Handling Analysis
- 4 Findings and Recommendations
   - 4.1 Medium Risk Findings
      - 4.1.1 M-01: Potential Double Satisfaction with Identical Escrow UTxOs
      - 4.1.2 M-02: Duplicate Authorized Keys Can Bypass Multi-Sig Requirements
   - 4.2 Low Risk Findings
      - 4.2.1 L-01: Test Coverage Gaps
   - 4.3 Informational Findings
      - 4.3.1 I-01: Redundant Value Conservation Check
      - 4.3.2 I-02: Both Release and Refund Available After Deadline
   - 4.4 Optimization Recommendations
      - 4.4.1 O-01: Multiple Output List Iterations
      - 4.4.2 O-02: Quadratic Signature Checking Complexity
- 5 Proof of Concept Demonstrations
   - 5.1 M-01: Double Satisfaction Proof of Concept
   - 5.2 M-01 Variant: Fee Bypass Proof of Concept
   - 5.3 M-02: Duplicate Keys Bypass Proof of Concept
   - 5.4 Using These Tests After Remediation
- 6 Security Guarantees
   - 6.1 Access Control
   - 6.2 Value Protection
   - 6.3 State Management
   - 6.4 Time Handling
- 7 Conclusion
   - 7.1 Risk Assessment
   - 7.2 Overall Assessment
- A About the Auditor
- B References


## 1 Executive Summary and Scope Contents

```
This report presents the findings of a security audit conducted on theescrowservicesAiken
smart contract. The contract implements a feature-rich escrow system for secure asset transfers
on the Cardano blockchain using Plutus V3, with support for time-based unlock, multi-signature
authorization, and configurable fees.
```
### 1.1 Scope

```
The audit covers:
```
- Smart contract:escrowservices.ak
- Plutus version: V
- Aiken compiler: v1.1.
- Dependencies: aiken-lang/stdlib v2.2.0, aiken-lang/fuzz v2.1.1 (testing)

```
Note: This audit is limited to on-chain validator logic. Off-chain transaction building code
and CLI tooling were not in scope.
```
### 1.2 Methodology

```
The audit methodology included:
```
1. Static code analysis
2. Business logic review
3. Security model verification (double satisfaction, datum trust, authorization)
4. Test coverage analysis

## 2 Technical Analysis

### 2.1 Contract Architecture

```
The escrow-services contract enables secure asset transfers between a depositor and beneficiary
with flexible unlock conditions.
```
#### 2.1.1 Core Data Structures

1 pub type EscrowDatum {
2 depositor: VerificationKeyHash ,
3 beneficiary: VerificationKeyHash ,
4 deadline: Option <Int >, // POSIX timestamp for time -based unlock
5 required_signatures: Int , // Multi -sig threshold
6 authorized_keys: List <VerificationKeyHash >,
7 fee_config: FeeConfig ,
8 }
9
10 pub type FeeConfig {
11 fee_percentage: Int , // Basis points (0 -10000)
12 fee_recipient: Option <VerificationKeyHash >,
13 }
14
15 pub type EscrowRedeemer {
16 Release // Release to beneficiary


17 Refund // Refund to depositor
18 Cancel // Cancel by depositor before deadline
19 }

#### 2.1.2 Validator Functions

```
The contract implements a singlespendvalidator with three redeemer paths:
```
1. Release: Transfers assets to beneficiary (minus fees) when either:
    - Time-based: Current time is past the deadline
    - Key-based: Required number of authorized signatures present
2. Refund: Returns all assets to depositor when either:
    - Time-based: Deadline has passed
    - Key-based: Required signatures authorize the refund
3. Cancel: Returns assets to depositor when:
    - Signed by depositor AND before deadline

### 2.2 Key Helper Functions

#### 2.2.1 Output Verification

1 fn find_output_to_pkh_with_value(
2 outputs: List <Output >,
3 pkh: VerificationKeyHash ,
4 expected_value: Value ,
5 ) -> Bool {
6 list.any(outputs , fn(out: Output) {
7 let addr = out.address
8 expect VerificationKey(output_pkh) = addr.payment_credential
9 let pkh_matches = output_pkh == pkh
10 let value_matches = out.value == expected_value
11 pkh_matches && value_matches
12 })
13 }

#### 2.2.2 Signature Verification

1 fn check_required_signatures(
2 signatories: List <VerificationKeyHash >,
3 authorized_keys: List <VerificationKeyHash >,
4 required_count: Int ,
5 ) -> Bool {
6 let valid_signatures =
7 list.filter(authorized_keys , fn(key) { list.has(signatories , key) })
8 let signature_count = list.length(valid_signatures)
9 signature_count >= required_count
10 }


#### 2.2.3 Fee Distribution

1 fn compute_release_distribution(
2 value: Value ,
3 fee_config: FeeConfig ,
4 ) -> Option <(Value , Value)> {
5 let fee_percentage = fee_config.fee_percentage
6 // ... validates percentage bounds (0 -10000)
7 let lovelace_amount = assets.lovelace_of(value)
8 let fee_amount = lovelace_amount * fee_percentage / 10000
9 let beneficiary_lovelace = lovelace_amount - fee_amount
10 // Returns (beneficiary_value , fee_value)
11 }

#### 2.2.4 Time Validation

```
The contract implements proper validity range checking through:
```
- lowerboundonorafter: Checks if transaction validity starts at or after a point
- upperboundbefore: Checks if transaction validity ends before a point
- ispastdeadline: Verifies time-based unlock conditions
- isbeforedeadline: Verifies cancel is allowed

## 3 Security Analysis

### 3.1 Common Cardano Vulnerabilities Assessment

#### 3.1.1 Double Satisfaction

The contract uses a helper function to locate outputs:
1 fn find_output_to_pkh_with_value(
2 outputs: List <Output >,
3 pkh: VerificationKeyHash ,
4 expected_value: Value ,
5 ) -> Bool {
6 list.any(outputs , fn(out: Output) {
7 // ... checks pkh and exact value match
8 pkh_matches && value_matches
9 })
10 }

```
Analysis: The use oflist.any()means the same output could potentially satisfy multiple
validator executions in a single transaction. See Finding 4.1.1 for details.
```
#### 3.1.2 Datum Trust / UTxO Creation

```
The contract does not use state tokens to verify UTxO provenance. This is acceptable for
escrow patterns where:
```
- The depositor creates the initial UTxO with their chosen parameters
- There is no multi-step state machine requiring verified transitions
- The datum contents determine the contract terms at creation time


#### 3.1.3 Input Identification

```
The contract properly identifies its own input usingOutputReference:
```
1 expect Some(own_input) =
2 list.find(inputs , fn(i: Input) { i.output_reference == own_ref })

```
This correctly isolates each validator execution to its specific input.
```
#### 3.1.4 Continuing Output Prevention

```
The contract prevents value from remaining at the script address:
```
1 let no_continuing_output =
2 !list.any(outputs , fn(o) { o.address == own_address })

```
This ensures clean contract termination after any operation.
```
### 3.2 Authorization Model Analysis

- Release/Refund: Requires either time-based OR key-based authorization
- Cancel: Requires depositor signature AND must be before deadline
- Multi-sig: Configurable threshold viarequiredsignatures

```
See Finding 4.1.2 for a potential issue with the multi-sig implementation.
```
### 3.3 Value Handling Analysis

#### 3.3.1 Fee Calculation

1 let fee_amount = lovelace_amount * fee_percentage / 10000
2 let beneficiary_lovelace = lovelace_amount - fee_amount

```
Strengths:
```
- Aiken uses arbitrary-precision integers (no overflow)
- Fee percentage bounds are validated (0-10000)
- Negative value checks are in place
- Native tokens bypass fees and go entirely to beneficiary

```
Consideration: Integer division truncates, so small amounts may have minor rounding.
For example, 33 lovelace with 1% fee yields 33× 100 /10000 = 0 fee.
```
#### 3.3.2 Value Conservation

```
The contract verifies value conservation:
```
1 let expected_total = assets.merge(beneficiary_value , fee_value)
2 let value_conserved =
3 assets.merge(own_value , assets.negate(expected_total))
4 |> assets.is_zero

```
This ensures no value is created or destroyed during release, but note this is alocalcheck
per validator execution—it does not prevent double satisfaction across multiple inputs.
```

### 3.4 Time Handling Analysis

1 fn lower_bound_on_or_after(validity_range , point) -> Bool {
2 let lower = validity_range.lower_bound
3 when lower.bound_type is {
4 interval.NegativeInfinity -> False
5 interval.PositiveInfinity -> False
6 interval.Finite(value) ->
7 if lower.is_inclusive { value >= point }
8 else { value > point }
9 }
10 }

```
Strengths:
```
- Correctly handles inclusive vs exclusive bounds
- Properly rejects unbounded (infinite) ranges
- Separate functions for lower and upper bound checks

## 4 Findings and Recommendations

### 4.1 Medium Risk Findings

#### 4.1.1 M-01: Potential Double Satisfaction with Identical Escrow UTxOs

```
Severity: Medium
Location:findoutputtopkhwithvalue(lines 113–133)
Description: Thefindoutputtopkhwithvaluefunction useslist.any() to check
ifany output matches the required recipient and value. If a transaction consumes multiple
escrow UTxOs that have identical beneficiary and locked value, a single output could satisfy
both validator executions.
The validator checks “does an output exist for the beneficiary?” rather than “is there a
unique output for THIS specific escrow?” This allows two validators to both find and accept
the same output.
Real-World Attack Scenario—Freelancer Milestone Payments:
Consider a client hiring a freelancer with multiple milestone payments:
```
1. Client createsEscrow A: 500 ADA for Milestone 1 (beneficiary = Freelancer, deadline
    = Jan 15)
2. Client createsEscrow B: 500 ADA for Milestone 2 (beneficiary = Freelancer, deadline
    = Jan 15)
3. Client createsEscrow C: 500 ADA for Milestone 3 (beneficiary = Freelancer, deadline
    = Jan 15)
4. After Jan 15 deadline passes, time-based unlock activates for all three
5. Attacker constructs malicious transaction:
    - Inputs: All three escrow UTxOs (1500 ADA total)
    - Outputs: 500 ADA to Freelancer + 1000 ADA to Attacker
6. Each of the three validators executes:
    - Validator A: Looks for 500 ADA to Freelancer→finds it→PASSES


- Validator B: Looks for 500 ADA to Freelancer→findssame output→PASSES
- Validator C: Looks for 500 ADA to Freelancer→findssame output→PASSES
7. Result: Freelancer receives 500 ADA instead of 1500 ADA. Attacker steals 1000 ADA.

```
Fee Bypass Variant: The beneficiary themselves can exploit this to avoid paying fees.
Consider a freelancer authorized to release their own milestone payments (10% platform fee):
```
1. Freelancer has 2 escrows of 1000 ADA each (2000 ADA total)
2. Legitimate release: 900 ADA to Freelancer + 100 ADA to Platform, per escrow
3. Freelancer’s exploit(single transaction):
    - Inputs: Both escrow UTxOs (2000 ADA)
    - Outputs: 900 ADA to Freelancer + 100 ADA to Platform + 1000 ADA to Freelancer
4. Both validators find the same 900 ADA and 100 ADA outputs→PASS

```
Party Expected Actual Loss
Freelancer 1800 ADA 1900 ADA (gains 100 ADA)
Platform 200 ADA 100 ADA 100 ADA (50% of fees)
```
This variant is particularly realistic because the freelancer has direct financial incentive
to batch-release and underpay fees. Both output checks (findoutputtopkhwithvaluefor
beneficiary and fee recipient) are vulnerable—the same outputs satisfy multiple validators.
WhyvalueconservedDoesn’t Prevent This: Thevalueconservedcheck only verifies
thatownvalue == beneficiaryvalue + feevaluelocally for each validator. It confirms
the fee math is correct but doesn’t check that outputs aren’t shared across multiple validator
executions.
Likelihood: Moderate—requires multiple escrows with identical parameters (same benefi-
ciary, same value, same unlock conditions). Common in milestone-based payments, subscription
services, or batch disbursements.
Recommendation: Implement one of the following mitigations:
Option 1: Output Tagging (Recommended)
Tag each output with a unique identifier derived from the input’sOutputReference. This
ensures one-to-one correspondence between inputs and outputs.
1 // Include input reference hash in output datum
2 pub type TaggedOutputDatum {
3 input_ref_hash: ByteArray , // Hash of OutputReference
4 }
5
6 // In validator , verify the output is tagged for THIS input
7 fn find_tagged_output(outputs , own_ref , pkh , value) -> Bool {
8 let expected_tag = hash_output_reference(own_ref)
9 list.any(outputs , fn(out) {
10 // Check datum contains matching tag
11 out.datum == expected_tag &&
12 out.address.payment_credential == pkh &&
13 out.value == value
14 })
15 }


```
Option 2: Unique Value Amounts
Ensure each escrow has a slightly different value (e.g., add a unique identifier in lovelace).
This is a workaround rather than a fix.
Option 3: Documentation and Off-Chain Prevention
Document this limitation and implement off-chain checks to prevent creation of identical
escrows. This shifts responsibility to integrators.
```
#### 4.1.2 M-02: Duplicate Authorized Keys Can Bypass Multi-Sig Requirements

```
Severity: Medium
Location:checkrequiredsignatures(lines 220–230)
Description: Thecheckrequiredsignaturesfunction counts how many keys fromauthorizedkeys
are present in the transaction signatories:
1 let valid_signatures =
2 list.filter(authorized_keys , fn(key) { list.has(signatories , key) })
3 let signature_count = list.length(valid_signatures)
Ifauthorizedkeyscontains duplicate entries, a single signature would be counted multiple
times. This could allow a malicious depositor to create an escrow thatappearsto require multi-
sig but can actually be controlled by a single key.
Attack Scenario:
```
1. Malicious depositor creates escrow with:
    - authorizedkeys = [depositorkey, depositorkey, depositorkey]
    - requiredsignatures = 3
2. Beneficiary inspects datum and believes a 3-of-3 multi-sig is required
3. Depositor alone can release or refund with just their single signature (counted 3 times)

Likelihood: Low—requires social engineering and beneficiary not carefully inspecting the
authorizedkeyslist for uniqueness.
Recommendation: Deduplicate theauthorizedkeyslist before counting:
1 fn check_required_signatures(
2 signatories: List <VerificationKeyHash >,
3 authorized_keys: List <VerificationKeyHash >,
4 required_count: Int ,
5 ) -> Bool {
6 // Deduplicate authorized_keys first
7 let unique_keys = list.unique(authorized_keys)
8 let valid_signatures =
9 list.filter(unique_keys , fn(key) { list.has(signatories , key) })
10 let signature_count = list.length(valid_signatures)
11 signature_count >= required_count
12 }

```
Alternatively, document this behavior and require off-chain validation of datum parameters
before accepting an escrow.
```
### 4.2 Low Risk Findings

#### 4.2.1 L-01: Test Coverage Gaps

```
Severity: Low
Description: While the contract includes property-based tests, certain edge cases could
benefit from additional coverage:
```

- Time-based unlock with edge timestamps (exactly at deadline boundary)
- Fee calculation with very small values (rounding to zero)
- Fee calculation with very large values (near integer limits)
- Behavior whenrequiredsignatures = 0
- Emptyauthorizedkeyslist
- feepercentage = 10000(100% fee scenario)

```
Recommendation: Expand test suite to cover these edge cases explicitly.
```
### 4.3 Informational Findings

#### 4.3.1 I-01: Redundant Value Conservation Check

```
Location:handlerelease(lines 281–284)
Description: Thevalueconservedcheck verifies thatbeneficiaryvalue + feevalue
== ownvalue. However, this check is mathematically guaranteed to always pass because
beneficiarylovelaceis calculated as the remainder after fee deduction:
1 let fee_amount = lovelace_amount * fee_percentage / 10000
2 let beneficiary_lovelace = lovelace_amount - fee_amount // remainder
This means:
```
```
beneficiary_value + fee_value
= (tokens + beneficiary_lovelace) + fee_amount
= tokens + (lovelace_amount - fee_amount) + fee_amount
= tokens + lovelace_amount
= own_value (always!)
```
The check provides no security benefit—value conservation is already enforced by the Car-
dano ledger, and the correct distribution to recipients is verified byfindoutputtopkhwithvalue.
The check only serves as defensive programming against future refactoring bugs.
Recommendation: Remove the runtime check and replace it with a property-based test
that verifies the fee calculation invariant:
1 test test_fee_distribution_conserves_value(
2 lovelace via sample_lovelace_amount (),
3 fee_pct via fuzz.int_between (0, 10000) ,
4 ) {
5 let value = assets.from_lovelace(lovelace)
6 let fee_config = FeeConfig { fee_percentage: fee_pct , fee_recipient: None }
7 when compute_release_distribution(value , fee_config) is {
8 None -> True // Invalid config , skip
9 Some(( beneficiary_value , fee_value)) -> {
10 let total = assets.merge(beneficiary_value , fee_value)
11 total == value // Must always be true
12 }
13 }
14 }

```
This catches refactoring bugs during development/CI rather than wasting execution units
on every transaction at runtime.
```

#### 4.3.2 I-02: Both Release and Refund Available After Deadline

```
Location:handlerelease(line 243) andhandlerefund(line 312)
Description: Bothhandlereleaseandhandlerefunduse the same time-based unlock
condition:
```
1 // In handle_release:
2 let time_unlock = is_past_deadline(datum.deadline , validity_range)
3 let can_unlock = time_unlock || key_unlock
4
5 // In handle_refund:
6 let time_expired = is_past_deadline(datum.deadline , validity_range)
7 let can_refund = time_expired || authorized_refund

```
This means that after the deadline passes,bothactions become available to anyone:
```
```
Action After Deadline Funds Go To
Release Available (no signature needed) Beneficiary
Refund Available (no signature needed) Depositor
```
```
This creates a race condition where whoever submits a transaction first after the deadline
can choose whether funds go to the beneficiary or back to the depositor.
Question: Is this the intended behavior? Typical escrow patterns choose one:
```
- After deadline→auto-release to beneficiary (they fulfilled their obligation by waiting)
- After deadline→auto-refund to depositor (deal expired, funds return)

```
Recommendation: Clarify the intended behavior. If only one action should be available
after deadline, modify the logic accordingly. For example, to make refund require authorization
even after deadline:
```
1 // Only allow time -based unlock for Release , not Refund
2 let can_refund = authorized_refund // Remove: || time_expired

### 4.4 Optimization Recommendations

```
The following optimizations are recommended to reduce execution unit consumption and prevent
potential transaction failures with complex multi-asset values or large authorized key lists.
Note: The code examples below illustrate the recommended approach. Implementations
should be tested and adapted to the specific codebase.
```
#### 4.4.1 O-01: Multiple Output List Iterations

```
Location: handlerelease(lines 264–287),handlerefund(lines 322–326),handlecancel
(lines 352–356)
Description: Thehandlereleasefunction iterates over the outputs list up to 4 times:
```
1. findoutputtopkhwithvaluefor beneficiary payment
2. findoutputtopkhwithvaluefor fee recipient payment
3. list.anyto check for continuing outputs
4. Internal iterations within eachfindoutputtopkhwithvaluecall


With a transaction containing 10 outputs, this results in approximately 30–40 output com-
parisons instead of the optimal 10.
Impact: Increased CPU and memory execution units. Could cause transaction failures
with many outputs or complex multi-asset values.
Recommendation: Combine all output checks into a single pass usinglist.foldl:
1 fn validate_outputs_single_pass(
2 outputs: List <Output >,
3 beneficiary: VerificationKeyHash ,
4 beneficiary_value: Value ,
5 fee_recipient: Option <VerificationKeyHash >,
6 fee_value: Value ,
7 script_address: Address ,
8 ) -> (Bool , Bool , Bool) {
9 list.foldl(
10 outputs ,
11 (False , False , True), // (found_beneficiary , found_fee , no_continuing)
12 fn(out , acc) {
13 let (found_b , found_f , no_cont) = acc
14 let is_continuing = out.address == script_address
15 let matches_beneficiary = /* check beneficiary */
16 let matches_fee = /* check fee recipient if present */
17 (found_b || matches_beneficiary ,
18 found_f || matches_fee ,
19 no_cont && !is_continuing)
20 },
21 )
22 }

#### 4.4.2 O-02: Quadratic Signature Checking Complexity

Location:checkrequiredsignatures(lines 221–231)
Description: The current implementation hasO(n×m) complexity wherenis the number
of authorized keys andmis the number of transaction signatories:
1 let valid_signatures =
2 list.filter(authorized_keys , fn(key) { list.has(signatories , key) })
3 // ^^^^^^^^^^^^^^^^^^^^^^^^^^^
4 // O(m) for each of n keys
5 let signature_count = list.length(valid_signatures)
Additionally,list.lengthiterates the filtered list again, adding anotherO(n) pass.
With 5 authorized keys and 5 signatories, this performs up to 30 operations (25 comparisons
+ 5 length count).
Impact: Execution units scale quadratically with key count. Large multi-sig setups (e.g.,
10 keys) could consume significant resources.
Recommendation: Implement early-exit counting that stops once the threshold is reached:
1 fn check_required_signatures_optimized(
2 signatories: List <VerificationKeyHash >,
3 authorized_keys: List <VerificationKeyHash >,
4 required_count: Int ,
5 ) -> Bool {
6 count_until_threshold(authorized_keys , signatories , 0, required_count)
7 }
8
9 fn count_until_threshold(keys , sigs , count , required) -> Bool {
10 if count >= required {
11 True // Early exit - threshold already met!
12 } else {
13 when keys is {


14 [] -> False // Exhausted keys without meeting threshold
15 [key , ..rest] -> {
16 let new_count = if list.has(sigs , key) { count + 1 } else { count }
17 count_until_threshold(rest , sigs , new_count , required)
18 }
19 }
20 }
21 }

```
This optimization provides:
```
- Best case:O(required×m) when firstrequiredkeys are signers
- Avoids separatelist.lengthcall
- No intermediate list allocation fromlist.filter

## 5 Proof of Concept Demonstrations

```
The following tests were developed during the audit to verify the existence of the vulnerabil-
ities described in Section 4. These tests are included in the contract’s test suite andpass,
demonstrating that the vulnerabilities are exploitable.
Note: Code snippets below are abbreviated for readability. Full implementations are avail-
able in the test suite.
```
### 5.1 M-01: Double Satisfaction Proof of Concept

This test proves that two validator executions can be satisfied by a single output, enabling fund
theft:
1 /// M-01: Double Satisfaction Vulnerability
2 ///
3 /// ATTACK SCENARIO:
4 /// - Two escrow UTxOs exist , each holding 10 ADA for the same beneficiary
5 /// - Attacker constructs transaction consuming BOTH escrows (20 ADA input)
6 /// - Attacker creates outputs: 10 ADA to beneficiary + 10 ADA to ATTACKER
7 /// - Ledger accepts: 20 ADA in = 20 ADA out (value conserved)
8 /// - But beneficiary should receive 20 ADA , not 10 ADA!
9 test test_vulnerability_double_satisfaction () {
10 let depositor1 = #"0101..."
11 let depositor2 = #"0202..."
12 let beneficiary = #"0303..."
13 let attacker = #"aa00 ..."
14 let auth_key = #"0404..."
15
16 let escrow_value = assets.from_lovelace (10 _000_000) // 10 ADA each
17 let datum1 = sample_datum(depositor1 , beneficiary , [auth_key], 1)
18 let datum2 = sample_datum(depositor2 , beneficiary , [auth_key], 1)
19
20 // ATTACK: 10 ADA to beneficiary + 10 ADA to attacker
21 let attack_outputs = [
22 sample_output(sample_address(beneficiary), escrow_value),
23 sample_output(sample_address(attacker), escrow_value), // Stolen!
24 ]
25
26 // Both validators pass for the SAME beneficiary output
27 let validator1_passes = handle_release(datum1 , attack_outputs , ...)
28 let validator2_passes = handle_release(datum2 , attack_outputs , ...)
29
30 // TEST PASSES: Proving the vulnerability exists
31 validator1_passes && validator2_passes
32 }


```
Test Result: PASS
Interpretation: Both validators approve the transaction even though only one output goes
to the beneficiary. The attacker’s output (10 ADA) is ignored by both validators—they only
check thatsomeoutput pays the beneficiary. This enables the attack described in Finding
M-01.
Trace Output(abbreviated):
```
```
handle_release called: beneficiary, 10000000 lovelace
searching for output: beneficiary, 10000000
output search result: True <-- First validator finds output
release checks: True, True, True, True
```
```
handle_release called: beneficiary, 10000000 lovelace
searching for output: beneficiary, 10000000
output search result: True <-- Second validator finds SAME output
release checks: True, True, True, True
```
### 5.2 M-01 Variant: Fee Bypass Proof of Concept

This test demonstrates a more realistic attack scenario where a freelancer (who is both the
beneficiary and an authorized signer) exploits double satisfaction to avoid paying platform fees:
1 /// M-01 Variant: Fee Bypass - Beneficiary avoids paying full fees
2 ///
3 /// SCENARIO: A platform takes 5% fee on escrow payments.
4 /// The freelancer (beneficiary) is authorized to release their own payments.
5 /// With two pending 10 ADA payments , they should receive 19 ADA (after 1 ADA
fees).
6 /// Using double satisfaction , they receive 19.5 ADA and pay only 0.5 ADA in
fees.
7 test test_vulnerability_double_satisfaction_fee_bypass () {
8 let client1 = #"0101..."
9 let client2 = #"0202..."
10 let freelancer = #"0303..." // Both beneficiary AND authorized key
11 let platform = #"0505..."
12
13 let escrow_value = assets.from_lovelace (10 _000_000) // 10 ADA each
14 let beneficiary_value = assets.from_lovelace (9 _500_000) // 9.5 ADA (after 5%
fee)
15 let fee_value = assets.from_lovelace (500 _000) // 0.5 ADA fee
16
17 let fee_config = FeeConfig {
18 fee_percentage: 500, // 5%
19 fee_recipient: Some(platform),
20 }
21
22 // Freelancer is authorized to release their own payments
23 let datum1 = EscrowDatum {
24 depositor: client1 , beneficiary: freelancer ,
25 authorized_keys: [freelancer], // Self -release enabled
26 fee_config ,
27 ...
28 }
29 let datum2 = EscrowDatum {
30 depositor: client2 , beneficiary: freelancer ,
31 authorized_keys: [freelancer],
32 fee_config ,
33 ...
34 }
35


36 // EXPLOIT: Pay fee only once , pocket the second fee
37 let exploit_outputs = [
38 sample_output(sample_address(freelancer), beneficiary_value), // 9.5 ADA
39 sample_output(sample_address(platform), fee_value), // 0.5 ADA
fee
40 sample_output(sample_address(freelancer), escrow_value), // 10 ADA (
stolen fee!)
41 ]
42
43 // Both validators pass
44 let v1 = handle_release(datum1 , exploit_outputs , [freelancer], ...)
45 let v2 = handle_release(datum2 , exploit_outputs , [freelancer], ...)
46
47 // TEST PASSES: Freelancer receives 19.5 ADA instead of 19 ADA
48 v1 && v
49 }

```
Test Result: PASS
Interpretation: The freelancer creates two pending payments from different clients. When
releasing both simultaneously, they craft a transaction where one “9.5 ADA + 0.5 ADA fee”
output satisfies both validators. The remaining 10 ADA goes directly to the freelancer, bypass-
ing the platform fee entirely. This demonstrates how insiders with authorization can exploit the
vulnerability for financial gain.
```
### 5.3 M-02: Duplicate Keys Bypass Proof of Concept

This test proves that duplicate keys inauthorizedkeyscan bypass multi-signature require-
ments:
1 /// M-02: Duplicate Keys Bypass Multi -Signature Requirements
2 test test_vulnerability_duplicate_keys_bypass_multisig () {
3 let depositor = #"0101..."
4 let beneficiary = #"0202..."
5 let single_key = #"0303..."
6
7 // VULNERABILITY: Same key repeated 3 times
8 let duplicate_authorized_keys = [single_key , single_key , single_key]
9
10 // Datum claims to require 3 signatures
11 let datum = EscrowDatum {
12 depositor , beneficiary ,
13 authorized_keys: duplicate_authorized_keys ,
14 required_signatures: 3, // Looks like 3-of -3 multi -sig
15 ...
16 }
17
18 // Only ONE signature provided
19 let signatories = [single_key]
20
21 // TEST PASSES: Single signature satisfies "3 required"
22 handle_release(datum , outputs , signatories , ...)
23 }

```
Test Result: PASS
Interpretation: The signature check function counts how manyauthorizedkeysappear
insignatories. With duplicates, the same key is counted multiple times. A single signature
satisfies the “3-of-3” requirement.
Trace Output(abbreviated):
handle_release called: beneficiary, 10000000 lovelace
signature check: 3, 3 <-- Counted 3 valid sigs from 1 actual signature!
release checks: True, True, True, True
```

### 5.4 Using These Tests After Remediation

After implementing fixes for these vulnerabilities, these tests should beinvertedto become
regression tests:
1 // AFTER FIX: This test should FAIL (at least one validator rejects)
2 test test_double_satisfaction_prevented () {
3 // ... same setup ...
4
5 // After fix , at least one validator should reject
6 let validator1_passes = handle_release(datum1 , attack_outputs , ...)
7 let validator2_passes = handle_release(datum2 , attack_outputs , ...)
8
9 // Now we expect this to be False (vulnerability fixed)
10 !( validator1_passes && validator2_passes)
11 }

## 6 Security Guarantees

```
The contract provides the following security guarantees:
```
### 6.1 Access Control

- Only properly authorized parties can trigger state transitions
- Signature verification uses Cardano’s native mechanism viaextrasignatories
- Multi-sig support with configurable threshold (with caveat per Finding M-02)
- Time-based unlock provides automatic release after deadline

### 6.2 Value Protection

- Exact value matching enforced for outputs
- No partial withdrawals allowed
- Fee distribution verified by checking correct outputs to beneficiary and fee recipient
- No value can remain at script address (continuing output prevention)

### 6.3 State Management

- Clean contract termination after any operation
- No state machine complexity reduces attack surface
- Proper input identification viaOutputReference

### 6.4 Time Handling

- Proper validity range checking for time-based operations
- Correct handling of inclusive/exclusive bounds
- Defense against unbounded validity ranges


## 7 Conclusion

The escrow-services smart contract implements a flexible escrow pattern with clear separation
between release, refund, and cancellation paths. The code includes trace statements for debug-
ging and a property-based test suite covering the main authorization scenarios.
The contract makes good use of Aiken’s type system and the Cardano UTXO model’s
deterministic execution. The design prioritizes flexibility with time-based and key-based unlock
conditions, configurable fees, and multi-signature support.

### 7.1 Risk Assessment

```
Severity Count
Critical None found
High None found
Medium 2 findings
Low 1 finding
Informational 2 findings
```
### 7.2 Overall Assessment

The contract is suitable for deployment with the following considerations:

1. Implement output tagging or document the double satisfaction limitation for scenarios
    involving multiple identical escrows (addresses Finding M-01)
2. Add deduplication tocheckrequiredsignaturesor require off-chain validation ofauthorizedkeys
    (addresses Finding M-02)
3. Expand test coverage for edge cases (addresses Finding L-01)

## A About the Auditor

This audit was performed by Rodrigo Molina, a Cardano developer with extensive experience
in the Cardano ecosystem including smart contract development and security review.

## B References

1. Vacuumlabs Auditing. “Cardano Vulnerabilities #1 — Double Satisfaction.” Medium,
    2023.https://medium.com/vacuumlabs/cardano-vulnerabilities-1-double-satis
    faction-f3ad8f1893bf
2. Aiken Language Documentation. aiken-lang.org, 2024. https://aiken-lang.org/lang
    uage-tour/functions
3. MLabs. “From Bugs to Breakthroughs: Auditing Cardano Smart Contracts.” 2024.
    https://www.mlabs.city/blog/from-bugs-to-breakthroughs-auditing-cardano-s
    mart-contracts



