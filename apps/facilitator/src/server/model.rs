use std::collections::HashMap;

use rpc::PaymentGuaranteeRequest;
use sdk_4mica::BLSCert;
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
    pub payload: PaymentGuaranteeRequest,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X402PaymentPayloadV2 {
    pub x402_version: X402Version<2>,
    pub accepted: PaymentRequirements,
    pub payload: PaymentGuaranteeRequest,
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

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResponse {
    pub is_valid: bool,
    pub invalid_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate: Option<CertificateResponse>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CertificateResponse {
    pub claims: String,
    pub signature: String,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositVerifyResponse {
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    /// Stable code so clients branch on this rather than parsing `invalidReason`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// True when retrying the identical request may succeed — throttling and transient chain
    /// errors. A bad signature or an expired authorization will never become valid.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    /// Present with `PERMIT2_ALLOWANCE_REQUIRED`. See [`Permit2AllowanceResponse`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permit2_allowance: Option<Permit2AllowanceResponse>,
}

/// What a client needs to satisfy a missing Permit2 approval, so it need not read the chain.
///
/// `eip2612Nonce` is the only value a chain-free client cannot derive: the token's domain
/// separator already comes from core's `/core/tokens`, and the spender is the canonical Permit2.
/// Present means the approval can be sponsored — sign an `eip2612Permit` and retry. Absent means
/// the token has no EIP-2612 surface, so the payer must submit `approve(PERMIT2, …)` themselves.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permit2AllowanceResponse {
    pub spender: String,
    pub allowance: String,
    pub required: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub eip2612_nonce: Option<String>,
}

impl Permit2AllowanceResponse {
    fn from_error(error: &DepositError) -> Option<Self> {
        error.permit2_allowance_details().map(Self::from_details)
    }

    fn from_pay_error(error: &PayError) -> Option<Self> {
        error.permit2_allowance_details().map(Self::from_details)
    }

    fn from_details(details: &crate::deposit::Permit2AllowanceDetails) -> Self {
        Self {
            spender: format!("{:#x}", details.spender),
            allowance: details.allowance.to_string(),
            required: details.required.to_string(),
            eip2612_nonce: details.eip2612_nonce.map(|nonce| nonce.to_string()),
        }
    }
}

impl DepositVerifyResponse {
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            invalid_reason: None,
            error_code: None,
            retryable: None,
            permit2_allowance: None,
        }
    }

    pub fn invalid(error: &DepositError) -> Self {
        Self {
            is_valid: false,
            invalid_reason: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
            permit2_allowance: Permit2AllowanceResponse::from_error(error),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepositResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. Collateral is
    /// always credited to `from` — the relayer cannot redirect it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// See [`DepositVerifyResponse::retryable`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    /// Present with `PERMIT2_ALLOWANCE_REQUIRED`. See [`Permit2AllowanceResponse`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permit2_allowance: Option<Permit2AllowanceResponse>,
}

impl DepositResponse {
    pub fn success(tx_hash: B256, network: &str, intent: &DepositIntent) -> Self {
        Self {
            success: true,
            tx_hash: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            from: Some(format!("{:#x}", intent.authorization.from())),
            asset: Some(format!("{:#x}", intent.asset)),
            amount: Some(intent.amount.to_string()),
            error: None,
            error_code: None,
            retryable: None,
            permit2_allowance: None,
        }
    }

    pub fn failure(error: &DepositError) -> Self {
        Self {
            success: false,
            tx_hash: None,
            network: None,
            from: None,
            asset: None,
            amount: None,
            error: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
            permit2_allowance: Permit2AllowanceResponse::from_error(error),
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawVerifyResponse {
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    /// Stable code so clients branch on this rather than parsing `invalidReason`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// True when retrying the identical request may succeed — throttling and transient chain
    /// errors. A bad signature or an expired authorization will never become valid.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

impl WithdrawVerifyResponse {
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            invalid_reason: None,
            error_code: None,
            retryable: None,
        }
    }

    pub fn invalid(error: &WithdrawError) -> Self {
        Self {
            is_valid: false,
            invalid_reason: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WithdrawResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. The action always
    /// applies to `user` — the relayer cannot redirect it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset: Option<String>,
    /// Present for `request` only; the other actions carry no amount.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// See [`WithdrawVerifyResponse::retryable`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

impl WithdrawResponse {
    pub fn success(tx_hash: B256, network: &str, intent: &WithdrawIntent) -> Self {
        Self {
            success: true,
            tx_hash: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            user: Some(format!("{:#x}", intent.user())),
            asset: Some(format!("{:#x}", intent.asset())),
            amount: intent.amount().map(|amount| amount.to_string()),
            error: None,
            error_code: None,
            retryable: None,
        }
    }

    pub fn failure(error: &WithdrawError) -> Self {
        Self {
            success: false,
            tx_hash: None,
            network: None,
            user: None,
            asset: None,
            amount: None,
            error: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimVerifyResponse {
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    /// Stable code so clients branch on this rather than parsing `invalidReason`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// See [`WithdrawVerifyResponse::retryable`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

impl ClaimVerifyResponse {
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            invalid_reason: None,
            error_code: None,
            retryable: None,
        }
    }

    pub fn invalid(error: &ClaimError) -> Self {
        Self {
            is_valid: false,
            invalid_reason: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. The payout always
    /// goes to `creditor` — the relayer cannot redirect it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creditor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cycle_id: Option<String>,
    /// The committed net credit, as core proved it. In a Shortfall cycle the on-chain payout can
    /// be a pro-rata fraction of this.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// See [`WithdrawVerifyResponse::retryable`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayVerifyResponse {
    pub is_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invalid_reason: Option<String>,
    /// Stable code so clients branch on this rather than parsing `invalidReason`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// See [`WithdrawVerifyResponse::retryable`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    /// Present with `PERMIT2_ALLOWANCE_REQUIRED`. See [`Permit2AllowanceResponse`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permit2_allowance: Option<Permit2AllowanceResponse>,
}

impl PayVerifyResponse {
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            invalid_reason: None,
            error_code: None,
            retryable: None,
            permit2_allowance: None,
        }
    }

    pub fn invalid(error: &PayError) -> Self {
        Self {
            is_valid: false,
            invalid_reason: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
            permit2_allowance: Permit2AllowanceResponse::from_pay_error(error),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    /// Echoed back so a caller can reconcile without re-parsing its own request. The funds always
    /// come from `debtor` — the signer — and go into the cycle's escrow.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debtor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cycle_id: Option<String>,
    /// The committed net debit, as core proved it and the debtor signed it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    /// See [`WithdrawVerifyResponse::retryable`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    /// Present with `PERMIT2_ALLOWANCE_REQUIRED`. See [`Permit2AllowanceResponse`].
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permit2_allowance: Option<Permit2AllowanceResponse>,
}

impl PayResponse {
    pub fn success(tx_hash: B256, network: &str, terms: &PayTerms) -> Self {
        Self {
            success: true,
            tx_hash: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            debtor: Some(format!("{:#x}", terms.debtor)),
            cycle_id: Some(format!("{:#x}", terms.cycle_id)),
            amount: Some(terms.amount.to_string()),
            error: None,
            error_code: None,
            retryable: None,
            permit2_allowance: None,
        }
    }

    pub fn failure(error: &PayError) -> Self {
        Self {
            success: false,
            tx_hash: None,
            network: None,
            debtor: None,
            cycle_id: None,
            amount: None,
            error: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
            permit2_allowance: Permit2AllowanceResponse::from_pay_error(error),
        }
    }
}

impl ClaimResponse {
    pub fn success(tx_hash: B256, network: &str, terms: &ClaimTerms) -> Self {
        Self {
            success: true,
            tx_hash: Some(format!("{tx_hash:#x}")),
            network: Some(network.to_string()),
            creditor: Some(format!("{:#x}", terms.creditor)),
            cycle_id: Some(format!("{:#x}", terms.cycle_id)),
            amount: Some(terms.amount.to_string()),
            error: None,
            error_code: None,
            retryable: None,
        }
    }

    pub fn failure(error: &ClaimError) -> Self {
        Self {
            success: false,
            tx_hash: None,
            network: None,
            creditor: None,
            cycle_id: None,
            amount: None,
            error: Some(error.to_string()),
            error_code: Some(error.code().to_string()),
            retryable: Some(error.is_retryable()),
        }
    }
}

impl From<BLSCert> for CertificateResponse {
    fn from(cert: BLSCert) -> Self {
        Self {
            claims: format!("0x{}", cert.claims().to_hex()),
            signature: format!("0x{}", cert.signature().to_hex()),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleResponse {
    pub success: bool,
    pub error: Option<String>,
    pub tx_hash: Option<String>,
    pub network_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate: Option<CertificateResponse>,
}

impl SettleResponse {
    pub fn invalid(reason: String, network: &str) -> Self {
        Self {
            success: false,
            error: Some(reason),
            tx_hash: None,
            network_id: Some(network.to_string()),
            certificate: None,
        }
    }

    pub fn from_exact(
        success: bool,
        error: Option<String>,
        tx_hash: Option<String>,
        network: String,
    ) -> Self {
        Self {
            success,
            error,
            tx_hash,
            network_id: Some(network),
            certificate: None,
        }
    }

    pub fn four_mica_success(network: &str, certificate: CertificateResponse) -> Self {
        Self {
            success: true,
            error: None,
            tx_hash: None,
            network_id: Some(network.to_string()),
            certificate: Some(certificate),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto::bls::{KeyMaterial, Zeroizing};

    #[test]
    fn certificate_response_from_bls_cert_preserves_hex_fields() {
        let key = KeyMaterial::from_bytes(Zeroizing::new(vec![7u8; 32])).expect("secret key");
        let cert = BLSCert::sign(&key, vec![0xab, 0xcd].into()).expect("sign cert");

        let response = CertificateResponse::from(cert);
        assert_eq!(response.claims, "0xabcd");
        assert!(response.signature.starts_with("0x"));
    }
}
