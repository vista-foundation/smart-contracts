use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/fuzz
use aiken/interval
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{Value}
use cardano/transaction.{Input, NoDatum, Output, OutputReference, Transaction}

// Data Structures
pub type EscrowDatum {
  // Core parties
  depositor: VerificationKeyHash,
  beneficiary: VerificationKeyHash,
  // Time constraints (grant requirement)
  deadline: Option<Int>,
  // POSIX timestamp for auto-release
  // Key-based conditions (grant requirement)
  required_signatures: Int,
  // 1 or 2 for simple multi-sig
  authorized_keys: List<VerificationKeyHash>,
  // Fee configuration (configurable, can be 0)
  fee_config: FeeConfig,
}

pub type FeeConfig {
  fee_percentage: Int,
  // Basis points (0-10000, where 100 = 1%)
  fee_recipient: Option<VerificationKeyHash>,
}

// None = no fees

pub type EscrowRedeemer {
  // Core operations (grant requirements)
  Release
  // Release to beneficiary (key-based or time-based)
  Refund
  // Refund to depositor (key-based or time-expired)
  Cancel
}

// Cancel by depositor before deadline

// Main Validator
validator escrow_services {
  spend(
    datum: Option<EscrowDatum>,
    redeemer: EscrowRedeemer,
    own_ref: OutputReference,
    tx: Transaction,
  ) {
    trace @"escrow_services validator called"
    // Extract datum - fail if None
    expect Some(datum) = datum
    trace @"datum extracted": datum
    let inputs = tx.inputs
    let outputs = tx.outputs
    let extra_signatories = tx.extra_signatories
    let validity_range = tx.validity_range
    trace @"transaction info": inputs, outputs, extra_signatories
    // Find own input
    expect Some(own_input) =
      list.find(inputs, fn(i: Input) { i.output_reference == own_ref })
    let own_address = own_input.output.address
    let own_value = own_input.output.value
    trace @"own_input found": own_address, own_value
    expect Script(_own_validator_hash) = own_address.payment_credential
    // Route to appropriate handler
    when redeemer is {
      Release -> {
        trace @"handling Release redeemer"
        handle_release(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
          validity_range,
        )
      }
      Refund -> {
        trace @"handling Refund redeemer"
        handle_refund(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
          validity_range,
        )
      }
      Cancel -> {
        trace @"handling Cancel redeemer"
        handle_cancel(
          datum,
          outputs,
          extra_signatories,
          own_address,
          own_value,
          validity_range,
        )
      }
    }
  }

  else(_) {
    trace @"escrow_services validator called with non-spend purpose"
    fail
  }
}

// Helper function to find output to a specific pkh with exact value
fn find_output_to_pkh_with_value(
  outputs: List<Output>,
  pkh: VerificationKeyHash,
  expected_value: Value,
) -> Bool {
  trace @"searching for output": pkh, expected_value
  let result =
    list.any(
      outputs,
      fn(out: Output) {
        let addr = out.address
        expect VerificationKey(output_pkh) = addr.payment_credential
        let pkh_matches = output_pkh == pkh
        let value_matches = out.value == expected_value
        trace @"checking output": output_pkh, out.value, pkh_matches, value_matches
        pkh_matches && value_matches
      },
    )
  trace @"output search result": result
  result
}

fn compute_release_distribution(
  value: Value,
  fee_config: FeeConfig,
) -> Option<(Value, Value)> {
  let fee_percentage = fee_config.fee_percentage
  if fee_percentage < 0 || fee_percentage > 10000 {
    trace @"invalid fee percentage": fee_percentage
    None
  } else {
    let lovelace_amount = assets.lovelace_of(value)
    if lovelace_amount < 0 {
      trace @"negative lovelace in escrow": lovelace_amount
      None
    } else {
      let fee_amount = lovelace_amount * fee_percentage / 10000
      let beneficiary_lovelace = lovelace_amount - fee_amount
      if beneficiary_lovelace < 0 {
        trace @"fee exceeds available lovelace": fee_amount, lovelace_amount
        None
      } else {
        let tokens = assets.without_lovelace(value)
        let beneficiary_value =
          assets.merge(tokens, assets.from_lovelace(beneficiary_lovelace))
        let fee_value = assets.from_lovelace(fee_amount)
        Some((beneficiary_value, fee_value))
      }
    }
  }
}

