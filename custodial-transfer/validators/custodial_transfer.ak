use aiken/collection/list
use aiken/crypto.{VerificationKeyHash, blake2b_256}
use aiken/fuzz
use aiken/cbor
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{Value}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}

// Data Structures
pub type Datum {
  sender: VerificationKeyHash,
  receiver: VerificationKeyHash,
  custodian: VerificationKeyHash,
}

pub type Redeemer {
  Withdraw
  Deliver
  Return
}

// Main Validator
validator custodial_transfer {
  spend(
    datum: Option<Datum>,
    redeemer: Redeemer,
    own_ref: OutputReference,
    transaction: Transaction,
  ) {
    trace @"custodial_transfer validator called"
    // Extract datum - fail if None
    expect Some(datum) = datum
    trace @"datum extracted": datum
    let inputs = transaction.inputs
    let outputs = transaction.outputs
    let extra_signatories = transaction.extra_signatories
    trace @"transaction info": inputs, outputs, extra_signatories
    // Find own input
    expect Some(own_input) =
      list.find(inputs, fn(i: Input) { i.output_reference == own_ref })
    let own_address = own_input.output.address
    let own_value = own_input.output.value
    trace @"own_input found": own_address, own_value
    expect Script(_own_validator_hash) = own_address.payment_credential
    // Branch to handlers (passing own_ref for output tagging - M-01 fix)
    when redeemer is {
      Withdraw -> {
        trace @"handling Withdraw redeemer"
        handle_withdraw(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
          own_ref,
        )
      }
      Deliver -> {
        trace @"handling Deliver redeemer"
        handle_deliver(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
          own_ref,
        )
      }
      Return -> {
        trace @"handling Return redeemer"
        handle_return(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
          own_ref,
        )
      }
    }
  }

  else(_) {
    trace @"custodial_transfer validator called with non-spend purpose"
    fail
  }
}

// ============================================================================
// OUTPUT TAGGING HELPERS (M-01 Fix: Double Satisfaction Prevention)
// ============================================================================

/// Computes a unique hash from an OutputReference for output tagging.
/// This ensures each output can only satisfy one validator execution,
/// preventing double satisfaction attacks.
fn hash_output_reference(ref: OutputReference) -> ByteArray {
  // Serialize the OutputReference to CBOR bytes and hash with blake2b_256
  let serialized = cbor.serialise(ref)
  blake2b_256(serialized)
}

/// Validates outputs in a single pass for efficiency (O-01 optimization).
/// Checks both the tagged payment output and ensures no continuing output.
/// Returns (found_payment, no_continuing_output) tuple.
fn validate_outputs_single_pass(
  outputs: List<Output>,
  expected_tag: ByteArray,
  recipient: VerificationKeyHash,
  expected_value: Value,
  script_address: Address,
) -> (Bool, Bool) {
  trace @"validating outputs (single pass)": expected_tag, recipient, expected_value
  list.foldl(
    outputs,
    (False, True),
    fn(out, acc) {
      let (found, no_cont) = acc

      // Check if this is a continuing output to the script
      let is_continuing = out.address == script_address

      // Check if this is the expected tagged payment
      let is_tagged_payment =
        when out.datum is {
          InlineDatum(datum_data) -> {
            expect tag: ByteArray = datum_data
            let tag_matches = tag == expected_tag
            let pkh_matches =
              when out.address.payment_credential is {
                VerificationKey(output_pkh) -> output_pkh == recipient
                _ -> False
              }
            let value_matches = out.value == expected_value
            trace @"checking tagged output": tag_matches, pkh_matches, value_matches
            tag_matches && pkh_matches && value_matches
          }
          _ -> False
        }

      (found || is_tagged_payment, no_cont && !is_continuing)
    },
  )
}

// ============================================================================
// LEGACY VULNERABLE FUNCTION (kept for vulnerability demonstration tests)
// ============================================================================

