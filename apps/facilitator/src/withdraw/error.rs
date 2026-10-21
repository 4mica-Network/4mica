//! Withdrawal-sponsorship failures, and how chain errors are turned into them.
//!
//! Mirrors [`crate::deposit::error`]: every variant maps to an [`ErrorCode`], and
//! [`is_retryable`](WithdrawError::is_retryable) says whether repeating the identical request could
//! ever help. Where the meaning is the same the code is too, so a client's handling of
//! `rate_limited` or `invalid_signature` does not depend on which endpoint produced it.

use alloy::primitives::{Address, B256, U256};
use thiserror::Error;

use crate::deposit::classify_core4mica_revert;
use crate::error_code::{ErrorCode, Refusal};
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

impl Refusal for WithdrawError {
    fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidRequest(_) => ErrorCode::InvalidPayload,
            Self::MalformedSignature(_) | Self::SignatureMismatch { .. } => {
                ErrorCode::InvalidSignature
            }
            Self::NoRelayerConfigured | Self::NoRelayer(_) => ErrorCode::SponsorshipUnavailable,
            Self::Expired { .. } => ErrorCode::AuthorizationExpired,
            Self::NotYetValid { .. } => ErrorCode::AuthorizationNotYetValid,
            Self::NonceAlreadyUsed => ErrorCode::NonceAlreadyUsed,
            Self::SimulationReverted(_) => ErrorCode::SimulationReverted,
            Self::Chain(_) => ErrorCode::ChainUnavailable,
            Self::Broadcast(_) => ErrorCode::BroadcastFailed,
            Self::ReceiptUnavailable { .. } => ErrorCode::SettlementPending,
            Self::RevertedOnChain { .. } => ErrorCode::InvalidTransactionState,
            Self::RateLimited | Self::AddressRateLimited { .. } | Self::TooManyInFlight => {
                ErrorCode::RateLimited
            }
            Self::DuplicateInFlight => ErrorCode::DuplicateInFlight,
            Self::RelayerBalanceTooLow { .. } => ErrorCode::RelayerUnderfunded,
            Self::GasCeilingExceeded { .. } => ErrorCode::GasCeilingExceeded,
        }
    }

    fn retryable(&self) -> bool {
        self.is_retryable()
    }

    fn transaction(&self) -> Option<B256> {
        match self {
            Self::ReceiptUnavailable { tx_hash, .. } | Self::RevertedOnChain { tx_hash } => {
                Some(*tx_hash)
            }
            _ => None,
        }
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
