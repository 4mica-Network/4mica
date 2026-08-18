//! Claim-sponsorship failures, and how chain errors are turned into them.
//!
//! Mirrors [`crate::withdraw::error`], reusing the same code strings wherever the meaning is the
//! same, so a client's handling of `RATE_LIMITED` or `SIMULATION_REVERTED` does not depend on which
//! endpoint produced it.

use alloy::primitives::{Address, B256, U256};
use alloy::sol_types::SolInterface;
use thiserror::Error;

use crate::limits::ThrottleError;
use crate::relayer::{ClearingHouse::ClearingHouseErrors, NoRelayer};

#[derive(Debug, Error)]
pub enum ClaimError {
    #[error("{0}")]
    InvalidRequest(String),
    #[error("gas sponsorship is not enabled on this facilitator")]
    NoRelayerConfigured,
    #[error("no relayer is configured for network {0}")]
    NoRelayer(String),
    /// Core would not serve the cycle's terms — an unknown cycle, a participant with no committed
    /// leaf, or an authorization problem between this facilitator and core.
    #[error("could not resolve the clearing action from core: {0}")]
    ActionUnavailable(String),
    /// Core answered, but about a debit rather than the credit that was asked for.
    #[error("core returned a {returned} action for a net-credit claim")]
    ActionMismatch { returned: String },
    #[error("claim would revert: {0}")]
    SimulationReverted(String),
    #[error("chain error: {0:#}")]
    Chain(#[from] anyhow::Error),
    /// Nothing was submitted — safe to retry.
    #[error("failed to broadcast claim: {0}")]
    Broadcast(String),
    /// The transaction *was* broadcast but its outcome is unknown. Distinct from [`Self::Broadcast`]
    /// because retrying risks a double submission; poll `tx_hash` instead.
    #[error("claim {tx_hash} was broadcast but its receipt could not be read: {reason}")]
    ReceiptUnavailable { tx_hash: B256, reason: String },
    /// Mined and reverted, so gas *was* spent. Distinct from [`Self::SimulationReverted`], which
    /// means we declined before spending anything.
    #[error("claim {tx_hash} reverted on-chain")]
    RevertedOnChain { tx_hash: B256 },
    #[error("too many claim requests; retry shortly")]
    RateLimited,
    #[error("address {address} has exceeded its claim rate limit; retry shortly")]
    AddressRateLimited { address: Address },
    #[error("too many claims in flight; retry shortly")]
    TooManyInFlight,
    #[error("this claim is already being submitted")]
    DuplicateInFlight,
    #[error("relayer balance {balance} is at or below the configured floor {floor}")]
    RelayerBalanceTooLow { balance: U256, floor: U256 },
    #[error("claim needs {estimated} gas, above the sponsored ceiling of {ceiling}")]
    GasCeilingExceeded { estimated: u64, ceiling: u64 },
}

impl From<NoRelayer> for ClaimError {
    fn from(err: NoRelayer) -> Self {
        match err {
            NoRelayer::NotConfigured => Self::NoRelayerConfigured,
            NoRelayer::Network(network) => Self::NoRelayer(network),
        }
    }
}

impl From<ThrottleError> for ClaimError {
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

impl ClaimError {
    /// Stable, machine-readable code so clients can branch without string matching.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest(_) => "INVALID_REQUEST",
            Self::NoRelayerConfigured => "NO_RELAYER_CONFIGURED",
            Self::NoRelayer(_) => "NO_RELAYER",
            Self::ActionUnavailable(_) => "ACTION_UNAVAILABLE",
            Self::ActionMismatch { .. } => "ACTION_MISMATCH",
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
    /// A claim is unusual among the sponsored actions in that an underfunded cycle *does* become
    /// claimable once debtors pay, but that is not visible from the revert alone, so it is left to
    /// the caller rather than guessed at here.
    ///
    /// Deliberately excludes [`Self::ReceiptUnavailable`]: that transaction may still land, so a
    /// retry risks paying the creditor twice.
    pub fn is_retryable(&self) -> bool {
        self.is_throttling()
            || matches!(
                self,
                Self::RelayerBalanceTooLow { .. } | Self::Chain(_) | Self::ActionUnavailable(_)
            )
    }
}

/// Splits an alloy contract error into "the claim would revert" and "the node is unreachable".
///
/// Collapsing both into one variant would report an RPC outage as a permanent, non-retryable
/// revert. Reverts decode against the ClearingHouse error ABI, so a caller sees `AlreadyClaimed`
/// rather than a bare selector.
pub(super) fn classify_call_error(err: alloy::contract::Error) -> ClaimError {
    let Some(data) = err.as_revert_data() else {
        return ClaimError::Chain(anyhow::Error::new(err).context("claim simulation"));
    };

    let reason = ClearingHouseErrors::abi_decode(&data)
        .map(describe)
        .unwrap_or_else(|_| {
            alloy::sol_types::decode_revert_reason(&data)
                .unwrap_or_else(|| format!("revert data 0x{}", hex::encode(&data)))
        });
    ClaimError::SimulationReverted(reason)
}

fn describe(error: ClearingHouseErrors) -> String {
    match error {
        ClearingHouseErrors::AmountZero(_) => "claim amount is zero".to_string(),
        ClearingHouseErrors::CycleNotFound(e) => {
            format!("clearing cycle {:#x} does not exist on-chain", e.cycleId)
        }
        ClearingHouseErrors::InvalidCycleStatus(e) => format!(
            "clearing cycle {:#x} is in status {} and cannot be claimed against",
            e.cycleId, e.status
        ),
        ClearingHouseErrors::InvalidProof(_) => {
            "the Merkle proof does not prove this creditor and amount".to_string()
        }
        ClearingHouseErrors::AlreadyClaimed(e) => {
            format!("creditor {} has already claimed this cycle", e.creditor)
        }
        ClearingHouseErrors::ClaimExceedsFundedLiquidity(e) => format!(
            "cycle holds {} but the claim needs {}",
            e.available, e.requested
        ),
        ClearingHouseErrors::CycleUnderfunded(e) => format!(
            "cycle is funded to {} of the {} required; it becomes claimable once debtors pay",
            e.available, e.required
        ),
        ClearingHouseErrors::ClaimedCreditExceedsCommitted(e) => format!(
            "claim would take total claims to {}, above the committed {}",
            e.attempted, e.total
        ),
        ClearingHouseErrors::NativeTransferFailed(e) => {
            format!(
                "paying {} failed; it may reject native transfers",
                e.recipient
            )
        }
        ClearingHouseErrors::ClaimConversionShortfall(e) => {
            format!("escrow returned {} of the {} requested", e.got, e.requested)
        }
        ClearingHouseErrors::PaymentFinalityPending(e) => {
            format!(
                "cycle is not claimable until its finality deadline {}",
                e.deadline
            )
        }
    }
}