/// VULNERABLE: This function uses list.any() which allows double satisfaction.
/// A single output can satisfy multiple validator executions when multiple
/// UTxOs with identical parameters are spent in one transaction.
/// DO NOT USE IN PRODUCTION - kept only for vulnerability tests.
fn find_output_to_pkh_with_value_VULNERABLE(
  outputs: List<Output>,
  pkh: VerificationKeyHash,
  expected_value: Value,
) -> Bool {
  trace @"VULNERABLE: searching for output (no tagging)": pkh, expected_value
  let result =
    list.any(
      outputs,
      fn(out: Output) {
        let addr = out.address
        expect VerificationKey(output_pkh) = addr.payment_credential
        let pkh_matches = output_pkh == pkh
        let value_matches = out.value == expected_value
        pkh_matches && value_matches
      },
    )
  trace @"output search result": result
  result
}

// Withdraw Handler (SECURE - uses output tagging)
fn handle_withdraw(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  own_ref: OutputReference,
) -> Bool {
  trace @"handle_withdraw called": datum.sender, own_value
  trace @"all signatories": signatories
  trace @"looking for sender": datum.sender

  // Pre: Signed by sender
  let sender_signed = list.has(signatories, datum.sender)
  trace @"sender signature check": sender_signed

  // Compute the expected output tag from input reference (M-01 fix)
  let expected_tag = hash_output_reference(own_ref)
  trace @"expected output tag": expected_tag

  // Post: Verify tagged output to sender and no continuing output (single pass)
  let (correct_payment, no_continuing_output) =
    validate_outputs_single_pass(
      outputs,
      expected_tag,
      datum.sender,
      own_value,
      own_address,
    )
  trace @"correct payment to sender": correct_payment
  trace @"no continuing output": no_continuing_output

  let result = sender_signed && correct_payment && no_continuing_output
  trace @"withdraw result": result
  result
}

// Withdraw Handler (VULNERABLE - for demonstration tests only)
fn handle_withdraw_VULNERABLE(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
) -> Bool {
  let sender_signed = list.has(signatories, datum.sender)
  let correct_payment =
    find_output_to_pkh_with_value_VULNERABLE(outputs, datum.sender, own_value)
  let no_continuing_output =
    !list.any(outputs, fn(o) { o.address == own_address })
  sender_signed && correct_payment && no_continuing_output
}

// Deliver Handler (SECURE - uses output tagging)
fn handle_deliver(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  own_ref: OutputReference,
) -> Bool {
  trace @"handle_deliver called": datum.custodian, datum.receiver, own_value
  trace @"all signatories": signatories
  trace @"looking for custodian": datum.custodian

  // Pre: Signed by custodian (Entity C confirms delivery)
  let custodian_signed = list.has(signatories, datum.custodian)
  trace @"custodian signature check": custodian_signed

  // Compute the expected output tag from input reference (M-01 fix)
  let expected_tag = hash_output_reference(own_ref)
  trace @"expected output tag": expected_tag

  // Post: Verify tagged output to receiver and no continuing output (single pass)
  let (correct_payment, no_continuing_output) =
    validate_outputs_single_pass(
      outputs,
      expected_tag,
      datum.receiver,
      own_value,
      own_address,
    )
  trace @"correct payment to receiver": correct_payment
  trace @"no continuing output": no_continuing_output

  let result = custodian_signed && correct_payment && no_continuing_output
  trace @"deliver result": result
  result
}

// Deliver Handler (VULNERABLE - for demonstration tests only)
fn handle_deliver_VULNERABLE(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
) -> Bool {
  let custodian_signed = list.has(signatories, datum.custodian)
  let correct_payment =
    find_output_to_pkh_with_value_VULNERABLE(outputs, datum.receiver, own_value)
  let no_continuing_output =
    !list.any(outputs, fn(o) { o.address == own_address })
  custodian_signed && correct_payment && no_continuing_output
}