fn lower_bound_on_or_after(
  validity_range: transaction.ValidityRange,
  point: Int,
) -> Bool {
  let lower = validity_range.lower_bound
  when lower.bound_type is {
    interval.NegativeInfinity -> False
    interval.PositiveInfinity -> False
    interval.Finite(value) ->
      if lower.is_inclusive {
        value >= point
      } else {
        value > point
      }
  }
}

fn upper_bound_before(
  validity_range: transaction.ValidityRange,
  point: Int,
) -> Bool {
  let upper = validity_range.upper_bound
  when upper.bound_type is {
    interval.NegativeInfinity -> True
    interval.PositiveInfinity -> False
    interval.Finite(value) ->
      if upper.is_inclusive {
        value < point
      } else {
        value <= point
      }
  }
}

fn is_past_deadline(
  deadline: Option<Int>,
  validity_range: transaction.ValidityRange,
) -> Bool {
  when deadline is {
    None -> False
    Some(deadline_time) -> lower_bound_on_or_after(validity_range, deadline_time)
  }
}

fn is_before_deadline(
  deadline: Option<Int>,
  validity_range: transaction.ValidityRange,
) -> Bool {
  when deadline is {
    None -> True
    Some(deadline_time) -> upper_bound_before(validity_range, deadline_time)
  }
}

// Helper function to check required signatures
fn check_required_signatures(
  signatories: List<VerificationKeyHash>,
  authorized_keys: List<VerificationKeyHash>,
  required_count: Int,
) -> Bool {
  let valid_signatures =
    list.filter(authorized_keys, fn(key) { list.has(signatories, key) })
  let signature_count = list.length(valid_signatures)
  trace @"signature check": signature_count, required_count
  signature_count >= required_count
}

// Release Handler - Release funds to beneficiary
fn handle_release(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
) -> Bool {
  trace @"handle_release called": datum.beneficiary, own_value
  // Check unlock conditions
  let time_unlock = is_past_deadline(datum.deadline, validity_range)
  let key_unlock =
    check_required_signatures(
      signatories,
      datum.authorized_keys,
      datum.required_signatures,
    )
  trace @"unlock conditions": time_unlock, key_unlock
  // Must satisfy either time-based or key-based unlock
  let can_unlock = time_unlock || key_unlock
  if !can_unlock {
    trace @"unlock conditions not met"
    False
  } else {
    when compute_release_distribution(own_value, datum.fee_config) is {
      None -> {
        trace @"distribution calculation failed"
        False
      }
      Some((beneficiary_value, fee_value)) -> {
        let correct_beneficiary_payment =
          find_output_to_pkh_with_value(
            outputs,
            datum.beneficiary,
            beneficiary_value,
          )
        let fee_amount = assets.lovelace_of(fee_value)
        let fee_required = fee_amount > 0
        let correct_fee_payment =
          when (datum.fee_config.fee_recipient, fee_required) is {
            (None, True) -> {
              trace @"fee recipient required but missing": fee_amount
              False
            }
            (None, False) -> True
            (Some(fee_recipient), _) ->
              find_output_to_pkh_with_value(outputs, fee_recipient, fee_value)
          }
        let expected_total = assets.merge(beneficiary_value, fee_value)
        let value_conserved =
          assets.merge(own_value, assets.negate(expected_total))
            |> assets.is_zero
        let no_continuing_output =
          !list.any(outputs, fn(o) { o.address == own_address })
        trace @"release checks":
          correct_beneficiary_payment,
          correct_fee_payment,
          no_continuing_output,
          value_conserved
        correct_beneficiary_payment
          && correct_fee_payment
          && no_continuing_output
          && value_conserved
      }
    }
  }
}

