//! Resolving a clearing cycle's terms from core.
//!
//! The client names only a cycle and a participant; everything the transaction actually depends
//! on — the ClearingHouse address, the amount, the Merkle proof — comes from here. That is the
//! whole security argument for the endpoints: a caller cannot aim the relayer's key at another
//! contract, nor settle an amount the committed leaf does not fix.
//!
//! Reading another participant's terms needs the facilitator role on core, which is why this
//! carries the same [`AuthSession`] the guarantee issuer uses.

use std::str::FromStr;
use std::sync::Arc;

use alloy::primitives::{Address, B256, U256};
use reqwest::Url;
use rpc::{ClearingSettlementAction, ClearingSettlementActionResponse};

use crate::auth::AuthSession;
use crate::issuer::parse_error_message;

use super::{ClaimError, PayError};

/// Everything `claimNetCreditFor` needs, resolved from core rather than taken from the caller.
#[derive(Debug, Clone)]
pub struct ClaimTerms {
    pub clearing_house: Address,
    pub cycle_id: B256,
    pub creditor: Address,
    pub amount: U256,
    pub proof: Vec<B256>,
}

/// Everything `payNetDebitWithAuthorization` needs except the debtor's signature, resolved from
/// core rather than taken from the caller. `asset` is what the authorization's digest is built
/// against; core never serves a native-asset debit here (see [`parse_pay_terms`]).
#[derive(Debug, Clone)]
pub struct PayTerms {
    pub clearing_house: Address,
    pub cycle_id: B256,
    pub debtor: Address,
    pub asset: Address,
    pub amount: U256,
    pub proof: Vec<B256>,
}

pub struct ClearingActions {
    client: reqwest::Client,
    base_url: Url,
    auth: Option<Arc<AuthSession>>,
}

impl ClearingActions {
    pub fn new(base_url: Url, auth: Option<Arc<AuthSession>>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url,
            auth,
        }
    }

    /// The terms of `creditor`'s net credit for `cycle_id`.
    pub async fn claim_terms(
        &self,
        cycle_id: &str,
        creditor: Address,
    ) -> Result<ClaimTerms, ClaimError> {
        let action = self
            .fetch_action(cycle_id, creditor, "claim_net_credit")
            .await
            .map_err(ClaimError::ActionUnavailable)?;
        parse_terms(action, creditor)
    }

    /// The terms of `debtor`'s net debit for `cycle_id`.
    pub async fn pay_terms(&self, cycle_id: &str, debtor: Address) -> Result<PayTerms, PayError> {
        let action = self
            .fetch_action(cycle_id, debtor, "pay_net_debit")
            .await
            .map_err(PayError::ActionUnavailable)?;
        parse_pay_terms(action, debtor)
    }

    /// GETs core's clearing-action endpoint; the error is the reason the action was unavailable.
    async fn fetch_action(
        &self,
        cycle_id: &str,
        participant: Address,
        action: &str,
    ) -> Result<ClearingSettlementActionResponse, String> {
        let mut url = self.base_url.clone();
        url.set_path(&format!(
            "core/cycles/{cycle_id}/participants/{participant:#x}/clearing-action"
        ));
        url.query_pairs_mut().append_pair("action", action);

        let mut request = self.client.get(url);
        if let Some(auth) = &self.auth {
            let token = auth.access_token().await.map_err(|err| err.to_string())?;
            request = request.bearer_auth(token);
        }

        let response = request.send().await.map_err(|err| err.to_string())?;
        let status = response.status();
        let bytes = response.bytes().await.map_err(|err| err.to_string())?;
        if !status.is_success() {
            return Err(format!(
                "core returned {status}: {}",
                parse_error_message(&bytes)
            ));
        }

        serde_json::from_slice(&bytes)
            .map_err(|err| format!("could not decode core's response: {err}"))
    }
}