// Return Handler (SECURE - uses output tagging)
fn handle_return(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  own_ref: OutputReference,
) -> Bool {
  trace @"handle_return called": datum.receiver, datum.custodian, datum.sender, own_value
  trace @"all signatories": signatories
  trace @"looking for receiver": datum.receiver
  trace @"looking for custodian": datum.custodian

  // Pre: Signed by receiver OR custodian (either can initiate return)
  let receiver_signed = list.has(signatories, datum.receiver)
  let custodian_signed = list.has(signatories, datum.custodian)
  trace @"receiver signature check": receiver_signed
  trace @"custodian signature check": custodian_signed

  // Compute the expected output tag from input reference (M-01 fix)
  let expected_tag = hash_output_reference(own_ref)
  trace @"expected output tag": expected_tag

  // Post: Verify tagged output to sender and no continuing output (single pass)
  let (correct_payment, no_continuing_output) =
    validate_outputs_single_pass(
      outputs,
      expected_tag,
      datum.sender,
      own_value,
      own_address,
    )
  trace @"correct payment to sender": correct_payment
  trace @"no continuing output": no_continuing_output

  let result =
    ( receiver_signed || custodian_signed ) && correct_payment && no_continuing_output
  trace @"return result": result
  result
}

// Return Handler (VULNERABLE - for demonstration tests only)
fn handle_return_VULNERABLE(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
) -> Bool {
  let receiver_signed = list.has(signatories, datum.receiver)
  let custodian_signed = list.has(signatories, datum.custodian)
  let correct_payment =
    find_output_to_pkh_with_value_VULNERABLE(outputs, datum.sender, own_value)
  let no_continuing_output =
    !list.any(outputs, fn(o) { o.address == own_address })
  ( receiver_signed || custodian_signed ) && correct_payment && no_continuing_output
}

// Test helper functions and fuzzers
type TestParams {
  sender_pkh: VerificationKeyHash,
  receiver_pkh: VerificationKeyHash,
  custodian_pkh: VerificationKeyHash,
  lovelace_amount: Int,
}

type TestParamsWithWrongAmount {
  sender_pkh: VerificationKeyHash,
  receiver_pkh: VerificationKeyHash,
  custodian_pkh: VerificationKeyHash,
  lovelace_amount: Int,
  wrong_amount: Int,
}

type TestParamsCompare {
  target_pkh: VerificationKeyHash,
  other_pkh: VerificationKeyHash,
  target_amount: Int,
  other_amount: Int,
}

fn sample_verification_key_hash() -> Fuzzer<VerificationKeyHash> {
  fuzz.bytearray_between(28, 28)
}

fn sample_lovelace_amount() -> Fuzzer<Int> {
  fuzz.int_between(1000000, 100000000)
  // 1 to 100 ADA
}

fn sample_test_params() -> Fuzzer<TestParams> {
  fuzz.map4(
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_lovelace_amount(),
    fn(sender, receiver, custodian, amount) {
      TestParams {
        sender_pkh: sender,
        receiver_pkh: receiver,
        custodian_pkh: custodian,
        lovelace_amount: amount,
      }
    },
  )
}

fn sample_test_params_with_wrong_amount() -> Fuzzer<TestParamsWithWrongAmount> {
  fuzz.map5(
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_lovelace_amount(),
    sample_lovelace_amount(),
    fn(sender, receiver, custodian, amount, wrong_amount) {
      TestParamsWithWrongAmount {
        sender_pkh: sender,
        receiver_pkh: receiver,
        custodian_pkh: custodian,
        lovelace_amount: amount,
        wrong_amount,
      }
    },
  )
}

fn sample_test_params_compare() -> Fuzzer<TestParamsCompare> {
  fuzz.map4(
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_lovelace_amount(),
    sample_lovelace_amount(),
    fn(target_pkh, other_pkh, target_amount, other_amount) {
      TestParamsCompare { target_pkh, other_pkh, target_amount, other_amount }
    },
  )
}

fn sample_datum(
  sender: VerificationKeyHash,
  receiver: VerificationKeyHash,
  custodian: VerificationKeyHash,
) -> Datum {
  Datum { sender, receiver, custodian }
}

fn sample_address(pkh: VerificationKeyHash) -> Address {
  Address { payment_credential: VerificationKey(pkh), stake_credential: None }
}

fn sample_script_address() -> Address {
  Address {
    payment_credential: Script(
      #[
        0x12,
        0x34,
        0x56,
        0x78,
        0x9a,
        0xbc,
        0xde,
        0xf0,
        0x12,
        0x34,
        0x56,
        0x78,
        0x9a,
        0xbc,
        0xde,
        0xf0,
        0x12,
        0x34,
        0x56,
        0x78,
        0x9a,
        0xbc,
        0xde,
        0xf0,
        0x12,
        0x34,
        0x56,
        0x78,
      ],
    ),
    stake_credential: None,
  }
}