// Refund Handler - Refund to depositor (time expired or authorized)
fn handle_refund(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
) -> Bool {
  trace @"handle_refund called": datum.depositor, own_value
  // Check refund conditions
  let time_expired = is_past_deadline(datum.deadline, validity_range)
  let authorized_refund =
    check_required_signatures(
      signatories,
      datum.authorized_keys,
      datum.required_signatures,
    )
  trace @"refund conditions": time_expired, authorized_refund
  // Can refund if time expired OR authorized parties agree
  let can_refund = time_expired || authorized_refund
  if !can_refund {
    trace @"refund conditions not met"
    False
  } else {
    // For refunds, we typically don't charge fees (policy decision)
    // All value goes back to depositor
    let correct_refund_payment =
      find_output_to_pkh_with_value(outputs, datum.depositor, own_value)
    // Ensure no continuing output
    let no_continuing_output =
      !list.any(outputs, fn(o) { o.address == own_address })
    trace @"refund checks": correct_refund_payment, no_continuing_output
    correct_refund_payment && no_continuing_output
  }
}

// Cancel Handler - Cancel by depositor before deadline
fn handle_cancel(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
) -> Bool {
  trace @"handle_cancel called": datum.depositor, own_value
  // Only depositor can cancel
  let depositor_signed = list.has(signatories, datum.depositor)
  // Can only cancel before deadline (if deadline exists)
  let before_deadline = is_before_deadline(datum.deadline, validity_range)
  trace @"cancel conditions": depositor_signed, before_deadline
  if !depositor_signed || !before_deadline {
    trace @"cancel conditions not met"
    False
  } else {
    // Return all value to depositor (no fees on cancellation)
    let correct_cancel_payment =
      find_output_to_pkh_with_value(outputs, datum.depositor, own_value)
    // Ensure no continuing output
    let no_continuing_output =
      !list.any(outputs, fn(o) { o.address == own_address })
    trace @"cancel checks": correct_cancel_payment, no_continuing_output
    correct_cancel_payment && no_continuing_output
  }
}

// Test helper functions and types
type TestParams {
  depositor_pkh: VerificationKeyHash,
  beneficiary_pkh: VerificationKeyHash,
  authorized_key1: VerificationKeyHash,
  authorized_key2: VerificationKeyHash,
  lovelace_amount: Int,
}

fn sample_verification_key_hash() -> Fuzzer<VerificationKeyHash> {
  fuzz.bytearray_between(28, 28)
}

fn sample_lovelace_amount() -> Fuzzer<Int> {
  fuzz.int_between(1000000, 100000000)
  // 1 to 100 ADA
}

fn sample_test_params() -> Fuzzer<TestParams> {
  fuzz.map5(
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_verification_key_hash(),
    sample_lovelace_amount(),
    fn(depositor, beneficiary, auth1, auth2, amount) {
      TestParams {
        depositor_pkh: depositor,
        beneficiary_pkh: beneficiary,
        authorized_key1: auth1,
        authorized_key2: auth2,
        lovelace_amount: amount,
      }
    },
  )
}

fn sample_datum(
  depositor: VerificationKeyHash,
  beneficiary: VerificationKeyHash,
  authorized_keys: List<VerificationKeyHash>,
  required_sigs: Int,
) -> EscrowDatum {
  EscrowDatum {
    depositor,
    beneficiary,
    deadline: Some(1640995200),
    // Example timestamp
    required_signatures: required_sigs,
    authorized_keys,
    fee_config: FeeConfig { fee_percentage: 0, fee_recipient: None },
  }
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

// Property-based tests

// Test Case 1: Successful release with key-based unlock
test test_key_based_release_property(
  params: TestParams via sample_test_params(),
) {
  let datum =
    sample_datum(
      params.depositor_pkh,
      params.beneficiary_pkh,
      [params.authorized_key1, params.authorized_key2],
      1,
    )
  // Require 1 signature
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs =
    [sample_output(sample_address(params.beneficiary_pkh), own_value)]
  let signatories = [params.authorized_key1]
  // One authorized signature
  let own_address = sample_script_address()
  let validity_range = interval.everything
  // Simplified for testing
  handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}

// Test Case 2: Successful refund by depositor
test test_depositor_refund_property(params: TestParams via sample_test_params()) {
  let datum =
    sample_datum(
      params.depositor_pkh,
      params.beneficiary_pkh,
      [params.depositor_pkh, params.authorized_key1],
      1,
    )
  // Require 1 signature
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.depositor_pkh), own_value)]
  let signatories = [params.depositor_pkh]
  // Depositor signature
  let own_address = sample_script_address()
  let validity_range = interval.everything
  // Simplified for testing
  handle_refund(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}

