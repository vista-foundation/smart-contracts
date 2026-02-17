use aiken/cbor
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash, blake2b_256}
use aiken/fuzz
use aiken/interval
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets.{Value}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}

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
    // Route to appropriate handler (M-01 Fix: pass own_ref for output tagging)
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
          own_ref,
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
          own_ref,
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
          own_ref,
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

// M-01 Fix: Hash output reference to create unique tag per input
fn hash_output_reference(ref: OutputReference) -> ByteArray {
  let serialized = cbor.serialise(ref)
  blake2b_256(serialized)
}

// M-01 Fix: Single-pass output validation with tagging (also implements O-01 optimization)
// Returns (found_tagged_payment, has_continuing_output)
fn validate_outputs_single_pass(
  outputs: List<Output>,
  expected_tag: ByteArray,
  recipient: VerificationKeyHash,
  expected_value: Value,
  script_address: Address,
) -> (Bool, Bool) {
  list.foldl(
    outputs,
    (False, False),
    fn(output, acc) {
      let (found_payment, has_continuing) = acc
      // Check for continuing output to script address
      let is_continuing = output.address == script_address
      // Check for tagged payment to recipient
      let is_tagged_payment =
        when output.address.payment_credential is {
          VerificationKey(pkh) ->
            if pkh == recipient && output.value == expected_value {
              // Verify the output tag matches our input reference hash
              when output.datum is {
                InlineDatum(datum_data) -> {
                  expect tag: ByteArray = datum_data
                  tag == expected_tag
                }
                _ -> False
              }
            } else {
              False
            }
          _ -> False
        }
      (found_payment || is_tagged_payment, has_continuing || is_continuing)
    },
  )
}

// Helper function to check required signatures
// M-02 Fix: Use list.unique() to prevent duplicate keys from inflating signature count
fn check_required_signatures(
  signatories: List<VerificationKeyHash>,
  authorized_keys: List<VerificationKeyHash>,
  required_count: Int,
) -> Bool {
  // Deduplicate authorized keys to prevent counting the same key multiple times
  let unique_authorized_keys = list.unique(authorized_keys)
  let valid_signatures =
    list.filter(unique_authorized_keys, fn(key) { list.has(signatories, key) })
  let signature_count = list.length(valid_signatures)
  trace @"signature check": signature_count, required_count
  signature_count >= required_count
}

// VULNERABLE version for testing (M-02) - demonstrates duplicate key bypass
fn check_required_signatures_vulnerable(
  signatories: List<VerificationKeyHash>,
  authorized_keys: List<VerificationKeyHash>,
  required_count: Int,
) -> Bool {
  let valid_signatures =
    list.filter(authorized_keys, fn(key) { list.has(signatories, key) })
  let signature_count = list.length(valid_signatures)
  signature_count >= required_count
}

// Release Handler - Release funds to beneficiary
// M-01 Fix: Added own_ref parameter for output tagging
fn handle_release(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
  own_ref: OutputReference,
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
        // M-01 Fix: Compute unique tag from input reference
        let expected_tag = hash_output_reference(own_ref)
        // M-01 Fix: Use single-pass validation with tagging
        let (correct_beneficiary_payment, has_continuing_output) =
          validate_outputs_single_pass(
            outputs,
            expected_tag,
            datum.beneficiary,
            beneficiary_value,
            own_address,
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
            (Some(fee_recipient), _) -> {
              // For fee outputs, we don't require tagging (fee recipient is same for all)
              find_output_to_pkh_with_value(outputs, fee_recipient, fee_value)
            }
          }
        let expected_total = assets.merge(beneficiary_value, fee_value)
        let value_conserved =
          assets.merge(own_value, assets.negate(expected_total))
            |> assets.is_zero
        trace @"release checks":
          correct_beneficiary_payment,
          correct_fee_payment,
          !has_continuing_output,
          value_conserved
        correct_beneficiary_payment && correct_fee_payment && !has_continuing_output && value_conserved
      }
    }
  }
}

// Refund Handler - Refund to depositor (time expired or authorized)
// M-01 Fix: Added own_ref parameter for output tagging
fn handle_refund(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
  own_ref: OutputReference,
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
    // M-01 Fix: Compute unique tag from input reference
    let expected_tag = hash_output_reference(own_ref)
    // M-01 Fix: Use single-pass validation with tagging
    let (correct_refund_payment, has_continuing_output) =
      validate_outputs_single_pass(
        outputs,
        expected_tag,
        datum.depositor,
        own_value,
        own_address,
      )
    trace @"refund checks": correct_refund_payment, !has_continuing_output
    correct_refund_payment && !has_continuing_output
  }
}