fn sample_output(address: Address, value: Value) -> Output {
  Output { address, value, datum: NoDatum, reference_script: None }
}

/// Helper to create a tagged output with inline datum containing the tag
fn sample_tagged_output(address: Address, value: Value, tag: ByteArray) -> Output {
  Output { address, value, datum: InlineDatum(tag), reference_script: None }
}

/// Helper to create a sample OutputReference for testing
fn sample_output_reference(tx_hash: ByteArray, index: Int) -> OutputReference {
  OutputReference { transaction_id: tx_hash, output_index: index }
}

// Property-based tests using fuzz generators

// Test Case 1: Property test for successful delivery (with output tagging)
test test_successful_delivery_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.receiver_pkh), own_value, expected_tag)]
  let signatories = [params.custodian_pkh]
  handle_deliver(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 2: Property test for withdrawal by sender (with output tagging)
test test_withdrawal_by_sender_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.sender_pkh), own_value, expected_tag)]
  let signatories = [params.sender_pkh]
  handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 3: Property test for return by custodian (with output tagging)
test test_return_by_custodian_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.sender_pkh), own_value, expected_tag)]
  let signatories = [params.custodian_pkh]
  handle_return(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 3b: Property test for return by receiver (User B refuses)
test test_return_by_receiver_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.sender_pkh), own_value, expected_tag)]
  let signatories = [params.receiver_pkh]
  handle_return(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 4: Property test for delivery failure without custodian signature
test test_delivery_without_custodian_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.receiver_pkh), own_value, expected_tag)]
  let signatories = [params.receiver_pkh]
  // Wrong signatory - should be custodian, not receiver
  !handle_deliver(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 5: Property test for withdrawal failure without sender signature
test test_withdrawal_without_sender_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.sender_pkh), own_value, expected_tag)]
  let signatories = [params.receiver_pkh]
  // Wrong signatory
  !handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 6: Property test for return failure without receiver or custodian signature