/// Converts core's response into typed terms, refusing anything that does not describe the claim
/// that was asked for.
fn parse_terms(
    action: ClearingSettlementActionResponse,
    creditor: Address,
) -> Result<ClaimTerms, ClaimError> {
    if action.action != ClearingSettlementAction::ClaimNetCredit {
        return Err(ClaimError::ActionMismatch {
            returned: format!("{:?}", action.action),
        });
    }

    // Core echoes the participant it proved. A disagreement means the proof belongs to someone
    // else, and submitting it would pay them instead.
    let proven =
        parse_address(&action.participant, "participant").map_err(ClaimError::ActionUnavailable)?;
    if proven != creditor {
        return Err(ClaimError::ActionMismatch {
            returned: format!("proof for {proven}, not {creditor}"),
        });
    }

    Ok(ClaimTerms {
        clearing_house: parse_address(&action.contract_address, "contract_address")
            .map_err(ClaimError::ActionUnavailable)?,
        cycle_id: parse_b256(&action.cycle_id, "cycle_id")
            .map_err(ClaimError::ActionUnavailable)?,
        creditor,
        amount: U256::from_str(&action.amount).map_err(|err| {
            ClaimError::ActionUnavailable(format!("core returned an unparseable amount: {err}"))
        })?,
        proof: action
            .proof
            .iter()
            .map(|item| parse_b256(item, "proof element").map_err(ClaimError::ActionUnavailable))
            .collect::<Result<_, _>>()?,
    })
}

/// Converts core's response into typed debit terms, refusing anything that does not describe the
/// payment that was asked for — including a native-asset cycle, which has no authorization to pull
/// funds with.
fn parse_pay_terms(
    action: ClearingSettlementActionResponse,
    debtor: Address,
) -> Result<PayTerms, PayError> {
    if action.action != ClearingSettlementAction::PayNetDebit {
        return Err(PayError::ActionMismatch {
            returned: format!("{:?}", action.action),
        });
    }

    // Core echoes the participant it proved. A disagreement means the proof belongs to someone
    // else, and the leaf would not verify against this debtor.
    let proven =
        parse_address(&action.participant, "participant").map_err(PayError::ActionUnavailable)?;
    if proven != debtor {
        return Err(PayError::ActionMismatch {
            returned: format!("proof for {proven}, not {debtor}"),
        });
    }

    let asset = parse_address(&action.asset_address, "asset_address")
        .map_err(PayError::ActionUnavailable)?;
    if asset == Address::ZERO {
        return Err(PayError::InvalidRequest(
            "the cycle settles in native ETH; a native debit cannot be pulled by authorization"
                .into(),
        ));
    }

    Ok(PayTerms {
        clearing_house: parse_address(&action.contract_address, "contract_address")
            .map_err(PayError::ActionUnavailable)?,
        cycle_id: parse_b256(&action.cycle_id, "cycle_id").map_err(PayError::ActionUnavailable)?,
        debtor,
        asset,
        amount: U256::from_str(&action.amount).map_err(|err| {
            PayError::ActionUnavailable(format!("core returned an unparseable amount: {err}"))
        })?,
        proof: action
            .proof
            .iter()
            .map(|item| parse_b256(item, "proof element").map_err(PayError::ActionUnavailable))
            .collect::<Result<_, _>>()?,
    })
}

fn parse_address(value: &str, field: &str) -> Result<Address, String> {
    Address::from_str(value.trim())
        .map_err(|_| format!("core returned an invalid {field}: {value}"))
}

