use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/fuzz
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{Value}
use cardano/transaction.{Input, NoDatum, Output, OutputReference, Transaction}

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
    // Extract datum - fail if None
    expect Some(datum) = datum
    let inputs = transaction.inputs
    let outputs = transaction.outputs
    let extra_signatories = transaction.extra_signatories
    // Find own input
    expect Some(own_input) =
      list.find(inputs, fn(i: Input) { i.output_reference == own_ref })
    let own_address = own_input.output.address
    let own_value = own_input.output.value
    expect Script(_own_validator_hash) = own_address.payment_credential
    // Branch to handlers
    when redeemer is {
      Withdraw ->
        handle_withdraw(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
        )
      Deliver ->
        handle_deliver(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
        )
      Return ->
        handle_return(datum, outputs, extra_signatories, own_address, own_value)
    }
  }

  else(_) {
    fail
  }
}

// Find output to a specific pkh with exact value
fn find_output_to_pkh_with_value(
  outputs: List<Output>,
  pkh: VerificationKeyHash,
  expected_value: Value,
) -> Bool {
  list.any(
    outputs,
    fn(out: Output) {
      let addr = out.address
      expect VerificationKey(output_pkh) = addr.payment_credential
      output_pkh == pkh && out.value == expected_value
    },
  )
}

// Withdraw Handler
fn handle_withdraw(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
) -> Bool {
  // Pre: Signed by sender
  list.has(signatories, datum.sender) && // Post: Entire UTXO value paid to sender, no continuing output
  find_output_to_pkh_with_value(outputs, datum.sender, own_value) && !list.any(
    outputs,
    fn(o) { o.address == own_address },
  )
}

// Deliver Handler
fn handle_deliver(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
) -> Bool {
  // Pre: Signed by receiver and custodian
  list.has(signatories, datum.receiver) && list.has(
    signatories,
    datum.custodian,
  ) && // Post: Entire UTXO value paid to receiver, no continuing output (contract ends)
  find_output_to_pkh_with_value(outputs, datum.receiver, own_value) && !list.any(
    outputs,
    fn(o) { o.address == own_address },
  )
}

// Return Handler
fn handle_return(
  datum: Datum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
) -> Bool {
  // Pre: Signed by receiver
  list.has(signatories, datum.receiver) && // Post: Entire UTXO value paid to sender, no continuing output (contract ends)
  find_output_to_pkh_with_value(outputs, datum.sender, own_value) && !list.any(
    outputs,
    fn(o) { o.address == own_address },
  )
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

// Property-based tests using fuzz generators

// Test Case 1: Property test for successful delivery
test test_successful_delivery_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.receiver_pkh), own_value)]
  let signatories = [params.receiver_pkh, params.custodian_pkh]
  let own_address = sample_script_address()
  handle_deliver(datum, outputs, signatories, own_address, own_value)
}

// Test Case 2: Property test for withdrawal by sender
test test_withdrawal_by_sender_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.sender_pkh), own_value)]
  let signatories = [params.sender_pkh]
  let own_address = sample_script_address()
  handle_withdraw(datum, outputs, signatories, own_address, own_value)
}

// Test Case 3: Property test for return by receiver
test test_return_by_receiver_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.sender_pkh), own_value)]
  let signatories = [params.receiver_pkh]
  let own_address = sample_script_address()
  handle_return(datum, outputs, signatories, own_address, own_value)
}

// Test Case 4: Property test for delivery failure without custodian signature
test test_delivery_without_custodian_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.receiver_pkh), own_value)]
  let signatories = [params.receiver_pkh]
  // Missing custodian signature
  let own_address = sample_script_address()
  !handle_deliver(datum, outputs, signatories, own_address, own_value)
}

// Test Case 5: Property test for withdrawal failure without sender signature
test test_withdrawal_without_sender_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.sender_pkh), own_value)]
  let signatories = [params.receiver_pkh]
  // Wrong signatory
  let own_address = sample_script_address()
  !handle_withdraw(datum, outputs, signatories, own_address, own_value)
}

// Test Case 6: Property test for return failure without receiver signature
test test_return_without_receiver_fails_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(params.sender_pkh, params.receiver_pkh, params.custodian_pkh)
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.sender_pkh), own_value)]
  let signatories = [params.sender_pkh]
  // Wrong signatory
  let own_address = sample_script_address()
  !handle_return(datum, outputs, signatories, own_address, own_value)
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
      let outputs =
        [sample_output(sample_address(params.sender_pkh), wrong_value)]
      let signatories = [params.sender_pkh]
      let own_address = sample_script_address()
      !handle_withdraw(datum, outputs, signatories, own_address, own_value)
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
      let outputs =
        [sample_output(sample_address(params.receiver_pkh), own_value)]
      // Wrong recipient for withdrawal
      let signatories = [params.sender_pkh]
      let own_address = sample_script_address()
      !handle_withdraw(datum, outputs, signatories, own_address, own_value)
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
  let outputs =
    [
      sample_output(sample_address(params.sender_pkh), own_value),
      sample_output(own_address, assets.from_lovelace(2000000)),
    ]
  // Continuing output
  let signatories = [params.sender_pkh]
  !handle_withdraw(datum, outputs, signatories, own_address, own_value)
}

// Test Case 10: Property test for find_output_to_pkh_with_value helper
test test_find_output_to_pkh_with_value_property(
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
    find_output_to_pkh_with_value(outputs, params.target_pkh, target_value)
  // Should not find with wrong amount (unless amounts are the same)
  let found_wrong_amount =
    find_output_to_pkh_with_value(outputs, params.target_pkh, other_value)
  // Should not find with wrong PKH (unless PKHs are the same)
  let found_wrong_pkh =
    find_output_to_pkh_with_value(outputs, params.other_pkh, target_value)
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
  !handle_withdraw(datum, outputs, signatories, own_address, own_value)
}

test test_empty_signatories_fails() {
  let datum = sample_datum(#[0x01], #[0x02], #[0x03])
  let outputs =
    [sample_output(sample_address(#[0x01]), assets.from_lovelace(2000000))]
  let signatories = []
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  !handle_withdraw(datum, outputs, signatories, own_address, own_value)
}