// Cancel Handler - Cancel by depositor before deadline
// M-01 Fix: Added own_ref parameter for output tagging
fn handle_cancel(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
  own_ref: OutputReference,
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
    // M-01 Fix: Compute unique tag from input reference
    let expected_tag = hash_output_reference(own_ref)
    // M-01 Fix: Use single-pass validation with tagging
    let (correct_cancel_payment, has_continuing_output) =
      validate_outputs_single_pass(
        outputs,
        expected_tag,
        datum.depositor,
        own_value,
        own_address,
      )
    trace @"cancel checks": correct_cancel_payment, !has_continuing_output
    correct_cancel_payment && !has_continuing_output
  }
}

// ============================================================================
// VULNERABLE VERSIONS FOR TESTING (DO NOT USE IN PRODUCTION)
// These demonstrate the M-01 double satisfaction vulnerability
// ============================================================================

// VULNERABLE: Uses list.any() without output tagging (M-01 vulnerability)
fn handle_release_vulnerable(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
) -> Bool {
  let time_unlock = is_past_deadline(datum.deadline, validity_range)
  let key_unlock =
    check_required_signatures(
      signatories,
      datum.authorized_keys,
      datum.required_signatures,
    )
  let can_unlock = time_unlock || key_unlock
  if !can_unlock {
    False
  } else {
    when compute_release_distribution(own_value, datum.fee_config) is {
      None -> False
      Some((beneficiary_value, fee_value)) -> {
        // VULNERABLE: Uses list.any() - allows same output to satisfy multiple validators
        let correct_beneficiary_payment =
          find_output_to_pkh_with_value(outputs, datum.beneficiary, beneficiary_value)
        let fee_amount = assets.lovelace_of(fee_value)
        let fee_required = fee_amount > 0
        let correct_fee_payment =
          when (datum.fee_config.fee_recipient, fee_required) is {
            (None, True) -> False
            (None, False) -> True
            (Some(fee_recipient), _) ->
              find_output_to_pkh_with_value(outputs, fee_recipient, fee_value)
          }
        let expected_total = assets.merge(beneficiary_value, fee_value)
        let value_conserved =
          assets.merge(own_value, assets.negate(expected_total)) |> assets.is_zero
        let no_continuing_output =
          !list.any(outputs, fn(o) { o.address == own_address })
        correct_beneficiary_payment && correct_fee_payment && no_continuing_output && value_conserved
      }
    }
  }
}

// VULNERABLE: Uses list.any() without output tagging (M-01 vulnerability)
fn handle_refund_vulnerable(
  datum: EscrowDatum,
  outputs: List<Output>,
  signatories: List<VerificationKeyHash>,
  own_address: Address,
  own_value: Value,
  validity_range: transaction.ValidityRange,
) -> Bool {
  let time_expired = is_past_deadline(datum.deadline, validity_range)
  let authorized_refund =
    check_required_signatures(
      signatories,
      datum.authorized_keys,
      datum.required_signatures,
    )
  let can_refund = time_expired || authorized_refund
  if !can_refund {
    False
  } else {
    // VULNERABLE: Uses list.any() - allows same output to satisfy multiple validators
    let correct_refund_payment =
      find_output_to_pkh_with_value(outputs, datum.depositor, own_value)
    let no_continuing_output =
      !list.any(outputs, fn(o) { o.address == own_address })
    correct_refund_payment && no_continuing_output
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

// M-01 Fix: Helper to create tagged output with inline datum
fn sample_tagged_output(address: Address, value: Value, tag: ByteArray) -> Output {
  Output { address, value, datum: InlineDatum(tag), reference_script: None }
}

// Helper to create output reference for testing
fn sample_output_reference(tx_hash: ByteArray, index: Int) -> OutputReference {
  OutputReference { transaction_id: tx_hash, output_index: index }
}

// Property-based tests

// Test Case 1: Successful release with key-based unlock and tagged output
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
  let own_ref =
    sample_output_reference(
      #"0001000100010001000100010001000100010001000100010001000100010001",
      0,
    )
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [
      sample_tagged_output(
        sample_address(params.beneficiary_pkh),
        own_value,
        expected_tag,
      ),
    ]
  let signatories = [params.authorized_key1]
  // One authorized signature
  let own_address = sample_script_address()
  let validity_range = interval.everything
  handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
    own_ref,
  )
}

