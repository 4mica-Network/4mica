//! Deposit failures, and how chain errors are turned into them.
//!
//! Every variant carries a stable [`code`](DepositError::code) so callers branch on an identifier
//! rather than on prose, and [`is_retryable`](DepositError::is_retryable) says whether repeating
//! the identical request could ever help.
//!
//! The distinctions worth knowing are the ones a client acts on differently:
//!
//! * [`Broadcast`](DepositError::Broadcast) — nothing was submitted, safe to retry.
//! * [`ReceiptUnavailable`](DepositError::ReceiptUnavailable) — it *was* submitted and may still
//!   land, so retrying risks a second deposit.
//! * [`RevertedOnChain`](DepositError::RevertedOnChain) — mined and reverted, so gas was spent.
//! * [`SimulationReverted`](DepositError::SimulationReverted) — we declined before spending
//!   anything.

use alloy::primitives::{Address, B256, U256};
use sdk_4mica::contract::Core4Mica::Core4MicaErrors;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DepositError {
    #[error("{0}")]
    InvalidRequest(String),
    #[error("malformed signature: {0}")]
    MalformedSignature(String),
    #[error("unsupported assetTransferMethod {0}")]
    UnsupportedTransferMethod(String),
    #[error("gas sponsorship is not enabled on this facilitator")]
    NoRelayerConfigured,
    #[error("no relayer is configured for network {0}")]
    NoRelayer(String),
    #[error("authorization expired at {valid_before} (now {now})")]
    Expired { valid_before: u64, now: u64 },
    #[error("authorization is not valid until {valid_after} (now {now})")]
    NotYetValid { valid_after: u64, now: u64 },
    #[error("signature recovers to {recovered}, not the declared from {declared}")]
    SignatureMismatch {
        recovered: Address,
        declared: Address,
    },
    #[error("authorization nonce has already been used")]
    NonceAlreadyUsed,
    #[error("{from} holds {balance} of {asset}, needs {amount}")]
    InsufficientBalance {
        from: Address,
        asset: Address,
        balance: U256,
        amount: U256,
    },
    #[error("deposit would revert: {0}")]
    SimulationReverted(String),
    #[error("chain error: {0:#}")]
    Chain(#[from] anyhow::Error),
    /// Nothing was submitted — safe to retry with the same authorization.
    #[error("failed to broadcast deposit: {0}")]
    Broadcast(String),
    /// The transaction *was* broadcast but its outcome is unknown. Distinct from [`Self::Broadcast`]
    /// because retrying risks a double submission; poll `tx_hash` instead.
    #[error("deposit {tx_hash} was broadcast but its receipt could not be read: {reason}")]
    ReceiptUnavailable { tx_hash: B256, reason: String },
    /// Mined and reverted, so gas *was* spent. Distinct from [`Self::SimulationReverted`], which
    /// means we declined before spending anything.
    #[error("deposit {tx_hash} reverted on-chain")]
    RevertedOnChain { tx_hash: B256 },
    #[error("too many deposit requests; retry shortly")]
    RateLimited,
    #[error("address {address} has exceeded its deposit rate limit; retry shortly")]
    AddressRateLimited { address: Address },
    #[error("too many deposits in flight; retry shortly")]
    TooManyInFlight,
    #[error("this authorization is already being submitted")]
    DuplicateInFlight,
    #[error("relayer balance {balance} is at or below the configured floor {floor}")]
    RelayerBalanceTooLow { balance: U256, floor: U256 },
    #[error("deposit needs {estimated} gas, above the sponsored ceiling of {ceiling}")]
    GasCeilingExceeded { estimated: u64, ceiling: u64 },
    /// Permit2's one-time on-chain approval is missing. Distinct because the payer can fix it —
    /// mirrors x402's `PERMIT2_ALLOWANCE_REQUIRED` precondition.
    ///
    /// Carries `eip2612_nonce` when the token supports EIP-2612, so a client can sign a sponsored
    /// permit and retry **without an Ethereum RPC of its own** — the nonce is the only input it
    /// could not otherwise obtain. `None` means the token has no EIP-2612 surface and the payer
    /// must submit the approval themselves.
    ///
    /// Boxed: it is the largest variant by some margin, and inlining it would widen every
    /// `Result<_, DepositError>` on the hot path.
    #[error(
        "{} has approved {} of {} to Permit2 but {} is required; sign an EIP-2612 permit or \
         submit a one-time approve(PERMIT2, ...) and retry",
        .0.from, .0.allowance, .0.asset, .0.required
    )]
    Permit2AllowanceRequired(Box<Permit2AllowanceDetails>),
}