// Test Case 3: Successful cancel by depositor
test test_depositor_cancel_property(params: TestParams via sample_test_params()) {
  // Ensure depositor is in authorized keys for this test
  let datum =
    sample_datum(
      params.depositor_pkh,
      params.beneficiary_pkh,
      [params.depositor_pkh, params.authorized_key1],
      // Include depositor in authorized keys
      1,
    )
  // Require 1 signature
  let own_value = assets.from_lovelace(params.lovelace_amount)
  let outputs = [sample_output(sample_address(params.depositor_pkh), own_value)]
  let signatories = [params.depositor_pkh]
  // Only depositor can cancel
  let own_address = sample_script_address()
  let validity_range = interval.entirely_before(0)
  // Simplified for testing
  handle_cancel(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}

// Test Case 4: Release fails without proper authorization
test test_unauthorized_release_fails_property(
  params: TestParams via sample_test_params(),
) {
  // Only run test if we have distinct keys
  when params.authorized_key1 != params.authorized_key2 is {
    True -> {
      let datum =
        sample_datum(
          params.depositor_pkh,
          params.beneficiary_pkh,
          [params.authorized_key1, params.authorized_key2],
          2,
        )
      // Require 2 signatures
      let own_value = assets.from_lovelace(params.lovelace_amount)
      let outputs =
        [sample_output(sample_address(params.beneficiary_pkh), own_value)]
      let signatories = [params.authorized_key1]
      // Only 1 signature, need 2
      let own_address = sample_script_address()
      let validity_range = interval.everything
      // Simplified for testing
      !handle_release(
        datum,
        outputs,
        signatories,
        own_address,
        own_value,
        validity_range,
      )
    }
    False -> True
  }
  // Skip test if keys are identical
}

// Test Case 5: Cancel fails by non-depositor
test test_unauthorized_cancel_fails_property(
  params: TestParams via sample_test_params(),
) {
  when params.depositor_pkh != params.beneficiary_pkh is {
    True -> {
      let datum =
        sample_datum(
          params.depositor_pkh,
          params.beneficiary_pkh,
          [params.authorized_key1, params.authorized_key2],
          1,
        )
      let own_value = assets.from_lovelace(params.lovelace_amount)
      let outputs =
        [sample_output(sample_address(params.depositor_pkh), own_value)]
      let signatories = [params.beneficiary_pkh]
      // Wrong signer
      let own_address = sample_script_address()
      let validity_range = interval.everything
      !handle_cancel(
        datum,
        outputs,
        signatories,
        own_address,
        own_value,
        validity_range,
      )
    }
    False -> True
  }
  // Skip if depositor and beneficiary are the same
}

// Simple unit tests with fixed values
test test_simple_release_success() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let auth_key = #"03030303030303030303030303030303030303030303030303030303"
  let datum = sample_datum(depositor, beneficiary, [auth_key], 1)
  let own_value = assets.from_lovelace(2000000)
  let outputs = [sample_output(sample_address(beneficiary), own_value)]
  let signatories = [auth_key]
  let own_address = sample_script_address()
  let validity_range = interval.everything
  handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}

test test_simple_cancel_success() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let datum = sample_datum(depositor, beneficiary, [depositor], 1)
  let own_value = assets.from_lovelace(2000000)
  let outputs = [sample_output(sample_address(depositor), own_value)]
  let signatories = [depositor]
  let own_address = sample_script_address()
  let validity_range = interval.entirely_before(0)
  handle_cancel(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}

// Additional edge case tests
test test_empty_outputs_fails() {
  let datum = sample_datum(#[0x01], #[0x02], [#[0x03]], 1)
  let outputs = []
  let signatories = [#[0x03]]
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  let validity_range = interval.everything
  !handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}

test test_continuing_output_fails() {
  let datum = sample_datum(#[0x01], #[0x02], [#[0x03]], 1)
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  let outputs =
    [
      sample_output(sample_address(#[0x02]), own_value),
      sample_output(own_address, assets.from_lovelace(1000000)),
    ]
  // Continuing output
  let signatories = [#[0x03]]
  let validity_range = interval.everything
  !handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
  )
}