// Test Case 2: Successful refund by depositor with tagged output
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
  let own_ref =
    sample_output_reference(
      #"0002000200020002000200020002000200020002000200020002000200020002",
      0,
    )
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [
      sample_tagged_output(
        sample_address(params.depositor_pkh),
        own_value,
        expected_tag,
      ),
    ]
  let signatories = [params.depositor_pkh]
  // Depositor signature
  let own_address = sample_script_address()
  let validity_range = interval.everything
  handle_refund(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
    own_ref,
  )
}

// Test Case 3: Successful cancel by depositor with tagged output
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
  let own_ref =
    sample_output_reference(
      #"0003000300030003000300030003000300030003000300030003000300030003",
      0,
    )
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [
      sample_tagged_output(
        sample_address(params.depositor_pkh),
        own_value,
        expected_tag,
      ),
    ]
  let signatories = [params.depositor_pkh]
  // Only depositor can cancel
  let own_address = sample_script_address()
  let validity_range = interval.entirely_before(0)
  handle_cancel(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
    own_ref,
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
      let own_ref =
        sample_output_reference(
          #"0004000400040004000400040004000400040004000400040004000400040004",
          0,
        )
      let expected_tag = hash_output_reference(own_ref)
      let outputs =
        [
          sample_tagged_output(
            sample_address(params.beneficiary_pkh),
            own_value,
            expected_tag,
          ),
        ]
      let signatories = [params.authorized_key1]
      // Only 1 signature, need 2
      let own_address = sample_script_address()
      let validity_range = interval.everything
      !handle_release(
        datum,
        outputs,
        signatories,
        own_address,
        own_value,
        validity_range,
        own_ref,
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
      let own_ref =
        sample_output_reference(
          #"0005000500050005000500050005000500050005000500050005000500050005",
          0,
        )
      let expected_tag = hash_output_reference(own_ref)
      let outputs =
        [
          sample_tagged_output(
            sample_address(params.depositor_pkh),
            own_value,
            expected_tag,
          ),
        ]
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
        own_ref,
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
  let own_ref =
    sample_output_reference(
      #"aabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccddaabbccdd",
      0,
    )
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(beneficiary), own_value, expected_tag)]
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
    own_ref,
  )
}

test test_simple_cancel_success() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let datum = sample_datum(depositor, beneficiary, [depositor], 1)
  let own_value = assets.from_lovelace(2000000)
  let own_ref =
    sample_output_reference(
      #"ddeeffaaddeeffaaddeeffaaddeeffaaddeeffaaddeeffaaddeeffaaddeeffaa",
      0,
    )
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [sample_tagged_output(sample_address(depositor), own_value, expected_tag)]
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
    own_ref,
  )
}

// Additional edge case tests
test test_empty_outputs_fails() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let auth_key = #"03030303030303030303030303030303030303030303030303030303"
  let datum = sample_datum(depositor, beneficiary, [auth_key], 1)
  let outputs = []
  let signatories = [auth_key]
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  let own_ref =
    sample_output_reference(
      #"1111111111111111111111111111111111111111111111111111111111111111",
      0,
    )
  let validity_range = interval.everything
  !handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
    own_ref,
  )
}

test test_continuing_output_fails() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let auth_key = #"03030303030303030303030303030303030303030303030303030303"
  let datum = sample_datum(depositor, beneficiary, [auth_key], 1)
  let own_address = sample_script_address()
  let own_value = assets.from_lovelace(2000000)
  let own_ref =
    sample_output_reference(
      #"2222222222222222222222222222222222222222222222222222222222222222",
      0,
    )
  let expected_tag = hash_output_reference(own_ref)
  let outputs =
    [
      sample_tagged_output(sample_address(beneficiary), own_value, expected_tag),
      sample_output(own_address, assets.from_lovelace(1000000)),
    ]
  // Continuing output
  let signatories = [auth_key]
  let validity_range = interval.everything
  !handle_release(
    datum,
    outputs,
    signatories,
    own_address,
    own_value,
    validity_range,
    own_ref,
  )
}

// ============================================================================
// M-01 VULNERABILITY DEMONSTRATION TESTS
// These tests demonstrate the double satisfaction attack using VULNERABLE handlers
// ============================================================================

