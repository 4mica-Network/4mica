//! Withdrawal-sponsorship failures, and how chain errors are turned into them.
//!
//! Mirrors [`crate::deposit::error`]: every variant carries a stable
//! [`code`](WithdrawError::code) so callers branch on an identifier rather than on prose, and
//! [`is_retryable`](WithdrawError::is_retryable) says whether repeating the identical request could
//! ever help. The codes are deliberately the same strings where the meaning is the same, so a
//! client's handling of `RATE_LIMITED` or `SIGNATURE_MISMATCH` does not depend on which endpoint
//! produced it.

use alloy::primitives::{Address, B256, U256};
use thiserror::Error;

use crate::deposit::classify_core4mica_revert;
use crate::limits::ThrottleError;
use crate::relayer::NoRelayer;

#[derive(Debug, Error)]
pub enum WithdrawError {
    #[error("{0}")]
    InvalidRequest(String),
    #[error("malformed signature: {0}")]
    MalformedSignature(String),
    #[error("gas sponsorship is not enabled on this facilitator")]
    NoRelayerConfigured,
    #[error("no relayer is configured for network {0}")]
    NoRelayer(String),
    #[error("authorization expired at {valid_before} (now {now})")]
    Expired { valid_before: u64, now: u64 },
    #[error("authorization is not valid until {valid_after} (now {now})")]
    NotYetValid { valid_after: u64, now: u64 },
    #[error("signature recovers to {recovered}, not the declared user {declared}")]
    SignatureMismatch {
        recovered: Address,
        declared: Address,
    },
    #[error("authorization nonce has already been used")]
    NonceAlreadyUsed,
    #[error("withdrawal would revert: {0}")]
    SimulationReverted(String),
    #[error("chain error: {0:#}")]
    Chain(#[from] anyhow::Error),
    /// Nothing was submitted — safe to retry with the same authorization.
    #[error("failed to broadcast withdrawal: {0}")]
    Broadcast(String),
    /// The transaction *was* broadcast but its outcome is unknown. Distinct from [`Self::Broadcast`]
    /// because retrying risks a double submission; poll `tx_hash` instead.
    #[error("withdrawal {tx_hash} was broadcast but its receipt could not be read: {reason}")]
    ReceiptUnavailable { tx_hash: B256, reason: String },
    /// Mined and reverted, so gas *was* spent. Distinct from [`Self::SimulationReverted`], which
    /// means we declined before spending anything.
    #[error("withdrawal {tx_hash} reverted on-chain")]
    RevertedOnChain { tx_hash: B256 },
    #[error("too many withdrawal requests; retry shortly")]
    RateLimited,
    #[error("address {address} has exceeded its withdrawal rate limit; retry shortly")]
    AddressRateLimited { address: Address },
    #[error("too many withdrawals in flight; retry shortly")]
    TooManyInFlight,
    #[error("this authorization is already being submitted")]
    DuplicateInFlight,
    #[error("relayer balance {balance} is at or below the configured floor {floor}")]
    RelayerBalanceTooLow { balance: U256, floor: U256 },
    #[error("withdrawal needs {estimated} gas, above the sponsored ceiling of {ceiling}")]
    GasCeilingExceeded { estimated: u64, ceiling: u64 },
}

impl From<NoRelayer> for WithdrawError {
    fn from(err: NoRelayer) -> Self {
        match err {
            NoRelayer::NotConfigured => Self::NoRelayerConfigured,
            NoRelayer::Network(network) => Self::NoRelayer(network),
        }
    }
}

impl From<ThrottleError> for WithdrawError {
    fn from(err: ThrottleError) -> Self {
        match err {
            ThrottleError::RateLimited => Self::RateLimited,
            ThrottleError::AddressRateLimited { address } => Self::AddressRateLimited { address },
            ThrottleError::TooManyInFlight => Self::TooManyInFlight,
            ThrottleError::DuplicateInFlight => Self::DuplicateInFlight,
            ThrottleError::RelayerBalanceTooLow { balance, floor } => {
                Self::RelayerBalanceTooLow { balance, floor }
            }
        }
    }
}

impl WithdrawError {
    /// Stable, machine-readable code so clients can branch without string matching.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest(_) => "INVALID_REQUEST",
            Self::MalformedSignature(_) => "MALFORMED_SIGNATURE",
            Self::NoRelayerConfigured => "NO_RELAYER_CONFIGURED",
            Self::NoRelayer(_) => "NO_RELAYER",
            Self::Expired { .. } => "EXPIRED",
            Self::NotYetValid { .. } => "NOT_YET_VALID",
            Self::SignatureMismatch { .. } => "SIGNATURE_MISMATCH",
            Self::NonceAlreadyUsed => "NONCE_ALREADY_USED",
            Self::SimulationReverted(_) => "SIMULATION_REVERTED",
            Self::Chain(_) => "CHAIN_ERROR",
            Self::Broadcast(_) => "BROADCAST_FAILED",
            Self::ReceiptUnavailable { .. } => "RECEIPT_UNAVAILABLE",
            Self::RevertedOnChain { .. } => "REVERTED_ON_CHAIN",
            Self::RateLimited => "RATE_LIMITED",
            Self::AddressRateLimited { .. } => "ADDRESS_RATE_LIMITED",
            Self::TooManyInFlight => "TOO_MANY_IN_FLIGHT",
            Self::DuplicateInFlight => "DUPLICATE_IN_FLIGHT",
            Self::RelayerBalanceTooLow { .. } => "RELAYER_BALANCE_TOO_LOW",
            Self::GasCeilingExceeded { .. } => "GAS_CEILING_EXCEEDED",
        }
    }

    /// Whether this rejection came from throttling rather than the request itself. The single
    /// source of truth for both [`Self::is_retryable`] and the abuse counters.
    pub fn is_throttling(&self) -> bool {
        matches!(
            self,
            Self::RateLimited
                | Self::AddressRateLimited { .. }
                | Self::TooManyInFlight
                | Self::DuplicateInFlight
        )
    }

    /// Whether the caller should retry the same request later, as opposed to changing it.
    ///
    /// Deliberately excludes [`Self::ReceiptUnavailable`]: that transaction may still land, so a
    /// retry risks submitting twice.
    pub fn is_retryable(&self) -> bool {
        self.is_throttling() || matches!(self, Self::RelayerBalanceTooLow { .. } | Self::Chain(_))
    }
}

/// Splits an alloy contract error into "the withdrawal would revert" and "the node is unreachable".
///
/// Collapsing both into one variant would report an RPC outage as a permanent, non-retryable
/// revert.
pub(super) fn classify_call_error(err: alloy::contract::Error) -> WithdrawError {
    match classify_core4mica_revert(&err) {
        Some(reason) => WithdrawError::SimulationReverted(reason),
        None => WithdrawError::Chain(anyhow::Error::new(err).context("withdrawal simulation")),
    }
}
