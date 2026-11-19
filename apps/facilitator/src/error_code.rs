//! The reasons the facilitator gives when it refuses a request.
//!
//! Standard x402 reasons are used wherever one fits, so a generic x402 client can act on them.
//! Reasons specific to the `4mica-credit` scheme follow the x402 convention of prefixing the
//! scheme (`invalid_4mica_credit_*`); the sponsored endpoints, which are not part of x402, use
//! plain names.

use std::fmt;

use alloy::primitives::B256;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    // Standard x402 reasons.
    InsufficientFunds,
    InvalidNetwork,
    InvalidPayload,
    InvalidPaymentRequirements,
    InvalidTransactionState,
    InvalidX402Version,
    SettlementPending,
    UnexpectedSettleError,
    UnexpectedVerifyError,
    UnsupportedScheme,

    // The 4mica-credit scheme.
    AmountMismatch,
    AssetMismatch,
    CheckpointRequired,
    CycleMismatch,
    DuplicateRequest,
    FutureTimestamp,
    PayerNotRegistered,
    PayerSuspended,
    RecipientMismatch,
    StaleTimestamp,
    TimestampNotPastCutoff,
    ValidationMismatch,
    ValidatorNotAllowed,

    // Sponsored deposits, withdrawals, claims and payments.
    BroadcastFailed,
    ChainUnavailable,
    ClearingActionMismatch,
    ClearingActionUnavailable,
    DuplicateInFlight,
    AuthorizationExpired,
    AuthorizationNotYetValid,
    GasCeilingExceeded,
    InvalidSignature,
    NonceAlreadyUsed,
    Permit2AllowanceRequired,
    RateLimited,
    RelayerUnderfunded,
    SimulationReverted,
    SponsorshipUnavailable,
    UnsupportedTransferMethod,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InsufficientFunds => "insufficient_funds",
            Self::InvalidNetwork => "invalid_network",
            Self::InvalidPayload => "invalid_payload",
            Self::InvalidPaymentRequirements => "invalid_payment_requirements",
            Self::InvalidTransactionState => "invalid_transaction_state",
            Self::InvalidX402Version => "invalid_x402_version",
            Self::SettlementPending => "settlement_pending",
            Self::UnexpectedSettleError => "unexpected_settle_error",
            Self::UnexpectedVerifyError => "unexpected_verify_error",
            Self::UnsupportedScheme => "unsupported_scheme",

            Self::AmountMismatch => "invalid_4mica_credit_amount_mismatch",
            Self::AssetMismatch => "invalid_4mica_credit_asset_mismatch",
            Self::CheckpointRequired => "invalid_4mica_credit_checkpoint_required",
            Self::CycleMismatch => "invalid_4mica_credit_cycle_mismatch",
            Self::DuplicateRequest => "invalid_4mica_credit_duplicate_request",
            Self::FutureTimestamp => "invalid_4mica_credit_future_timestamp",
            Self::PayerNotRegistered => "invalid_4mica_credit_payer_not_registered",
            Self::PayerSuspended => "invalid_4mica_credit_payer_suspended",
            Self::RecipientMismatch => "invalid_4mica_credit_recipient_mismatch",
            Self::StaleTimestamp => "invalid_4mica_credit_stale_timestamp",
            Self::TimestampNotPastCutoff => "invalid_4mica_credit_timestamp_not_past_cutoff",
            Self::ValidationMismatch => "invalid_4mica_credit_validation_mismatch",
            Self::ValidatorNotAllowed => "invalid_4mica_credit_validator_not_allowed",

            Self::BroadcastFailed => "broadcast_failed",
            Self::ChainUnavailable => "chain_unavailable",
            Self::ClearingActionMismatch => "clearing_action_mismatch",
            Self::ClearingActionUnavailable => "clearing_action_unavailable",
            Self::DuplicateInFlight => "duplicate_in_flight",
            Self::AuthorizationExpired => "authorization_expired",
            Self::AuthorizationNotYetValid => "authorization_not_yet_valid",
            Self::GasCeilingExceeded => "gas_ceiling_exceeded",
            Self::InvalidSignature => "invalid_signature",
            Self::NonceAlreadyUsed => "nonce_already_used",
            Self::Permit2AllowanceRequired => "permit2_allowance_required",
            Self::RateLimited => "rate_limited",
            Self::RelayerUnderfunded => "relayer_underfunded",
            Self::SimulationReverted => "simulation_reverted",
            Self::SponsorshipUnavailable => "sponsorship_unavailable",
            Self::UnsupportedTransferMethod => "unsupported_transfer_method",
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// An error the facilitator reports to its caller.
///
/// `Display` is the full story and goes to the logs. [`Self::public_message`] is what the caller
/// reads, and the two differ wherever the full story would carry something that is not the
/// caller's business: an upstream error string (which can embed an RPC or core URL, credentials
/// included), the relayer's balance, or a configured limit.
pub trait Refusal: fmt::Display {
    fn code(&self) -> ErrorCode;

    /// The message put in the response. Defaults to `Display`; override for variants that wrap
    /// upstream errors or internal state.
    fn public_message(&self) -> String {
        self.to_string()
    }

    /// Whether repeating the identical request later may succeed.
    fn retryable(&self) -> bool;

    /// What the caller needs to act on [`Self::code`], when the message alone is not enough.
    fn details(&self) -> Option<Value> {
        None
    }

    /// The transaction this request already broadcast, when it failed after broadcasting.
    fn transaction(&self) -> Option<B256> {
        None
    }
}

/// A refusal reduced to what every response reports.
#[derive(Debug, Clone)]
pub struct Failure {
    pub reason: String,
    pub message: String,
    pub retryable: bool,
    pub details: Option<Value>,
    pub transaction: Option<B256>,
}

impl<E: Refusal + ?Sized> From<&E> for Failure {
    fn from(err: &E) -> Self {
        Self {
            reason: err.code().to_string(),
            message: err.public_message(),
            retryable: err.retryable(),
            details: err.details(),
            transaction: err.transaction(),
        }
    }
}