// Test: M-01 Vulnerability - Same output satisfies multiple validators
// Attack scenario: 3 escrows (1000 ADA each), attacker gets 2000 ADA
test test_vulnerability_m01_double_satisfaction_release() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let auth_key = #"03030303030303030303030303030303030303030303030303030303"
  let attacker = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  // 3 escrows of 1000 ADA each (same beneficiary/auth_key)
  let datum = sample_datum(depositor, beneficiary, [auth_key], 1)
  let escrow_value = assets.from_lovelace(1000000000)
  let own_address = sample_script_address()
  // Attack outputs: 1000 ADA to beneficiary (satisfies all 3 validators!)
  // + 2000 ADA to attacker
  let attack_outputs =
    [
      sample_output(sample_address(beneficiary), escrow_value),
      sample_output(sample_address(attacker), assets.from_lovelace(2000000000)),
    ]
  let signatories = [auth_key]
  let validity_range = interval.everything
  // VULNERABLE: All 3 validators pass on the same 1000 ADA output
  let v1_passes =
    handle_release_vulnerable(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
    )
  let v2_passes =
    handle_release_vulnerable(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
    )
  let v3_passes =
    handle_release_vulnerable(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
    )
  // All validators pass - this IS the vulnerability!
  v1_passes && v2_passes && v3_passes
}

// Test: M-01 Vulnerability - Refund double satisfaction
test test_vulnerability_m01_double_satisfaction_refund() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let attacker = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  // 2 escrows of 500 ADA each (same depositor)
  let datum = sample_datum(depositor, beneficiary, [depositor], 1)
  let escrow_value = assets.from_lovelace(500000000)
  let own_address = sample_script_address()
  // Attack outputs: 500 ADA to depositor (satisfies both validators!)
  // + 500 ADA to attacker
  let attack_outputs =
    [
      sample_output(sample_address(depositor), escrow_value),
      sample_output(sample_address(attacker), assets.from_lovelace(500000000)),
    ]
  let signatories = [depositor]
  let validity_range = interval.everything
  // VULNERABLE: Both validators pass on the same 500 ADA output
  let v1_passes =
    handle_refund_vulnerable(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
    )
  let v2_passes =
    handle_refund_vulnerable(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
    )
  // Both validators pass - this IS the vulnerability!
  v1_passes && v2_passes
}

// ============================================================================
// M-01 REGRESSION TESTS
// These tests verify that the FIX prevents the double satisfaction attack
// ============================================================================

// Test: M-01 Fix - Double satisfaction prevented with output tagging
test test_m01_fix_double_satisfaction_prevented() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let auth_key = #"03030303030303030303030303030303030303030303030303030303"
  let attacker = #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  // 3 escrows with different input references
  let escrow_value = assets.from_lovelace(1000000000)
  let own_address = sample_script_address()
  let own_ref1 =
    sample_output_reference(
      #"1111111111111111111111111111111111111111111111111111111111111111",
      0,
    )
  let own_ref2 =
    sample_output_reference(
      #"2222222222222222222222222222222222222222222222222222222222222222",
      0,
    )
  let own_ref3 =
    sample_output_reference(
      #"3333333333333333333333333333333333333333333333333333333333333333",
      0,
    )
  // Compute tags for each input
  let tag1 = hash_output_reference(own_ref1)
  // Attack: Only one output tagged with tag1, attacker tries to use for all 3
  let attack_outputs =
    [
      sample_tagged_output(sample_address(beneficiary), escrow_value, tag1),
      sample_output(sample_address(attacker), assets.from_lovelace(2000000000)),
    ]
  let datum = sample_datum(depositor, beneficiary, [auth_key], 1)
  let signatories = [auth_key]
  let validity_range = interval.everything
  // FIXED: Only first validator passes (has matching tag)
  let v1_passes =
    handle_release(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
      own_ref1,
    )
  let v2_passes =
    handle_release(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
      own_ref2,
    )
  let v3_passes =
    handle_release(
      datum,
      attack_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
      own_ref3,
    )
  // Only v1 passes (correct tag), v2 and v3 fail (wrong tag)
  v1_passes && !v2_passes && !v3_passes
}

