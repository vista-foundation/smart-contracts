## Technical Security Review of

# Custodial Transfer Smart Contract

### Rodrigo Molina


         - December Cardano Developer
- 1 Executive Summary and Scope Contents
   - 1.1 Scope
   - 1.2 Methodology
- 2 Technical Analysis
   - 2.1 Contract Architecture
      - 2.1.1 Core Data Structures
      - 2.1.2 Validator Functions
   - 2.2 Design Philosophy
   - 2.3 Key Helper Functions
      - 2.3.1 Output Verification
      - 2.3.2 Handler Implementation Pattern
- 3 Security Analysis
   - 3.1 Common Cardano Vulnerabilities Assessment
      - 3.1.1 Double Satisfaction
      - 3.1.2 Datum Trust / UTxO Creation
      - 3.1.3 Input Identification
      - 3.1.4 Continuing Output Prevention
   - 3.2 Authorization Model Analysis
   - 3.3 Value Handling Analysis
- 4 Findings and Recommendations
   - 4.1 Medium Risk Findings
      - 4.1.1 M-01: Potential Double Satisfaction with Identical Custodial UTxOs
   - 4.2 Low Risk Findings
      - 4.2.1 L-01: No Timeout Mechanism
      - 4.2.2 L-02: Test Coverage Gaps
   - 4.3 Optimization Recommendations
      - 4.3.1 O-01: Multiple Output List Iterations
- 5 Proof of Concept Demonstrations
   - 5.1 M-01: Double Satisfaction Proof of Concept (Deliver)
   - 5.2 M-01: Double Satisfaction Also Affects Withdraw
   - 5.3 Using These Tests After Remediation
- 6 Security Guarantees
   - 6.1 Access Control
   - 6.2 Value Protection
   - 6.3 State Management
   - 6.4 Simplicity Benefits
- 7 Conclusion
   - 7.1 Risk Assessment
   - 7.2 Overall Assessment
- A About the Auditor
- B References


## 1 Executive Summary and Scope Contents

```
This report presents the findings of a security audit conducted on thecustodialtransfer
Aiken smart contract. The contract implements a three-party custodial escrow system for
secure asset transfers on the Cardano blockchain using Plutus V3, suitable for shipping and
logistics scenarios where a carrier holds assets until delivery confirmation.
The audit identified one medium-severity finding related to double satisfaction attacks, and
two low-severity findings concerning timeout mechanisms and test coverage.
```
### 1.1 Scope

```
The audit covers:
```
- Smart contract:custodialtransfer.ak
- Plutus version: V
- Aiken compiler: v1.1.
- Dependencies: aiken-lang/stdlib v2.2.0, aiken-lang/fuzz v2.1.1 (testing)
    Note: This audit is limited to on-chain validator logic. Off-chain transaction building code
