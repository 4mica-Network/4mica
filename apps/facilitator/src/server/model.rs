use std::collections::HashMap;

use rpc::{GuaranteeReceipt, PaymentRequest};
use sdk_4mica::contract::Core4Mica::{
    Permit2Authorization, ReceiveAuthorization, WithdrawalCancelAuthorization,
    WithdrawalRequestAuthorization,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::state::ValidationError;
use std::str::FromStr;

use alloy::primitives::{Address, B256, U256};

use crate::clearing::{ClaimError, ClaimTerms, PayError, PayTerms};
use crate::deposit::{DepositError, DepositIntent, Eip2612Permit};
use crate::error_code::Failure;
use crate::limits::SponsorCounters;
use crate::withdraw::{WithdrawError, WithdrawIntent};

#[derive(Clone, Copy, Debug)]
pub struct X402Version<const N: u8>;

impl<const N: u8> Serialize for X402Version<N> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u8(N)
    }
}

impl<'de, const N: u8> Deserialize<'de> for X402Version<N> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        if value == N {
            Ok(X402Version::<N>)
        } else {
            Err(serde::de::Error::custom(format!(
                "invalid x402Version, expected 1 or 2, got {}",
                value
            )))
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X402PaymentPayloadV1 {
    pub x402_version: X402Version<1>,
    pub scheme: String,
    pub network: String,
    pub payload: PaymentRequest,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X402PaymentPayloadV2 {
    pub x402_version: X402Version<2>,
    pub accepted: PaymentRequirements,
    pub payload: PaymentRequest,
}

#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum X402PaymentPayload {
    V1(X402PaymentPayloadV1),
    V2(X402PaymentPayloadV2),
}

impl X402PaymentPayload {
    pub fn x402_version(&self) -> u8 {
        match self {
            X402PaymentPayload::V1(_) => 1,
            X402PaymentPayload::V2(_) => 2,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedKind {
    pub scheme: String,
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x402_version: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedResponse {
    pub kinds: Vec<SupportedKind>,
    pub extensions: Vec<String>,
    pub signers: HashMap<String, Vec<String>>,
}

impl SupportedResponse {
    pub fn new(kinds: Vec<SupportedKind>) -> Self {
        Self {
            kinds,
            extensions: Vec::new(),
            signers: HashMap::new(),
        }
    }
}

/// Health, with enough operational detail to alert on.
///
/// A bare `{"status":"ok"}` cannot distinguish a working facilitator from one whose relayer ran dry
/// hours ago, so the relayer's balance and the deposit counters are surfaced here. `status` is
/// `degraded` when any relayer has fallen to or below its configured floor, so a plain HTTP check
/// is enough to page on.
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub relayers: Vec<RelayerHealth>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deposits: Option<SponsorCounters>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub withdrawals: Option<SponsorCounters>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claims: Option<SponsorCounters>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debits: Option<SponsorCounters>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayerHealth {
    pub network: String,
    pub address: String,
    /// `None` when the balance could not be read — itself worth alerting on, and distinct from a
    /// balance of zero.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance_wei: Option<String>,
    /// True when at or below `X402_DEPOSIT_MIN_RELAYER_BALANCE_WEI`, i.e. deposits are being
    /// refused. Always false when no floor is configured.
    pub below_floor: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequirements {
    pub scheme: String,
    pub network: String,
    #[serde(default)]
    pub max_amount_required: String,
    #[serde(default)]
    pub amount: Option<String>,
    pub resource: Option<String>,
    pub description: Option<String>,
    pub mime_type: Option<String>,
    pub output_schema: Option<Value>,
    pub pay_to: String,
    pub max_timeout_seconds: Option<u64>,
    pub asset: String,
    pub extra: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct VerifyRequest {
    #[serde(rename = "x402Version")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x402_version: Option<u8>,
    #[serde(rename = "paymentPayload")]
    pub payment_payload: X402PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SettleRequest {
    #[serde(rename = "x402Version")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x402_version: Option<u8>,
    #[serde(rename = "paymentPayload")]
    pub payment_payload: X402PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

impl VerifyRequest {
    pub(crate) fn resolved_x402_version(&self) -> Result<u8, ValidationError> {
        super::state::resolve_x402_version(&self.payment_payload, self.x402_version)
    }
}

impl SettleRequest {
    pub(crate) fn resolved_x402_version(&self) -> Result<u8, ValidationError> {
        super::state::resolve_x402_version(&self.payment_payload, self.x402_version)
    }
}

/// 4mica's additions to a response, under the `extra` key x402 leaves to schemes so a generic x402
/// client passes them through.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseExtra {
    /// Whether repeating the identical request later may succeed. Set on failures only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    /// What the caller needs to act on the failure, when the message alone is not enough.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
    /// The operator's receipt for the guarantee core issued.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub receipt: Option<GuaranteeReceipt>,
}

impl ResponseExtra {
    fn failure(failure: &Failure) -> Option<Self> {
        Some(Self {
            retryable: Some(failure.retryable),
            details: failure.details.clone(),
            receipt: None,
        })
    }
}

/// The answer from every verify endpoint: x402's `/verify` and the sponsored actions' preflights.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResponse {
    pub is_valid: bool,
    /// A machine-readable reason, such as `insufficient_funds`. Absent when valid.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invalid_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ResponseExtra>,
}

impl VerifyResponse {
    pub fn valid(payer: Option<String>) -> Self {
        Self {
            is_valid: true,
            payer,
            ..Self::default()
        }
    }

    pub fn invalid(failure: impl Into<Failure>) -> Self {
        let failure = failure.into();
        Self {
            is_valid: false,
            extra: ResponseExtra::failure(&failure),
            invalid_reason: Some(failure.reason),
            invalid_message: Some(failure.message),
            payer: None,
        }
    }
}

/// A gasless deposit: the payer's EIP-3009 authorization plus the amount and asset it was signed
/// over. Both must match the signature exactly or the token's `ecrecover` fails on-chain.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositRequest {
    /// CAIP-2 network. Omitted uses the facilitator's default (first configured) network.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    pub asset: String,
    /// Decimal or `0x`-prefixed hex, in the token's own decimals.
    pub amount: String,
    /// `eip3009` (default) or `permit2`, matching x402's `scheme_exact_evm`. Optional — the
    /// authorization field that is present already identifies the scheme — but a mismatch is
    /// rejected rather than silently ignored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_transfer_method: Option<String>,
    /// EIP-3009 `receiveWithAuthorization`. Exactly one of this and `permit2Authorization` must be
    /// present, mirroring how x402's `exact` scheme names the two shapes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authorization: Option<ReceiveAuthorization>,
    /// Permit2 `PermitTransferFrom`, for tokens without EIP-3009. Requires the payer to have made
    /// a one-time on-chain `approve(PERMIT2, ...)`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permit2_authorization: Option<Permit2Authorization>,
    /// Optional EIP-2612 permit granting Permit2 its allowance, so the payer never needs gas.
    /// Only meaningful alongside `permit2Authorization`; x402 calls this `eip2612GasSponsoring`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eip2612_permit: Option<Eip2612PermitRequest>,
}

/// Wire form of an EIP-2612 permit. `owner` and `spender` are implied — the payer and the
/// canonical Permit2 — so only the signed values travel.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Eip2612PermitRequest {
    /// Approval amount. Typically `MaxUint256` so one permit covers future deposits too.
    pub value: String,
    pub deadline: String,
    pub v: u8,
    pub r: B256,
    pub s: B256,
}

impl Eip2612PermitRequest {
    pub fn parse(self) -> Result<Eip2612Permit, DepositError> {
        Ok(Eip2612Permit {
            value: parse_amount(&self.value, "eip2612Permit.value")?,
            deadline: parse_amount(&self.deadline, "eip2612Permit.deadline")?,
            v: self.v,
            r: self.r,
            s: self.s,
        })
    }
}

fn parse_amount(value: &str, field: &str) -> Result<U256, DepositError> {
    U256::from_str(value.trim())
        .map_err(|err| DepositError::InvalidRequest(format!("invalid {field}: {err}")))
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositResponse {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transaction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. Collateral is
    /// always credited to `from` — the relayer cannot redirect it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ResponseExtra>,
}

impl DepositResponse {
    pub fn success(tx_hash: B256, network: &str, intent: &DepositIntent) -> Self {
        Self {
            success: true,
            transaction: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            from: Some(format!("{:#x}", intent.authorization.from())),
            asset: Some(format!("{:#x}", intent.asset)),
            amount: Some(intent.amount.to_string()),
            ..Self::default()
        }
    }

    pub fn failure(error: &DepositError) -> Self {
        let failure = Failure::from(error);
        Self {
            success: false,
            transaction: failure.transaction.map(|hash| format!("{hash:#x}")),
            extra: ResponseExtra::failure(&failure),
            error_reason: Some(failure.reason),
            error_message: Some(failure.message),
            ..Self::default()
        }
    }
}

/// A gasless withdrawal step. `action` selects which one, and the fields it needs travel alongside.
///
/// Finalization carries no authorization: `finalizeWithdrawalFor` pays the user whoever submits it,
/// so there is nothing for the user to sign — and the grace period is weeks long, which would
/// otherwise mean signing a fresh authorization long after the request.
#[derive(Debug, Deserialize, Serialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WithdrawAction {
    Request {
        authorization: WithdrawalRequestAuthorization,
    },
    Cancel {
        authorization: WithdrawalCancelAuthorization,
    },
    Finalize {
        user: String,
        asset: String,
    },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawRequest {
    /// CAIP-2 network. Omitted uses the facilitator's default (first configured) network.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    #[serde(flatten)]
    pub action: WithdrawAction,
}

impl WithdrawRequest {
    pub fn parse(self) -> Result<WithdrawIntent, WithdrawError> {
        Ok(match self.action {
            WithdrawAction::Request { authorization } => WithdrawIntent::Request(authorization),
            WithdrawAction::Cancel { authorization } => WithdrawIntent::Cancel(authorization),
            WithdrawAction::Finalize { user, asset } => WithdrawIntent::Finalize {
                user: parse_address(&user, "user")?,
                asset: parse_address(&asset, "asset")?,
            },
        })
    }
}

fn parse_address(value: &str, field: &str) -> Result<Address, WithdrawError> {
    Address::from_str(value.trim())
        .map_err(|_| WithdrawError::InvalidRequest(format!("invalid {field} address: {value}")))
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawResponse {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transaction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. The action always
    /// applies to `user` — the relayer cannot redirect it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    /// Present for `request` only; the other actions carry no amount.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ResponseExtra>,
}

impl WithdrawResponse {
    pub fn success(tx_hash: B256, network: &str, intent: &WithdrawIntent) -> Self {
        Self {
            success: true,
            transaction: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            user: Some(format!("{:#x}", intent.user())),
            asset: Some(format!("{:#x}", intent.asset())),
            amount: intent.amount().map(|amount| amount.to_string()),
            ..Self::default()
        }
    }

    pub fn failure(error: &WithdrawError) -> Self {
        let failure = Failure::from(error);
        Self {
            success: false,
            transaction: failure.transaction.map(|hash| format!("{hash:#x}")),
            extra: ResponseExtra::failure(&failure),
            error_reason: Some(failure.reason),
            error_message: Some(failure.message),
            ..Self::default()
        }
    }
}

/// A sponsored net-credit claim. Deliberately thin: everything the transaction depends on — the
/// contract, the amount, the proof — is resolved from core, so the caller can only name *which*
/// claim to submit, not what it does.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimRequest {
    /// CAIP-2 network. Omitted uses the facilitator's default (first configured) network.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// The cycle as core names it — either the text id or the 0x-prefixed on-chain hash.
    pub cycle_id: String,
    pub creditor: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimResponse {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transaction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. The payout always
    /// goes to `creditor` — the relayer cannot redirect it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creditor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cycle_id: Option<String>,
    /// The committed net credit, as core proved it. In a Shortfall cycle the on-chain payout can
    /// be a pro-rata fraction of this.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ResponseExtra>,
}

/// A sponsored net-debit payment. The caller names the cycle and supplies the debtor's
/// authorization; the contract, the amount and the proof are resolved from core, and the
/// authorization's signature binds the receiver/spender, the amount and (as its nonce) the
/// cycle — so the caller can only decide *whether* this debit is paid, never what it pays or to
/// whom.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PayRequest {
    /// CAIP-2 network. Omitted uses the facilitator's default (first configured) network.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// The cycle as core names it — either the text id or the 0x-prefixed on-chain hash.
    pub cycle_id: String,
    /// `eip3009` (default) or `permit2`, matching the deposit endpoint. Optional — the
    /// authorization field that is present already identifies the scheme — but a mismatch is
    /// rejected rather than silently ignored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_transfer_method: Option<String>,
    /// EIP-3009 `receiveWithAuthorization`. Exactly one of this and `permit2Authorization` must
    /// be present. The debtor is the authorization's `from`; there is no separate field to
    /// disagree with it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub authorization: Option<ReceiveAuthorization>,
    /// Permit2 `PermitTransferFrom`, for tokens without EIP-3009. Requires the debtor to have made
    /// a one-time on-chain `approve(PERMIT2, ...)`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permit2_authorization: Option<Permit2Authorization>,
    /// Optional EIP-2612 permit granting Permit2 its allowance, so the debtor never needs gas.
    /// Only meaningful alongside `permit2Authorization`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eip2612_permit: Option<Eip2612PermitRequest>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayResponse {
    pub success: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transaction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. The funds always
    /// come from `debtor` — the signer — and go into the cycle's escrow.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debtor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cycle_id: Option<String>,
    /// The committed net debit, as core proved it and the debtor signed it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ResponseExtra>,
}

impl PayResponse {
    pub fn success(tx_hash: B256, network: &str, terms: &PayTerms) -> Self {
        Self {
            success: true,
            transaction: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            debtor: Some(format!("{:#x}", terms.debtor)),
            cycle_id: Some(format!("{:#x}", terms.cycle_id)),
            amount: Some(terms.amount.to_string()),
            ..Self::default()
        }
    }

    pub fn failure(error: &PayError) -> Self {
        let failure = Failure::from(error);
        Self {
            success: false,
            transaction: failure.transaction.map(|hash| format!("{hash:#x}")),
            extra: ResponseExtra::failure(&failure),
            error_reason: Some(failure.reason),
            error_message: Some(failure.message),
            ..Self::default()
        }
    }
}

impl ClaimResponse {
    pub fn success(tx_hash: B256, network: &str, terms: &ClaimTerms) -> Self {
        Self {
            success: true,
            transaction: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            creditor: Some(format!("{:#x}", terms.creditor)),
            cycle_id: Some(format!("{:#x}", terms.cycle_id)),
            amount: Some(terms.amount.to_string()),
            ..Self::default()
        }
    }

    pub fn failure(error: &ClaimError) -> Self {
        let failure = Failure::from(error);
        Self {
            success: false,
            transaction: failure.transaction.map(|hash| format!("{hash:#x}")),
            extra: ResponseExtra::failure(&failure),
            error_reason: Some(failure.reason),
            error_message: Some(failure.message),
            ..Self::default()
        }
    }
}

/// The answer from x402's `/settle`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleResponse {
    pub success: bool,
    /// A machine-readable reason, such as `invalid_4mica_credit_checkpoint_required`. Absent on
    /// success.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payer: Option<String>,
    /// The settlement transaction, or empty when none was broadcast, as for an issued guarantee.
    #[serde(default)]
    pub transaction: String,
    pub network: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<ResponseExtra>,
}

impl SettleResponse {
    pub fn failed(failure: Failure, network: &str) -> Self {
        Self {
            success: false,
            extra: ResponseExtra::failure(&failure),
            error_reason: Some(failure.reason),
            error_message: Some(failure.message),
            payer: None,
            transaction: String::new(),
            network: network.to_string(),
        }
    }

    pub fn from_exact(
        success: bool,
        error_reason: Option<String>,
        payer: Option<String>,
        transaction: Option<String>,
        network: String,
    ) -> Self {
        Self {
            success,
            error_reason,
            error_message: None,
            payer,
            transaction: transaction.unwrap_or_default(),
            network,
            extra: None,
        }
    }

    pub fn issued(network: &str, payer: &str, receipt: GuaranteeReceipt) -> Self {
        Self {
            success: true,
            error_reason: None,
            error_message: None,
            payer: Some(payer.to_string()),
            transaction: String::new(),
            network: network.to_string(),
            extra: Some(ResponseExtra {
                receipt: Some(receipt),
                ..ResponseExtra::default()
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error_code::ErrorCode;
    use crate::issuer::IssueError;
    use serde_json::json;

    #[test]
    fn a_refused_guarantee_carries_its_reason_and_cores_details() {
        let err = ValidationError::IssueGuarantee(IssueError {
            message: "payer must submit a checkpoint".into(),
            original_code: Some("CHECKPOINT_REQUIRED".into()),
            details: Some(json!({ "uncheckpointed": 64 })),
            refused: true,
        });

        let failure = err.failure(ErrorCode::UnexpectedSettleError);
        let body = serde_json::to_value(SettleResponse::failed(failure, "eip155:1")).unwrap();
        assert_eq!(body["success"], false);
        assert_eq!(
            body["errorReason"],
            "invalid_4mica_credit_checkpoint_required"
        );
        assert_eq!(body["errorMessage"], "payer must submit a checkpoint");
        assert_eq!(body["transaction"], "");
        assert_eq!(body["network"], "eip155:1");
        assert_eq!(body["extra"]["retryable"], false);
        assert_eq!(body["extra"]["details"]["uncheckpointed"], 64);
        assert!(body["extra"].get("receipt").is_none());
    }

    #[test]
    fn a_mismatch_reports_its_own_reason_without_details() {
        let err = ValidationError::Mismatch(
            ErrorCode::AmountMismatch,
            "payment amount 1 does not match amount 2".into(),
        );

        let body = serde_json::to_value(VerifyResponse::invalid(
            err.failure(ErrorCode::UnexpectedVerifyError),
        ))
        .unwrap();
        assert_eq!(body["isValid"], false);
        assert_eq!(
            body["invalidReason"],
            "invalid_4mica_credit_amount_mismatch"
        );
        assert_eq!(
            body["invalidMessage"],
            "payment amount 1 does not match amount 2"
        );
        assert!(body["extra"].get("details").is_none());
    }

    #[test]
    fn an_unexpected_failure_takes_the_phase_reason() {
        let err = ValidationError::InvalidReceipt("receipt amount 0x1 differs".into());

        assert_eq!(
            err.failure(ErrorCode::UnexpectedSettleError).reason,
            "unexpected_settle_error"
        );
    }

    #[test]
    fn a_pending_deposit_carries_its_transaction() {
        let tx_hash = B256::repeat_byte(0xab);
        let err = DepositError::ReceiptUnavailable {
            tx_hash,
            reason: "timed out".into(),
        };

        let body = serde_json::to_value(DepositResponse::failure(&err)).unwrap();
        assert_eq!(body["errorReason"], "settlement_pending");
        assert_eq!(body["transaction"], format!("{tx_hash:#x}"));
        assert_eq!(body["extra"]["retryable"], false);
    }
}