fn parse_b256(value: &str, field: &str) -> Result<B256, String> {
    B256::from_str(value.trim()).map_err(|_| format!("core returned an invalid {field}: {value}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::address;

    const CREDITOR: Address = address!("000000000000000000000000000000000000c0ed");
    const CLEARING_HOUSE: Address = address!("00000000000000000000000000000000c1ea4111");

    fn response(
        participant: Address,
        action: ClearingSettlementAction,
    ) -> ClearingSettlementActionResponse {
        ClearingSettlementActionResponse {
            contract_address: CLEARING_HOUSE.to_string(),
            function_name: "claimNetCredit".to_string(),
            action,
            cycle_id: format!("{:#x}", B256::repeat_byte(0xaa)),
            cycle_id_text: "eth:1800000000".to_string(),
            asset_address: Address::ZERO.to_string(),
            participant: participant.to_string(),
            amount: "1000".to_string(),
            payable_value: "0".to_string(),
            proof: vec![format!("{:#x}", B256::repeat_byte(0xbb))],
        }
    }

    #[test]
    fn terms_come_from_cores_response() {
        let terms = parse_terms(
            response(CREDITOR, ClearingSettlementAction::ClaimNetCredit),
            CREDITOR,
        )
        .expect("claim terms");

        assert_eq!(terms.clearing_house, CLEARING_HOUSE);
        assert_eq!(terms.creditor, CREDITOR);
        assert_eq!(terms.amount, U256::from(1_000u64));
        assert_eq!(terms.proof, vec![B256::repeat_byte(0xbb)]);
    }

    /// A debit action carries a payable value and a debtor's proof; submitting it as a claim would
    /// be a different transaction entirely.
    #[test]
    fn a_debit_action_is_refused() {
        let err = parse_terms(
            response(CREDITOR, ClearingSettlementAction::PayNetDebit),
            CREDITOR,
        )
        .expect_err("wrong action");
        assert_eq!(err.code(), "ACTION_MISMATCH");
    }

    /// The proof proves whoever core names. Submitting one for a different creditor would pay them
    /// instead of the account the caller asked about.
    #[test]
    fn a_proof_for_another_participant_is_refused() {
        let other = address!("000000000000000000000000000000000000dead");
        let err = parse_terms(
            response(other, ClearingSettlementAction::ClaimNetCredit),
            CREDITOR,
        )
        .expect_err("participant mismatch");
        assert_eq!(err.code(), "ACTION_MISMATCH");
    }

    const DEBTOR: Address = address!("000000000000000000000000000000000000debb");
    const TOKEN: Address = address!("000000000000000000000000000000000000d0c5");

    fn pay_response(participant: Address, asset: Address) -> ClearingSettlementActionResponse {
        ClearingSettlementActionResponse {
            asset_address: asset.to_string(),
            participant: participant.to_string(),
            action: ClearingSettlementAction::PayNetDebit,
            function_name: "payNetDebit".to_string(),
            ..response(participant, ClearingSettlementAction::PayNetDebit)
        }
    }

    #[test]
    fn pay_terms_come_from_cores_response() {
        let terms = parse_pay_terms(pay_response(DEBTOR, TOKEN), DEBTOR).expect("pay terms");

        assert_eq!(terms.clearing_house, CLEARING_HOUSE);
        assert_eq!(terms.debtor, DEBTOR);
        assert_eq!(terms.asset, TOKEN);
        assert_eq!(terms.amount, U256::from(1_000u64));
        assert_eq!(terms.proof, vec![B256::repeat_byte(0xbb)]);
    }

    /// The mirror image of `a_debit_action_is_refused`: a claim action pays out rather than pulls
    /// in, and submitting it as a payment would be a different transaction entirely.
    #[test]
    fn a_claim_action_is_refused_for_a_payment() {
        let mut action = pay_response(DEBTOR, TOKEN);
        action.action = ClearingSettlementAction::ClaimNetCredit;
        let err = parse_pay_terms(action, DEBTOR).expect_err("wrong action");
        assert_eq!(err.code(), "ACTION_MISMATCH");
    }

    #[test]
    fn a_pay_proof_for_another_participant_is_refused() {
        let other = address!("000000000000000000000000000000000000dead");
        let err =
            parse_pay_terms(pay_response(other, TOKEN), DEBTOR).expect_err("participant mismatch");
        assert_eq!(err.code(), "ACTION_MISMATCH");
    }

    /// A native cycle has no token to sign an authorization against, so the request is refused
    /// outright rather than failing later as an unusable digest.
    #[test]
    fn a_native_asset_debit_is_refused() {
        let err =
            parse_pay_terms(pay_response(DEBTOR, Address::ZERO), DEBTOR).expect_err("native asset");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }
}