was not in scope.

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
The custodial-transfer contract implements a three-party escrow model:
```
- Sender (Party A): Deposits assets into escrow
- Receiver (Party B): Intended recipient of assets upon delivery
- Custodian (Party C): Trusted third party who validates delivery

#### 2.1.1 Core Data Structures

1 pub type Datum {
2 sender: VerificationKeyHash , // Party A - deposits assets
3 receiver: VerificationKeyHash , // Party B - receives on delivery
4 custodian: VerificationKeyHash , // Party C - validates delivery
5 }
6
7 pub type Redeemer {
8 Withdraw // Sender reclaims before delivery
9 Deliver // Custodian confirms delivery to receiver
10 Return // Receiver or custodian returns to sender
11 }


#### 2.1.2 Validator Functions

```
The contract implements three straightforward operations:
```
1. Withdraw: Sender reclaims assets before delivery
    - Requires: Sender signature
    - Output: All value returned to sender
2. Deliver: Custodian confirms successful delivery
    - Requires: Custodian signature
    - Output: All value transferred to receiver
3. Return: Refuse delivery or cancel
    - Requires: Receiver OR custodian signature
    - Output: All value returned to sender

### 2.2 Design Philosophy

```
The contract intentionally avoids complexity:
```
- No time-based conditions
- No fee mechanism
- No multi-signature requirements
- Complete value transfer only (no partial)
- Single-step termination (no continuing state)

```
This design reduces the attack surface compared to more feature-rich escrow contracts.
```
### 2.3 Key Helper Functions

#### 2.3.1 Output Verification

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


#### 2.3.2 Handler Implementation Pattern

Each handler follows the same pattern:
1 fn handle_withdraw(datum , outputs , signatories , own_address , own_value) -> Bool
{
2 // 1. Check authorization
3 let sender_signed = list.has(signatories , datum.sender)
4
5 // 2. Verify correct payment
6 let correct_payment =
7 find_output_to_pkh_with_value(outputs , datum.sender , own_value)
8
9 // 3. Ensure no continuing output
10 let no_continuing_output =
11 !list.any(outputs , fn(o) { o.address == own_address })
12
13 sender_signed && correct_payment && no_continuing_output
14 }

## 3 Security Analysis

### 3.1 Common Cardano Vulnerabilities Assessment

#### 3.1.1 Double Satisfaction

```
Like the escrow-services contract, this contract uses findoutputtopkhwithvaluewith
list.any(), making it susceptible to the same double satisfaction issue when multiple UTxOs
have identical parameters.
See Finding 4.1.1 for details.
```
#### 3.1.2 Datum Trust / UTxO Creation

```
The contract does not use state tokens. This is acceptable because:
```
- The sender creates the initial UTxO
- No multi-step state transitions
- Datum establishes contract terms at creation

#### 3.1.3 Input Identification

```
The contract properly identifies its own input:
1 expect Some(own_input) =
2 list.find(inputs , fn(i: Input) { i.output_reference == own_ref })
```
#### 3.1.4 Continuing Output Prevention

```
All three handlers verify no output goes back to the script:
1 let no_continuing_output =
2 !list.any(outputs , fn(o) { o.address == own_address })
```

### 3.2 Authorization Model Analysis

```
Action Required Signer Recipient Use Case
Withdraw Sender Sender Cancel before delivery
Deliver Custodian Receiver Confirm delivery
Return Receiver OR Custodian Sender Refuse/return
```
```
Analysis:
```
- Withdraw: Only sender can reclaim—appropriate
- Deliver: Only custodian can confirm—appropriate for trusted custodian model
- Return: Either receiver or custodian can initiate—allows receiver to refuse delivery

### 3.3 Value Handling Analysis

The contract enforces complete value transfer:

- ownvalueis extracted from the input
- Output must matchownvalueexactly
- No partial transfers or fee deductions

This simplicity reduces the risk of value calculation errors that can occur with fee-based
designs.

## 4 Findings and Recommendations

### 4.1 Medium Risk Findings

#### 4.1.1 M-01: Potential Double Satisfaction with Identical Custodial UTxOs

Severity: Medium
Location:findoutputtopkhwithvalue(lines 80–100)
Description: Thefindoutputtopkhwithvaluefunction useslist.any() to check
ifany output matches the required recipient and value. If a transaction consumes multiple
custodial UTxOs with identical parameters, a single output could satisfy all validator executions.
Real-World Attack Scenario—Wholesale Shipment Delivery:
Consider a wholesale supplier shipping multiple identical orders to a retailer:

1. Supplier createsEscrow A: 1000 ADA for Shipment #1 (receiver = Retailer, custodian
    = ShippingCo)
2. Supplier createsEscrow B: 1000 ADA for Shipment #2 (receiver = Retailer, custodian
    = ShippingCo)
3. Supplier createsEscrow C: 1000 ADA for Shipment #3 (receiver = Retailer, custodian
    = ShippingCo)
4. ShippingCo (or a malicious actor with custodian keys) constructs delivery transaction:
    - Inputs: All three escrow UTxOs (3000 ADA total)
    - Outputs: 1000 ADA to Retailer + 2000 ADA to Attacker


5. Each validator executes with theDeliverredeemer:
    - Validator A: Custodian signed? Yes. 1000 ADA to Retailer exists? Yes→PASSES
    - Validator B: Custodian signed? Yes. 1000 ADA to Retailer exists?Same output→
       PASSES
    - Validator C: Custodian signed? Yes. 1000 ADA to Retailer exists?Same output→
       PASSES
6. Result: Retailer receives 1000 ADA instead of 3000 ADA. Attacker steals 2000 ADA.

```
Likelihood: Low to Moderate—while identical escrow parameters are common in logistics
scenarios, exploiting this vulnerability requires thecustodian to be malicious or compro-
mised. Since the custodian is specifically chosen as a trusted third party, this significantly
limits the attack surface. The vulnerability becomes relevant primarily in scenarios involving:
```
- A dishonest custodian colluding with an attacker
- Compromised custodian keys
- Custodian operational errors when batching deliveries

```
The same pattern applies toWithdraw(requires sender signature) andReturn (requires
receiver or custodian signature), meaning those actions can only be exploited by the respective
authorized parties.
Recommendation: Implement output tagging to ensure one-to-one correspondence:
```
1 // Include input reference in output datum for unique identification
2 fn find_tagged_output(outputs , own_ref , pkh , value) -> Bool {
3 let expected_tag = hash_output_reference(own_ref)
4 list.any(outputs , fn(out) {
5 out.datum == expected_tag &&
6 out.address.payment_credential == VerificationKey(pkh) &&
7 out.value == value
8 })
9 }

```
Alternatively, document this limitation and advise users to ensure unique values or use
separate transactions for each escrow.
```
### 4.2 Low Risk Findings

#### 4.2.1 L-01: No Timeout Mechanism

```
Severity: Low
Description: The contract has no time-based unlock mechanism. If all three parties
(sender, receiver, custodian) become unavailable or lose their keys, funds are permanently
locked.
Scenario: A custodian company goes bankrupt, losing access to their keys. Neither sender
nor receiver can release the funds.
Recommendation: For use cases where timeout protection is needed, consider:
```
- Adding an optionaltimeout: Option<Int>field to the datum
- Allowing sender to withdraw after timeout expires
- This would align with the escrow-services contract’s approach


#### 4.2.2 L-02: Test Coverage Gaps

```
Severity: Low
Description: While the contract includes property-based tests, certain edge cases could
benefit from additional coverage:
```
- Double satisfaction attack simulation
- Empty signatories list edge cases

```
Recommendation: Expand test suite to cover these scenarios.
```
### 4.3 Optimization Recommendations

```
Note: The code examples below illustrate the recommended approach. Implementations should
be tested and adapted to the specific codebase.
```
#### 4.3.1 O-01: Multiple Output List Iterations

```
Location:handlewithdraw(lines 122–127),handledeliver(lines 153–158),handlereturn
(lines 191–196)
Description: Each handler iterates over the outputs list twice:
```
1. findoutputtopkhwithvalueto find the payment output
2. list.anyto check for continuing outputs

1 // Iteration 1: Find correct payment
2 let correct_payment =
3 find_output_to_pkh_with_value(outputs , datum.receiver , own_value)
4
5 // Iteration 2: Check no continuing output
6 let no_continuing_output =
7 !list.any(outputs , fn(o) { o.address == own_address })
With a transaction containing 10 outputs, this performs 20 comparisons instead of 10.
Impact: Increased CPU and memory execution units. While less severe than in escrow-
services (no fee output to check), this still doubles the iteration cost.
Recommendation: Combine both checks into a single pass:
1 fn validate_outputs_single_pass(
2 outputs: List <Output >,
3 recipient: VerificationKeyHash ,
4 expected_value: Value ,
5 script_address: Address ,
6 ) -> (Bool , Bool) {
7 list.foldl(
8 outputs ,
9 (False , True), // (found_payment , no_continuing)
10 fn(out , acc) {
11 let (found , no_cont) = acc
12 let is_continuing = out.address == script_address
13 let matches_payment = check_output_matches(out , recipient , expected_value
)
14 (found || matches_payment , no_cont && !is_continuing)
15 },
16 )
17 }
18
19 // Usage in handler:
20 let (correct_payment , no_continuing_output) =
21 validate_outputs_single_pass(outputs , datum.receiver , own_value , own_address)


```
This halves the number of output iterations, reducing execution units proportionally.
```
## 5 Proof of Concept Demonstrations

```
The following tests were developed during the audit to verify the existence of the vulnerabil-
ities described in Section 4. These tests are included in the contract’s test suite andpass,
demonstrating that the vulnerabilities are exploitable.
Note: Code snippets below are abbreviated for readability. Full implementations are avail-
able in the test suite.
```
### 5.1 M-01: Double Satisfaction Proof of Concept (Deliver)

This test proves that multiple validator executions can be satisfied by a single output during
delivery, enabling fund theft in wholesale shipment scenarios:
1 /// M-01: Double Satisfaction Vulnerability
2 ///
3 /// ATTACK SCENARIO (Wholesale Shipment Delivery):
4 /// - Supplier creates 3 custodial escrows for Retailer , each 1000 ADA
5 /// - All have same receiver (Retailer) and same custodian (ShippingCo)
6 /// - Malicious transaction consumes all 3 UTxOs (3000 ADA input)
7 /// - Outputs: 1000 ADA to Retailer + 2000 ADA to ATTACKER
8 /// - Retailer should receive 3000 ADA , not 1000 ADA!
9 test test_vulnerability_double_satisfaction_deliver () {
10 let sender1 = #"0101..."
11 let sender2 = #"0202..."
12 let sender3 = #"0303..."
13 let receiver = #"0404..."
14 let custodian = #"0505..."
15 let attacker = #"aa00 ..."
16
17 let escrow_value = assets.from_lovelace (1 _000_000_000) // 1000 ADA each
18 let datum1 = sample_datum(sender1 , receiver , custodian)
19 let datum2 = sample_datum(sender2 , receiver , custodian)
20 let datum3 = sample_datum(sender3 , receiver , custodian)
21
22 // ATTACK: 1000 ADA to receiver + 2000 ADA to attacker
23 let stolen_value = assets.from_lovelace (2 _000_000_000) // 2000 ADA
24 let attack_outputs = [
25 sample_output(sample_address(receiver), escrow_value),
26 sample_output(sample_address(attacker), stolen_value), // Stolen!
27 ]
28
29 // All three validators pass for the SAME receiver output
30 let v1 = handle_deliver(datum1 , attack_outputs , [custodian], ...)
31 let v2 = handle_deliver(datum2 , attack_outputs , [custodian], ...)
32 let v3 = handle_deliver(datum3 , attack_outputs , [custodian], ...)
33
34 // TEST PASSES: Proving the vulnerability exists
35 v1 && v2 && v
36 }

```
Test Result: PASS
Interpretation: All three validators approve the transaction even though only one output
goes to the receiver. The attacker’s output (2000 ADA) is ignored by all validators—they only
check thatsomeoutput pays the receiver. This enables the wholesale shipment attack described
in Finding M-01.
Trace Output(abbreviated):
```
```
handle_deliver called: custodian, receiver, 1000000000 lovelace
```

```
searching for output: receiver, 1000000000
output search result: True <-- Validator 1 finds output
```
```
handle_deliver called: custodian, receiver, 1000000000 lovelace
searching for output: receiver, 1000000000
output search result: True <-- Validator 2 finds SAME output
```
```
handle_deliver called: custodian, receiver, 1000000000 lovelace
searching for output: receiver, 1000000000
output search result: True <-- Validator 3 finds SAME output
```
### 5.2 M-01: Double Satisfaction Also Affects Withdraw

The vulnerability also affects theWithdrawaction when a sender has multiple escrows:
1 /// Double Satisfaction affects Withdraw action too
2 test test_vulnerability_double_satisfaction_withdraw () {
3 let sender = #"0101..." // Same sender for both escrows
4 let receiver1 = #"0202..."
5 let receiver2 = #"0303..."
6 let custodian = #"0404..."
7 let attacker = #"aa00 ..."
8
9 let escrow_value = assets.from_lovelace (500 _000_000) // 500 ADA each
10 let datum1 = sample_datum(sender , receiver1 , custodian)
11 let datum2 = sample_datum(sender , receiver2 , custodian)
12
13 // ATTACK: 500 ADA to sender + 500 ADA to attacker
14 let attack_outputs = [
15 sample_output(sample_address(sender), escrow_value),
16 sample_output(sample_address(attacker), escrow_value), // Stolen!
17 ]
18
19 // Both validators pass for the same sender output
20 let v1 = handle_withdraw(datum1 , attack_outputs , [sender], ...)
21 let v2 = handle_withdraw(datum2 , attack_outputs , [sender], ...)
22
23 // Sender receives 500 ADA instead of 1000 ADA
24 v1 && v
25 }

```
Test Result: PASS
Interpretation: The same vulnerability applies to withdrawals. A sender with multiple
escrows attempting to withdraw could have funds stolen if an attacker constructs the transac-
tion.
```
### 5.3 Using These Tests After Remediation

After implementing fixes for this vulnerability, these tests should beinvertedto become re-
gression tests:
1 // AFTER FIX: At least one validator should reject
2 test test_double_satisfaction_prevented () {
3 // ... same setup ...
4 let v1 = handle_deliver(datum1 , attack_outputs , ...)
5 let v2 = handle_deliver(datum2 , attack_outputs , ...)
6 let v3 = handle_deliver(datum3 , attack_outputs , ...)
7
8 // Now we expect this to be False (vulnerability fixed)
9 !(v1 && v2 && v3)
10 }


## 6 Security Guarantees

The contract provides the following security guarantees:

### 6.1 Access Control

- Clear role separation: sender, receiver, custodian
- Each action restricted to specific authorized party
- Signature verification via Cardano’s nativeextrasignatories

### 6.2 Value Protection

- Complete value transfer enforced (exact matching)
- No partial withdrawals
- No value can remain at script address

### 6.3 State Management

- Clean termination after any operation
- No continuing outputs allowed
- Proper input identification viaOutputReference

### 6.4 Simplicity Benefits

- No complex fee calculations to audit
- No time-based logic edge cases
- Minimal attack surface
- Easy to understand and verify

## 7 Conclusion

The custodial-transfer smart contract implements a straightforward three-party escrow pattern.
The deliberate simplicity—no fees, no timeouts, no multi-sig—reduces the attack surface.
The code includes trace statements for debugging and a property-based test suite covering
the main scenarios.

### 7.1 Risk Assessment

```
Severity Count
Critical None found
High None found
Medium 1 finding
Low 2 findings
Informational None found
```

### 7.2 Overall Assessment

The contract is suitable for deployment with the following considerations:

1. Document the double satisfaction limitation and advise against creating multiple identical
    escrows, or implement output tagging (addresses Finding M-01)
2. Document the lack of timeout as a design choice and evaluate if it meets use case require-
    ments (addresses Finding L-01)
3. Expand test coverage for edge cases (addresses Finding L-02)

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