/// Everything a client needs to fix a missing Permit2 approval without reading the chain.
#[derive(Debug, Clone)]
pub struct Permit2AllowanceDetails {
    pub from: Address,
    pub asset: Address,
    pub spender: Address,
    pub allowance: U256,
    pub required: U256,
    /// Present when the token supports EIP-2612, i.e. when the approval can be sponsored.
    pub eip2612_nonce: Option<U256>,
}

impl DepositError {
    /// Structured detail for [`Self::Permit2AllowanceRequired`], so the fix does not have to be
    /// parsed out of the message.
    pub fn permit2_allowance_details(&self) -> Option<&Permit2AllowanceDetails> {
        match self {
            Self::Permit2AllowanceRequired(details) => Some(details),
            _ => None,
        }
    }

    /// Stable, machine-readable code so clients can branch without string matching.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest(_) => "INVALID_REQUEST",
            Self::MalformedSignature(_) => "MALFORMED_SIGNATURE",
            Self::UnsupportedTransferMethod(_) => "UNSUPPORTED_TRANSFER_METHOD",
            Self::NoRelayerConfigured => "NO_RELAYER_CONFIGURED",
            Self::NoRelayer(_) => "NO_RELAYER",
            Self::Expired { .. } => "EXPIRED",
            Self::NotYetValid { .. } => "NOT_YET_VALID",
            Self::SignatureMismatch { .. } => "SIGNATURE_MISMATCH",
            Self::NonceAlreadyUsed => "NONCE_ALREADY_USED",
            Self::InsufficientBalance { .. } => "INSUFFICIENT_BALANCE",
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
            Self::Permit2AllowanceRequired(_) => "PERMIT2_ALLOWANCE_REQUIRED",
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
    /// Throttling and chain trouble are transient; a bad signature is not.
    ///
    /// Deliberately excludes [`Self::ReceiptUnavailable`]: that transaction may still land, so a
    /// retry risks depositing twice.
    pub fn is_retryable(&self) -> bool {
        self.is_throttling() || matches!(self, Self::RelayerBalanceTooLow { .. } | Self::Chain(_))
    }
}

/// Names the Core4Mica reverts a deposit can realistically hit. Anything else falls back to its
/// selector, which is still more useful than an opaque `execution reverted`.
pub(super) fn describe_core4mica_error(decoded: &Core4MicaErrors) -> String {
    use alloy::sol_types::SolInterface;

    match decoded {
        Core4MicaErrors::AaveNotConfigured(_) => {
            "AaveNotConfigured: the deployment has no Aave pool, so stablecoin deposits are \
             unavailable"
                .to_string()
        }
        Core4MicaErrors::UnsupportedAsset(err) => {
            format!(
                "UnsupportedAsset: {} is not a registered stablecoin",
                err.asset
            )
        }
        Core4MicaErrors::InvalidAsset(err) => format!("InvalidAsset: {}", err.asset),
        Core4MicaErrors::AmountZero(_) => "AmountZero".to_string(),
        Core4MicaErrors::InvalidSignature(_) => {
            "InvalidSignature: the token rejected the authorization".to_string()
        }
        Core4MicaErrors::ValueMismatch(err) => format!(
            "ValueMismatch: expected {} but received {} (fee-on-transfer token?)",
            err.expected, err.actual
        ),
        Core4MicaErrors::ZeroCollateralCredit(err) => format!(
            "ZeroCollateralCredit: {} of {} is too small to mint any collateral",
            err.amount, err.asset
        ),
        other => format!("revert with selector 0x{}", hex::encode(other.selector())),
    }
}

/// Splits an alloy contract error into "the deposit would revert" and "the node is unreachable".
///
/// Collapsing both into one variant would report an RPC outage as a permanent, non-retryable
/// revert. Reverts are decoded against the Core4Mica error ABI that `sdk-4mica` publishes, so
/// clients see `AaveNotConfigured` rather than a bare `0x3a76e42a` selector.
pub(super) fn classify_call_error(err: alloy::contract::Error) -> DepositError {
    // Order matters. A node reports a revert *through* the transport as JSON-RPC error 3, so
    // matching on `TransportError` first would misfile every plain `require(...)` failure as a
    // retryable outage. Revert data is the reliable discriminator: present means the EVM ran and
    // rejected, absent means we never got an answer.
    if let Some(data) = err.as_revert_data() {
        if let Some(decoded) = err.as_decoded_interface_error::<Core4MicaErrors>() {
            return DepositError::SimulationReverted(describe_core4mica_error(&decoded));
        }
        // Not a Core4Mica error — a plain `require` string from the token or Permit2, or an
        // unknown selector. `decode_revert_reason` recovers the former.
        let reason = alloy::sol_types::decode_revert_reason(&data)
            .unwrap_or_else(|| format!("revert data 0x{}", hex::encode(&data)));
        return DepositError::SimulationReverted(reason);
    }

    DepositError::Chain(anyhow::Error::new(err).context("deposit simulation"))
}
