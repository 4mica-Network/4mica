//! Resolving a clearing cycle's terms from core.
//!
//! The client names only a cycle and a creditor; everything the transaction actually depends on —
//! the ClearingHouse address, the amount, the Merkle proof — comes from here. That is the whole
//! security argument for the endpoint: a caller cannot aim the relayer's key at another contract,
//! nor claim an amount the committed leaf does not fix.
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

use super::ClaimError;

/// Everything `claimNetCreditFor` needs, resolved from core rather than taken from the caller.
#[derive(Debug, Clone)]
pub struct ClaimTerms {
    pub clearing_house: Address,
    pub cycle_id: B256,
    pub creditor: Address,
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
        let mut url = self.base_url.clone();
        url.set_path(&format!(
            "core/cycles/{cycle_id}/participants/{creditor:#x}/clearing-action"
        ));
        url.query_pairs_mut()
            .append_pair("action", "claim_net_credit");

        let mut request = self.client.get(url);
        if let Some(auth) = &self.auth {
            let token = auth
                .access_token()
                .await
                .map_err(|err| ClaimError::ActionUnavailable(err.to_string()))?;
            request = request.bearer_auth(token);
        }

        let response = request
            .send()
            .await
            .map_err(|err| ClaimError::ActionUnavailable(err.to_string()))?;
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|err| ClaimError::ActionUnavailable(err.to_string()))?;
        if !status.is_success() {
            return Err(ClaimError::ActionUnavailable(format!(
                "core returned {status}: {}",
                parse_error_message(&bytes)
            )));
        }

        let action: ClearingSettlementActionResponse =
            serde_json::from_slice(&bytes).map_err(|err| {
                ClaimError::ActionUnavailable(format!("could not decode core's response: {err}"))
            })?;

        parse_terms(action, creditor)
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
    let proven = parse_address(&action.participant, "participant")?;
    if proven != creditor {
        return Err(ClaimError::ActionMismatch {
            returned: format!("proof for {proven}, not {creditor}"),
        });
    }

    Ok(ClaimTerms {
        clearing_house: parse_address(&action.contract_address, "contract_address")?,
        cycle_id: parse_b256(&action.cycle_id, "cycle_id")?,
        creditor,
        amount: U256::from_str(&action.amount).map_err(|err| {
            ClaimError::ActionUnavailable(format!("core returned an unparseable amount: {err}"))
        })?,
        proof: action
            .proof
            .iter()
            .map(|item| parse_b256(item, "proof element"))
            .collect::<Result<_, _>>()?,
    })
}

fn parse_address(value: &str, field: &str) -> Result<Address, ClaimError> {
    Address::from_str(value.trim()).map_err(|_| {
        ClaimError::ActionUnavailable(format!("core returned an invalid {field}: {value}"))
    })
}

fn parse_b256(value: &str, field: &str) -> Result<B256, ClaimError> {
    B256::from_str(value.trim()).map_err(|_| {
        ClaimError::ActionUnavailable(format!("core returned an invalid {field}: {value}"))
    })
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
}
