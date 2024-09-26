//// Module comment for Agrow

use aiken/dict.{Dict}
use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/pairs
use aiken/transaction.{Mint, ScriptContext, Transaction} as tx
use aiken/transaction/credential.{
  Inline, StakeCredential, VerificationKey, VerificationKeyCredential,
}
use aiken/transaction/value.{AssetName, PolicyId, minted_to_dict}

type MintRedeemer {
  Minting
  Burning
}

// Check that either the staking pubkey signed or the staking script was executed.
fn staking_credential_approves(
  staking_cred: StakeCredential,
  withdrawals: Pairs<StakeCredential, Int>,
  extra_signatories: List<Hash<Blake2b_224, VerificationKey>>,
) -> Bool {
  when staking_cred is {
    Inline(VerificationKeyCredential(skey)) -> list.has(extra_signatories, skey)
    svh -> pairs.has_key(withdrawals, svh)
  }
}

fn ensure_no_policy_minted(
  minted: Dict<PolicyId, Dict<AssetName, Int>>,
  policy: PolicyId,
) {
  when dict.get(minted, policy) is {
    None -> True
    Some(d) -> list.all(dict.values(d), fn(x) { x < 0 })
  }
}

test ensure_no_policy_minted_1() {
  let minted =
    dict.new()
      |> dict.insert(
          key: "policy",
          value: dict.new() |> dict.insert(key: "a", value: 100),
        )
  ensure_no_policy_minted(minted, "policy") == False
}

test ensure_no_policy_minted_2() {
  //let result =
  let minted =
    dict.new()
      |> dict.insert(
          key: "policy",
          value: dict.new() |> dict.insert(key: "a", value: -100),
        )
  ensure_no_policy_minted(minted, "policy")
}

validator(permissioned_credential: StakeCredential) {
  fn mint(rdmr: MintRedeemer, ctx: ScriptContext) {
    // Get required information for script context.
    expect ScriptContext(
      Transaction(_, _, _, _, mint, _, wtdr, _, sigs, ..),
      Mint(policy_id),
    ) = ctx
    when rdmr is {
      Minting ->
        // Ensure that the tx is signed by the permissioned_credential.
        staking_credential_approves(permissioned_credential, wtdr, sigs)
      Burning ->
        // Ensure that our policy is only burnt, not minted.
        ensure_no_policy_minted(minted_to_dict(mint), policy_id)
    }
  }

  // Our validator serves as a sort of locker for the admin
  // This provides a place for Metadata to live and be changed over time.
  fn update(_datum: Data, _rdmr: Data, ctx: ScriptContext) {
    let ScriptContext(Transaction(_, _, _, _, _, _, wtdr, _, sigs, ..), _) = ctx
    // Ensure that the tx is signed by the permissioned_credential.
    staking_credential_approves(permissioned_credential, wtdr, sigs)
  }
}