// Test: Correct multi-escrow spend with proper tagged outputs
test test_m01_fix_correct_multi_escrow() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let auth_key = #"03030303030303030303030303030303030303030303030303030303"
  let escrow_value = assets.from_lovelace(1000000000)
  let own_address = sample_script_address()
  // 3 different input references
  let own_ref1 =
    sample_output_reference(
      #"aaaa111111111111111111111111111111111111111111111111111111111111",
      0,
    )
  let own_ref2 =
    sample_output_reference(
      #"bbbb222222222222222222222222222222222222222222222222222222222222",
      0,
    )
  let own_ref3 =
    sample_output_reference(
      #"cccc333333333333333333333333333333333333333333333333333333333333",
      0,
    )
  // Compute unique tags
  let tag1 = hash_output_reference(own_ref1)
  let tag2 = hash_output_reference(own_ref2)
  let tag3 = hash_output_reference(own_ref3)
  // Correct outputs: one per escrow, each properly tagged
  let correct_outputs =
    [
      sample_tagged_output(sample_address(beneficiary), escrow_value, tag1),
      sample_tagged_output(sample_address(beneficiary), escrow_value, tag2),
      sample_tagged_output(sample_address(beneficiary), escrow_value, tag3),
    ]
  let datum = sample_datum(depositor, beneficiary, [auth_key], 1)
  let signatories = [auth_key]
  let validity_range = interval.everything
  // All validators should pass with correct outputs
  let v1_passes =
    handle_release(
      datum,
      correct_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
      own_ref1,
    )
  let v2_passes =
    handle_release(
      datum,
      correct_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
      own_ref2,
    )
  let v3_passes =
    handle_release(
      datum,
      correct_outputs,
      signatories,
      own_address,
      escrow_value,
      validity_range,
      own_ref3,
    )
  // All validators pass with correct tagged outputs
  v1_passes && v2_passes && v3_passes
}

// ============================================================================
// M-02 VULNERABILITY DEMONSTRATION TESTS
// These tests demonstrate the duplicate keys bypass multi-sig vulnerability
// ============================================================================

// Test: M-02 Vulnerability - Duplicate keys inflate signature count
test test_vulnerability_m02_duplicate_keys_bypass() {
  let depositor = #"01010101010101010101010101010101010101010101010101010101"
  let beneficiary = #"02020202020202020202020202020202020202020202020202020202"
  let single_key = #"03030303030303030303030303030303030303030303030303030303"
  // ATTACK: authorized_keys has duplicates [key, key, key]
  // required_signatures = 2, but only 1 actual key needed!
  let signatories = [single_key]
  // Only 1 signer
  // VULNERABLE: Counts duplicates, so 3 matches instead of 1
  let vulnerable_result =
    check_required_signatures_vulnerable(
      signatories,
      [single_key, single_key, single_key],
      // Duplicated key
      2,
    )
  // Required 2 signatures
  // Should pass with vulnerable function (counts 3 matching signatures)
  vulnerable_result == True
}

// ============================================================================
// M-02 REGRESSION TESTS
// These tests verify that the FIX prevents duplicate key bypass
// ============================================================================

// Test: M-02 Fix - Duplicate keys no longer inflate count
test test_m02_fix_duplicate_keys_prevented() {
  let single_key = #"03030303030303030303030303030303030303030303030303030303"
  let signatories = [single_key]
  // Only 1 signer
  // FIXED: Uses list.unique() so duplicates don't count
  let fixed_result =
    check_required_signatures(
      signatories,
      [single_key, single_key, single_key],
      // Duplicated key
      2,
    )
  // Required 2 signatures
  // Should fail with fixed function (only counts 1 unique key)
  fixed_result == False
}

// Test: M-02 Fix - Normal multi-sig still works
test test_m02_fix_normal_multisig_works() {
  let key1 = #"03030303030303030303030303030303030303030303030303030303"
  let key2 = #"04040404040404040404040404040404040404040404040404040404"
  let signatories = [key1, key2]
  // 2 different signers
  // With unique keys, 2-of-2 multi-sig works correctly
  let result = check_required_signatures(signatories, [key1, key2], 2)
  result == True
}

// Test: M-02 Fix - Insufficient unique signers fails
test test_m02_fix_insufficient_signers_fails() {
  let key1 = #"03030303030303030303030303030303030303030303030303030303"
  let key2 = #"04040404040404040404040404040404040404040404040404040404"
  let signatories = [key1]
  // Only 1 signer
  // 2-of-2 multi-sig should fail with only 1 signer
  let result = check_required_signatures(signatories, [key1, key2], 2)
  result == False
}