test test_return_without_authorized_party_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(params.sender_pkh), own_value, expected_tag)]
  let signatories = [params.sender_pkh]
  // Wrong signatory (should be receiver or custodian, not sender)
  !handle_return(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 7: Property test for incorrect amount failure
test test_incorrect_amount_fails_property(
  params: TestParamsWithWrongAmount via sample_test_params_with_wrong_amount(),
) {
  when params.lovelace_amount != params.wrong_amount is {
    True -> {
      let datum =
        sample_datum(
          params.sender_pkh,
          params.receiver_pkh,
          params.custodian_pkh,
        )
      let own_value = assets.from_lovelace(params.lovelace_amount)
      let wrong_value = assets.from_lovelace(params.wrong_amount)
      let own_address = sample_script_address()
      let own_ref = sample_output_reference(#"aabbccdd", 0)
      let expected_tag = hash_output_reference(own_ref)
      let outputs =
        [sample_tagged_output(sample_address(params.sender_pkh), wrong_value, expected_tag)]
      let signatories = [params.sender_pkh]
      !handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
    }
    False -> True
  }
  // Skip test if amounts are the same
}

// Test Case 8: Property test for wrong recipient failure
test test_wrong_recipient_fails_property(
  params: TestParams via sample_test_params(),
) {
  when params.sender_pkh != params.receiver_pkh is {
    True -> {
      let datum =
        sample_datum(
          params.sender_pkh,
          params.receiver_pkh,
          params.custodian_pkh,
        )
      let own_value = assets.from_lovelace(params.lovelace_amount)
      let own_address = sample_script_address()
      let own_ref = sample_output_reference(#"aabbccdd", 0)
      let expected_tag = hash_output_reference(own_ref)
      let outputs =
        [sample_tagged_output(sample_address(params.receiver_pkh), own_value, expected_tag)]
      // Wrong recipient for withdrawal
      let signatories = [params.sender_pkh]
      !handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
    }
    False -> True
  }
  // Skip test if sender and receiver are the same
}

// Test Case 9: Property test for continuing output failure
test test_continuing_output_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [
      sample_tagged_output(sample_address(params.sender_pkh), own_value, expected_tag),
      sample_output(own_address, assets.from_lovelace(2000000)),
    ]
  // Continuing output
  let signatories = [params.sender_pkh]
  !handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
}

// Test Case 10: Property test for find_output_to_pkh_with_value_VULNERABLE helper
// (Tests the vulnerable function used in vulnerability demonstrations)
test test_find_output_to_pkh_with_value_vulnerable_property(
  params: TestParamsCompare via sample_test_params_compare(),
) {
  let target_value = assets.from_lovelace(params.target_amount)
  let other_value = assets.from_lovelace(params.other_amount)
  let outputs =
    [
      sample_output(sample_address(params.target_pkh), target_value),
      sample_output(sample_address(params.other_pkh), other_value),
    ]
  // Should find the target output with correct PKH and value
  let found_target =
    find_output_to_pkh_with_value_VULNERABLE(outputs, params.target_pkh, target_value)
  // Should not find with wrong amount (unless amounts are the same)
  let found_wrong_amount =
    find_output_to_pkh_with_value_VULNERABLE(outputs, params.target_pkh, other_value)
  // Should not find with wrong PKH (unless PKHs are the same)
  let found_wrong_pkh =
    find_output_to_pkh_with_value_VULNERABLE(outputs, params.other_pkh, target_value)
  found_target && (
    params.target_amount == params.other_amount || !found_wrong_amount
  ) && ( params.target_pkh == params.other_pkh || !found_wrong_pkh )
}

// Additional edge case tests
test test_empty_outputs_fails() {
  let datum = sample_datum(#[0x01], #[0x02], #[0x03])
  let outputs = []
  let signatories = [#[0x01]]
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  !handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
}

test test_empty_signatories_fails() {
  let datum = sample_datum(#[0x01], #[0x02], #[0x03])
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  let own_ref = sample_output_reference(#"aabbccdd", 0)
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(#[0x01]), own_value, expected_tag)]
  let signatories = []
  !handle_withdraw(datum, outputs, signatories, own_address, own_value, own_ref)
}

// ============================================================================
// M-01 VULNERABILITY DEMONSTRATION TESTS
// These tests prove the double satisfaction vulnerability exists in the
// VULNERABLE handlers. They should PASS, demonstrating the attack works.
// ============================================================================

/// M-01: Double Satisfaction Vulnerability - Deliver Attack
/// ATTACK SCENARIO (Wholesale Shipment Delivery):
/// - Supplier creates 3 custodial escrows for Retailer, each 1000 ADA
/// - All have same receiver (Retailer) and same custodian (ShippingCo)
/// - Malicious transaction consumes all 3 UTxOs (3000 ADA input)
/// - Outputs: 1000 ADA to Retailer + 2000 ADA to ATTACKER
/// - Retailer should receive 3000 ADA, but only gets 1000 ADA!
/// EXPECTED: PASS (proves vulnerability exists in VULNERABLE handlers)
test test_vulnerability_double_satisfaction_deliver() {
  let sender1 =
    #"0101010101010101010101010101010101010101010101010101010101"
  let sender2 =
    #"0202020202020202020202020202020202020202020202020202020202"
  let sender3 =
    #"0303030303030303030303030303030303030303030303030303030303"
  let receiver =
    #"0404040404040404040404040404040404040404040404040404040404"
  let custodian =
    #"0505050505050505050505050505050505050505050505050505050505"
  let attacker =
    #"aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00"

  let escrow_value = assets.from_lovelace(1_000_000_000)
  // 1000 ADA each
  let datum1 = sample_datum(sender1, receiver, custodian)
  let datum2 = sample_datum(sender2, receiver, custodian)
  let datum3 = sample_datum(sender3, receiver, custodian)

  // ATTACK: Only 1000 ADA to receiver, 2000 ADA stolen by attacker
  let stolen_value = assets.from_lovelace(2_000_000_000)
  let attack_outputs =
    [
      sample_output(sample_address(receiver), escrow_value),
      sample_output(sample_address(attacker), stolen_value),
    ]

  let own_address = sample_script_address()

  // All three VULNERABLE validators pass with the SAME output!
  let v1 =
    handle_deliver_VULNERABLE(
      datum1,
      attack_outputs,
      [custodian],
      own_address,
      escrow_value,
    )
  let v2 =
    handle_deliver_VULNERABLE(
      datum2,
      attack_outputs,
      [custodian],
      own_address,
      escrow_value,
    )
  let v3 =
    handle_deliver_VULNERABLE(
      datum3,
      attack_outputs,
      [custodian],
      own_address,
      escrow_value,
    )

  // TEST PASSES: Proving the vulnerability exists
  // All 3 validators approve even though only 1 output goes to receiver
  v1 && v2 && v3
}

/// M-01: Double Satisfaction Vulnerability - Withdraw Attack
/// Same sender with multiple escrows can be exploited
/// EXPECTED: PASS (proves vulnerability exists in VULNERABLE handlers)
test test_vulnerability_double_satisfaction_withdraw() {
  let sender =
    #"0101010101010101010101010101010101010101010101010101010101"
  let receiver1 =
    #"0202020202020202020202020202020202020202020202020202020202"
  let receiver2 =
    #"0303030303030303030303030303030303030303030303030303030303"
  let custodian =
    #"0404040404040404040404040404040404040404040404040404040404"
  let attacker =
    #"aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00"

  let escrow_value = assets.from_lovelace(500_000_000)
  // 500 ADA each
  let datum1 = sample_datum(sender, receiver1, custodian)
  let datum2 = sample_datum(sender, receiver2, custodian)

  // ATTACK: Only 500 ADA to sender, 500 ADA stolen
  let attack_outputs =
    [
      sample_output(sample_address(sender), escrow_value),
      sample_output(sample_address(attacker), escrow_value),
    ]

  let own_address = sample_script_address()

  // Both VULNERABLE validators pass with the same sender output
  let v1 =
    handle_withdraw_VULNERABLE(
      datum1,
      attack_outputs,
      [sender],
      own_address,
      escrow_value,
    )
  let v2 =
    handle_withdraw_VULNERABLE(
      datum2,
      attack_outputs,
      [sender],
      own_address,
      escrow_value,
    )

  // Sender receives 500 ADA instead of 1000 ADA
  v1 && v2
}

// ============================================================================
// M-01 REGRESSION TESTS (Fix Verification)
// These tests verify that the SECURE handlers prevent the double satisfaction
// attack. They should PASS, demonstrating the fix works.
// ============================================================================

/// Regression test: Double satisfaction attack PREVENTED on deliver
/// With output tagging, each validator requires its own unique tagged output
/// EXPECTED: PASS (attack is prevented - only v1 passes, v2 and v3 fail)
test test_double_satisfaction_prevented_deliver() {
  let sender1 =
    #"0101010101010101010101010101010101010101010101010101010101"
  let sender2 =
    #"0202020202020202020202020202020202020202020202020202020202"
  let sender3 =
    #"0303030303030303030303030303030303030303030303030303030303"
  let receiver =
    #"0404040404040404040404040404040404040404040404040404040404"
  let custodian =
    #"0505050505050505050505050505050505050505050505050505050505"
  let attacker =
    #"aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00"

  let escrow_value = assets.from_lovelace(1_000_000_000)
  let datum1 = sample_datum(sender1, receiver, custodian)
  let datum2 = sample_datum(sender2, receiver, custodian)
  let datum3 = sample_datum(sender3, receiver, custodian)

  // Create unique output references for each input
  let ref1 = sample_output_reference(#"0001000100010001000100010001000100010001000100010001000100010001", 0)
  let ref2 = sample_output_reference(#"0002000200020002000200020002000200020002000200020002000200020002", 0)
  let ref3 = sample_output_reference(#"0003000300030003000300030003000300030003000300030003000300030003", 0)

  // Compute expected tags
  let tag1 = hash_output_reference(ref1)

  // ATTACK: Only provide output with tag1, try to satisfy all validators
  let stolen_value = assets.from_lovelace(2_000_000_000)
  let attack_outputs =
    [
      sample_tagged_output(sample_address(receiver), escrow_value, tag1),
      sample_output(sample_address(attacker), stolen_value),
    ]

  let own_address = sample_script_address()

  // Only validator 1 should pass; validators 2 and 3 should FAIL
  // because they expect different tags (tag2 and tag3)
  let v1 =
    handle_deliver(
      datum1,
      attack_outputs,
      [custodian],
      own_address,
      escrow_value,
      ref1,
    )
  let v2 =
    handle_deliver(
      datum2,
      attack_outputs,
      [custodian],
      own_address,
      escrow_value,
      ref2,
    )
  let v3 =
    handle_deliver(
      datum3,
      attack_outputs,
      [custodian],
      own_address,
      escrow_value,
      ref3,
    )

  // Attack prevented: v1 passes (has matching tag), v2 and v3 fail (wrong tags)
  v1 && !v2 && !v3
}

/// Regression test: Correct multi-escrow transaction WITH proper tags
/// When each output has the correct tag, all validators pass
/// EXPECTED: PASS (legitimate transaction succeeds)
test test_correct_multi_escrow_with_tags() {
  let sender1 =
    #"0101010101010101010101010101010101010101010101010101010101"
  let sender2 =
    #"0202020202020202020202020202020202020202020202020202020202"
  let receiver =
    #"0404040404040404040404040404040404040404040404040404040404"
  let custodian =
    #"0505050505050505050505050505050505050505050505050505050505"

  let escrow_value = assets.from_lovelace(1_000_000_000)
  let datum1 = sample_datum(sender1, receiver, custodian)
  let datum2 = sample_datum(sender2, receiver, custodian)

  let ref1 = sample_output_reference(#"0001000100010001000100010001000100010001000100010001000100010001", 0)
  let ref2 = sample_output_reference(#"0002000200020002000200020002000200020002000200020002000200020002", 0)

  let tag1 = hash_output_reference(ref1)
  let tag2 = hash_output_reference(ref2)

  // CORRECT: Each output has its own unique tag
  let correct_outputs =
    [
      sample_tagged_output(sample_address(receiver), escrow_value, tag1),
      sample_tagged_output(sample_address(receiver), escrow_value, tag2),
    ]

  let own_address = sample_script_address()

  // Both validators should pass with correct unique tags
  let v1 =
    handle_deliver(
      datum1,
      correct_outputs,
      [custodian],
      own_address,
      escrow_value,
      ref1,
    )
  let v2 =
    handle_deliver(
      datum2,
      correct_outputs,
      [custodian],
      own_address,
      escrow_value,
      ref2,
    )

  v1 && v2
}

/// Test that output without tag fails validation
/// EXPECTED: PASS (untagged output is rejected)
test test_untagged_output_fails() {
  let sender =
    #"0101010101010101010101010101010101010101010101010101010101"
  let receiver =
    #"0202020202020202020202020202020202020202020202020202020202"
  let custodian =
    #"0303030303030303030303030303030303030303030303030303030303"

  let escrow_value = assets.from_lovelace(1_000_000_000)
  let datum = sample_datum(sender, receiver, custodian)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)

  // Output without tag (using NoDatum)
  let outputs = [sample_output(sample_address(receiver), escrow_value)]

  // Should fail because output lacks the required tag
  !handle_deliver(datum, outputs, [custodian], own_address, escrow_value, own_ref)
}

/// Test that output with wrong tag fails validation
/// EXPECTED: PASS (wrong tag is rejected)
test test_wrong_tag_fails() {
  let sender =
    #"0101010101010101010101010101010101010101010101010101010101"
  let receiver =
    #"0202020202020202020202020202020202020202020202020202020202"
  let custodian =
    #"0303030303030303030303030303030303030303030303030303030303"

  let escrow_value = assets.from_lovelace(1_000_000_000)
  let datum = sample_datum(sender, receiver, custodian)
  let own_address = sample_script_address()
  let own_ref = sample_output_reference(#"aabbccdd", 0)

  // Create a different output reference to get a different tag
  let wrong_ref = sample_output_reference(#"deadbeef", 1)
  let wrong_tag = hash_output_reference(wrong_ref)

  // Output with wrong tag
  let outputs =
    [sample_tagged_output(sample_address(receiver), escrow_value, wrong_tag)]

  // Should fail because tag doesn't match
  !handle_deliver(datum, outputs, [custodian], own_address, escrow_value, own_ref)
}
