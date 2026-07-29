//! Gasless deposit verification and submission.
//!
//! The payer signs an EIP-3009 `receiveWithAuthorization` and never touches the chain; this module
//! checks that signature and, on `/deposit`, broadcasts `depositStablecoinWithAuthorization` with
//! the relayer paying gas.
//!
//! # Trust model
//!
//! The signed EIP-3009 digest binds `to` (the Core4Mica contract) *and* `value`, and Core4Mica
//! credits collateral to `auth.from` rather than `msg.sender`. So a relayer that alters the amount
//! or the destination produces a signature that no longer recovers, and the transaction reverts.
//! The worst a malicious relayer can do is refuse to submit.
//!
//! Verification is therefore a **gas optimisation, not a security boundary** — it exists so the
//! facilitator does not pay for transactions that were always going to revert. Every check here is
//! re-enforced on-chain.

use std::str::FromStr;
use std::sync::Arc;

use alloy::primitives::{Address, B256, Signature, U256, normalize_v};
use alloy::sol;
use alloy::sol_types::SolStruct;
use sdk_4mica::contract::Core4Mica::{Core4MicaErrors, Permit2Authorization, ReceiveAuthorization};
use sdk_4mica::contract::PERMIT2_ADDRESS;
use thiserror::Error;

use crate::limits::{DepositGuard, DepositLimits};
use crate::relayer::{DepositToken, Relayer};

sol! {
    /// EIP-3009's signed struct, declared here rather than imported: `sdk-4mica` keeps its digest
    /// module private, and an independently written verifier is preferable anyway — a bug in the
    /// SDK's construction should fail this check, not cancel out against it. The type string is
    /// fixed by EIP-3009, so there is nothing to drift against.
    struct ReceiveWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    /// Permit2 `SignatureTransfer` token permission.
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    /// Permit2's signed struct.
    ///
    /// Note the absence of x402's `Witness`: that exists because `exact` pays an arbitrary payee
    /// and `PermitTransferFrom` binds `spender` but not the destination, so a facilitator could
    /// otherwise redirect funds. A deposit has no free destination — Core4Mica pulls into itself
    /// and credits `from` — so binding `spender` to Core4Mica already constrains it fully, and the
    /// canonical `x402ExactPermit2Proxy` is unnecessary here.
    struct PermitTransferFrom {
        TokenPermissions permitted;
        address spender;
        uint256 nonce;
        uint256 deadline;
    }
}

/// Asset transfer methods this facilitator can service, matching x402's `scheme_exact_evm` names.
///
/// `eip3009` is truly gasless. `permit2` works for any ERC-20 but needs a prior on-chain
/// `approve(PERMIT2, ...)` from the payer, so the payer still pays gas once.
const ASSET_TRANSFER_METHOD_EIP3009: &str = "eip3009";
const ASSET_TRANSFER_METHOD_PERMIT2: &str = "permit2";

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
    #[error("chain error: {0}")]
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
    #[error(
        "{from} has approved {allowance} of {asset} to Permit2 but {required} is required;          submit a one-time approve(PERMIT2, ...) and retry"
    )]
    Permit2AllowanceRequired {
        from: Address,
        asset: Address,
        allowance: U256,
        required: U256,
    },
}

impl DepositError {
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
            Self::Permit2AllowanceRequired { .. } => "PERMIT2_ALLOWANCE_REQUIRED",
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

/// Which signature scheme moves the tokens.
#[derive(Debug, Clone)]
pub enum DepositAuthorization {
    /// The token itself verifies the signature and enforces the nonce. Truly gasless.
    Eip3009(ReceiveAuthorization),
    /// Routed through the canonical Permit2 contract, so it works for any ERC-20 — at the cost of
    /// a one-time on-chain `approve(PERMIT2, ...)` the payer must have made themselves.
    Permit2(Permit2Authorization),
}

impl DepositAuthorization {
    /// The signer, and the account collateral is credited to. Bound inside the signature in both
    /// schemes, so it can never be the relayer.
    pub fn from(&self) -> Address {
        match self {
            Self::Eip3009(auth) => auth.from,
            Self::Permit2(auth) => auth.from,
        }
    }

    /// Identifies one authorization for in-flight deduplication. EIP-3009 nonces are `bytes32`;
    /// Permit2's are `uint256`, so the latter is narrowed to the same shape.
    pub fn nonce(&self) -> B256 {
        match self {
            Self::Eip3009(auth) => auth.nonce,
            Self::Permit2(auth) => B256::from(auth.nonce.to_be_bytes::<32>()),
        }
    }

    fn method(&self) -> &'static str {
        match self {
            Self::Eip3009(_) => ASSET_TRANSFER_METHOD_EIP3009,
            Self::Permit2(_) => ASSET_TRANSFER_METHOD_PERMIT2,
        }
    }
}

/// A validated deposit request, with strings parsed into their on-chain types.
#[derive(Debug)]
pub struct DepositIntent {
    pub asset: Address,
    pub amount: U256,
    pub authorization: DepositAuthorization,
}

impl DepositIntent {
    pub fn parse(
        asset: &str,
        amount: &str,
        asset_transfer_method: Option<&str>,
        eip3009: Option<ReceiveAuthorization>,
        permit2: Option<Permit2Authorization>,
    ) -> Result<Self, DepositError> {
        // Exactly one authorization, mirroring x402's "exactly one of erc3009Authorization or
        // permit2Authorization must be present".
        let authorization = match (eip3009, permit2) {
            (Some(auth), None) => DepositAuthorization::Eip3009(auth),
            (None, Some(auth)) => DepositAuthorization::Permit2(auth),
            (None, None) => {
                return Err(DepositError::InvalidRequest(
                    "one of `authorization` or `permit2Authorization` is required".into(),
                ));
            }
            (Some(_), Some(_)) => {
                return Err(DepositError::InvalidRequest(
                    "provide exactly one of `authorization` or `permit2Authorization`".into(),
                ));
            }
        };

        // The discriminator is optional — the payload shape already says which scheme this is —
        // but a mismatch means the caller is confused about what it sent.
        match asset_transfer_method.map(str::trim) {
            None | Some("") => {}
            Some(method) if method == authorization.method() => {}
            Some(method @ (ASSET_TRANSFER_METHOD_EIP3009 | ASSET_TRANSFER_METHOD_PERMIT2)) => {
                return Err(DepositError::InvalidRequest(format!(
                    "assetTransferMethod is {method} but a {} authorization was supplied",
                    authorization.method()
                )));
            }
            Some(other) => {
                return Err(DepositError::UnsupportedTransferMethod(other.to_string()));
            }
        }

        let asset = Address::from_str(asset.trim())
            .map_err(|_| DepositError::InvalidRequest(format!("invalid asset address: {asset}")))?;
        let amount = parse_u256(amount)
            .map_err(|err| DepositError::InvalidRequest(format!("invalid amount: {err}")))?;
        if amount.is_zero() {
            return Err(DepositError::InvalidRequest(
                "amount must be non-zero".into(),
            ));
        }

        Ok(Self {
            asset,
            amount,
            authorization,
        })
    }
}

/// Runs every check that can be made without broadcasting, cheapest first.
///
/// Ordering is deliberate: local checks before any RPC round trip, and the simulation last since
/// it is the most expensive. The simulation is what catches everything the earlier checks cannot
/// see — a paused contract, an asset disabled on-chain, an unsupported token.
pub async fn verify(
    relayer: &Relayer,
    limits: &DepositLimits,
    intent: &DepositIntent,
    now: u64,
) -> Result<(), DepositError> {
    let token = DepositToken::new(intent.asset, relayer.provider());

    // Scheme-specific: expiry semantics, which domain the signature is under, and the replay guard
    // all differ. Everything after this point is common.
    match &intent.authorization {
        DepositAuthorization::Eip3009(auth) => {
            verify_eip3009(relayer, &token, intent, auth, now).await?
        }
        DepositAuthorization::Permit2(auth) => {
            verify_permit2(relayer, &token, intent, auth, now).await?
        }
    }

    let from = intent.authorization.from();
    let balance = token
        .balanceOf(from)
        .call()
        .await
        .map_err(classify_call_error)?;
    if balance < intent.amount {
        return Err(DepositError::InsufficientBalance {
            from,
            asset: intent.asset,
            balance,
            amount: intent.amount,
        });
    }

    // `eth_estimateGas` executes the deposit against current state, so it both proves the call
    // succeeds and prices it — no separate `eth_call` needed. It also bounds the cost: a token
    // whose transfer hook burns gas deliberately passes every check above and would still drain
    // the relayer.
    let estimated = estimate_deposit_gas(relayer, intent).await?;

    if estimated > limits.max_gas {
        return Err(DepositError::GasCeilingExceeded {
            estimated,
            ceiling: limits.max_gas,
        });
    }

    Ok(())
}

async fn verify_eip3009(
    relayer: &Relayer,
    token: &DepositToken::DepositTokenInstance<alloy::providers::DynProvider>,
    intent: &DepositIntent,
    auth: &ReceiveAuthorization,
    now: u64,
) -> Result<(), DepositError> {
    let valid_before = auth.validBefore.saturating_to::<u64>();
    if valid_before <= now {
        return Err(DepositError::Expired { valid_before, now });
    }
    let valid_after = auth.validAfter.saturating_to::<u64>();
    if valid_after > now {
        return Err(DepositError::NotYetValid { valid_after, now });
    }

    // Read from the token, never reconstructed: a wrong reconstruction yields a well-formed
    // separator no token will verify against.
    let domain_separator = relayer.token_domain_separator(intent.asset).await?;
    let digest = receive_authorization_digest(
        domain_separator,
        auth.from,
        relayer.contract_address(),
        intent.amount,
        auth.validAfter,
        auth.validBefore,
        auth.nonce,
    );
    require_signer(&digest, auth.r, auth.s, auth.v, auth.from)?;

    // Cheap and decisive: a used nonce always reverts, so paying gas to discover that is pure loss.
    //
    // Best-effort rather than required. EIP-3009 mandates `authorizationState`, but tokens exist
    // that expose `DOMAIN_SEPARATOR` (EIP-2612) without the EIP-3009 surface, and treating a
    // missing accessor as fatal would report "chain error" for what is really an unsupported
    // token. The simulation is authoritative either way.
    match token.authorizationState(auth.from, auth.nonce).call().await {
        Ok(true) => return Err(DepositError::NonceAlreadyUsed),
        Ok(false) => {}
        Err(err) => tracing::debug!(
            asset = %intent.asset,
            error = %err,
            "token does not expose authorizationState; relying on simulation for replay detection"
        ),
    }

    Ok(())
}

async fn verify_permit2(
    relayer: &Relayer,
    token: &DepositToken::DepositTokenInstance<alloy::providers::DynProvider>,
    intent: &DepositIntent,
    auth: &Permit2Authorization,
    now: u64,
) -> Result<(), DepositError> {
    let deadline = auth.deadline.saturating_to::<u64>();
    if deadline <= now {
        return Err(DepositError::Expired {
            valid_before: deadline,
            now,
        });
    }

    // Permit2 is deployed at one canonical address on every chain and its domain has a fixed name
    // and no version, so this needs neither a chain read nor anything from core.
    let digest = permit_transfer_from_digest(
        permit2_domain_separator(relayer.chain_id()),
        intent.asset,
        intent.amount,
        relayer.contract_address(),
        auth.nonce,
        auth.deadline,
    );
    let signature = Signature::try_from(auth.signature.as_ref()).map_err(|err| {
        DepositError::MalformedSignature(format!("invalid permit2 signature: {err}"))
    })?;
    let recovered = signature
        .recover_address_from_prehash(&digest)
        .map_err(|err| {
            DepositError::MalformedSignature(format!("unrecoverable signature: {err}"))
        })?;
    if recovered != auth.from {
        return Err(DepositError::SignatureMismatch {
            recovered,
            declared: auth.from,
        });
    }

    // The one precondition unique to Permit2, and the reason x402 gives it a dedicated status:
    // the payer must have made a one-time on-chain `approve(PERMIT2, ...)` themselves. Without a
    // distinct code the client just sees a revert and has no idea an approval is what is missing.
    let allowance = token
        .allowance(auth.from, PERMIT2_ADDRESS)
        .call()
        .await
        .map_err(classify_call_error)?;
    if allowance < intent.amount {
        return Err(DepositError::Permit2AllowanceRequired {
            from: auth.from,
            asset: intent.asset,
            allowance,
            required: intent.amount,
        });
    }

    // Permit2 tracks nonces in a bitmap rather than a boolean map; the simulation catches a reused
    // nonce, so there is no cheap pre-check worth the extra round trip.
    Ok(())
}

/// Prices the deposit without broadcasting. `eth_estimateGas` executes the call, so a revert
/// surfaces here rather than needing a separate `eth_call`.
async fn estimate_deposit_gas(
    relayer: &Relayer,
    intent: &DepositIntent,
) -> Result<u64, DepositError> {
    let contract = relayer.contract();
    let from = relayer.address();
    match &intent.authorization {
        DepositAuthorization::Eip3009(auth) => {
            contract
                .depositStablecoinWithAuthorization(intent.asset, intent.amount, auth.clone())
                .from(from)
                .estimate_gas()
                .await
        }
        DepositAuthorization::Permit2(auth) => {
            contract
                .depositStablecoinWithPermit2(intent.asset, intent.amount, auth.clone())
                .from(from)
                .estimate_gas()
                .await
        }
    }
    .map_err(classify_call_error)
}

/// Verifies, reserves capacity, then broadcasts and waits for the receipt.
///
/// Re-verifies rather than trusting an earlier `/deposit/verify`: the two are separate requests,
/// and state can change in between (nonce consumed, balance spent, authorization expired).
///
/// The rate-limit reservation deliberately happens *after* verification. `from` is just a claim
/// until the signature recovers to it, so reserving earlier would let a caller evade per-address
/// limits by varying it on every request.
pub async fn submit(
    relayer: &Relayer,
    guard: &Arc<DepositGuard>,
    intent: &DepositIntent,
    now: u64,
) -> Result<B256, DepositError> {
    verify(relayer, guard.limits(), intent, now).await?;

    // `from` is proven from here on. Held until this function returns, then released on drop.
    let _permit = guard.reserve(intent.authorization.from(), intent.authorization.nonce())?;

    let balance = relayer.cached_balance().await?;
    guard.check_relayer_balance(balance)?;

    let contract = relayer.contract();
    // Explicit gas rather than estimated: an estimate is advisory, a limit is enforced. Unused gas
    // is refunded, so this caps the worst case without costing anything normally.
    let gas = guard.limits().max_gas;
    let pending = match &intent.authorization {
        DepositAuthorization::Eip3009(auth) => {
            contract
                .depositStablecoinWithAuthorization(intent.asset, intent.amount, auth.clone())
                .gas(gas)
                .send()
                .await
        }
        DepositAuthorization::Permit2(auth) => {
            contract
                .depositStablecoinWithPermit2(intent.asset, intent.amount, auth.clone())
                .gas(gas)
                .send()
                .await
        }
    }
    .map_err(|err| DepositError::Broadcast(err.to_string()))?;

    // Past this point the transaction is on the wire, so a failure is no longer safe to retry.
    let tx_hash = *pending.tx_hash();
    let receipt = pending
        .get_receipt()
        .await
        .map_err(|err| DepositError::ReceiptUnavailable {
            tx_hash,
            reason: err.to_string(),
        })?;

    if !receipt.status() {
        return Err(DepositError::RevertedOnChain {
            tx_hash: receipt.transaction_hash,
        });
    }

    Ok(receipt.transaction_hash)
}

/// Names the Core4Mica reverts a deposit can realistically hit. Anything else falls back to its
/// selector, which is still more useful than an opaque `execution reverted`.
fn describe_core4mica_error(decoded: &Core4MicaErrors) -> String {
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
fn classify_call_error(err: alloy::contract::Error) -> DepositError {
    if let Some(decoded) = err.as_decoded_interface_error::<Core4MicaErrors>() {
        return DepositError::SimulationReverted(describe_core4mica_error(&decoded));
    }
    match err {
        alloy::contract::Error::TransportError(err) => {
            DepositError::Chain(anyhow::Error::new(err).context("deposit simulation"))
        }
        other => DepositError::SimulationReverted(other.to_string()),
    }
}

/// `keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(ReceiveWithAuthorization))`.
fn receive_authorization_digest(
    domain_separator: B256,
    from: Address,
    to: Address,
    value: U256,
    valid_after: U256,
    valid_before: U256,
    nonce: B256,
) -> B256 {
    let message = ReceiveWithAuthorization {
        from,
        to,
        value,
        validAfter: valid_after,
        validBefore: valid_before,
        nonce,
    };
    eip712_digest(domain_separator, message.eip712_hash_struct())
}

/// `keccak256(0x19 0x01 ‖ domainSeparator ‖ structHash)`.
fn eip712_digest(domain_separator: B256, struct_hash: B256) -> B256 {
    let mut buf = [0u8; 66];
    buf[0] = 0x19;
    buf[1] = 0x01;
    buf[2..34].copy_from_slice(domain_separator.as_slice());
    buf[34..66].copy_from_slice(struct_hash.as_slice());
    alloy::primitives::keccak256(buf)
}

/// Recovers `(r, s, v)` and asserts it matches the declared signer.
fn require_signer(
    digest: &B256,
    r: B256,
    s: B256,
    v: u8,
    declared: Address,
) -> Result<(), DepositError> {
    let recovered = recover_signer(digest, r, s, v)?;
    if recovered != declared {
        return Err(DepositError::SignatureMismatch {
            recovered,
            declared,
        });
    }
    Ok(())
}

/// Permit2's EIP-712 domain separator for `chain_id`.
///
/// Needs neither a chain read nor server-advertised metadata: Permit2 is deployed at one canonical
/// address on every chain and its domain has a fixed name and no version.
fn permit2_domain_separator(chain_id: u64) -> B256 {
    let type_hash = alloy::primitives::keccak256(
        b"EIP712Domain(string name,uint256 chainId,address verifyingContract)".as_slice(),
    );
    let mut encoded = Vec::with_capacity(32 * 4);
    encoded.extend_from_slice(type_hash.as_slice());
    encoded.extend_from_slice(alloy::primitives::keccak256(b"Permit2".as_slice()).as_slice());
    encoded.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
    encoded.extend_from_slice(PERMIT2_ADDRESS.into_word().as_slice());
    alloy::primitives::keccak256(encoded)
}

/// Permit2 `PermitTransferFrom` signing hash, with the nested `TokenPermissions` hashed first.
fn permit_transfer_from_digest(
    domain_separator: B256,
    token: Address,
    amount: U256,
    spender: Address,
    nonce: U256,
    deadline: U256,
) -> B256 {
    let message = PermitTransferFrom {
        permitted: TokenPermissions { token, amount },
        spender,
        nonce,
        deadline,
    };
    eip712_digest(domain_separator, message.eip712_hash_struct())
}

/// Recovers the signer, accepting `v` in either Electrum (27/28) or raw parity (0/1) form —
/// EIP-3009 tokens expect the former, but signers differ and rejecting 0/1 would be gratuitous.
fn recover_signer(digest: &B256, r: B256, s: B256, v: u8) -> Result<Address, DepositError> {
    let parity = normalize_v(v as u64).ok_or_else(|| {
        DepositError::MalformedSignature(format!("invalid signature v: {v}, expected 27/28"))
    })?;

    Signature::from_scalars_and_parity(r, s, parity)
        .recover_address_from_prehash(digest)
        .map_err(|err| DepositError::MalformedSignature(format!("unrecoverable signature: {err}")))
}

/// Accepts decimal or `0x`-prefixed hex, matching how amounts travel elsewhere in x402.
/// `U256`'s `FromStr` already dispatches on the prefix, so there is nothing to hand-roll.
fn parse_u256(value: &str) -> Result<U256, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("cannot be empty".into());
    }
    U256::from_str(trimmed).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, b256};
    use alloy::signers::SignerSync;
    use alloy::signers::local::PrivateKeySigner;

    const TOKEN: Address = address!("000000000000000000000000000000000000d0c5");
    const CONTRACT: Address = address!("00000000000000000000000000000000c04e4a1c");
    const DOMAIN: B256 = b256!("1111111111111111111111111111111111111111111111111111111111111111");

    fn auth(from: Address) -> ReceiveAuthorization {
        ReceiveAuthorization {
            from,
            validAfter: U256::ZERO,
            validBefore: U256::from(2_000_000_000u64),
            nonce: B256::repeat_byte(0x42),
            v: 27,
            r: B256::ZERO,
            s: B256::ZERO,
        }
    }

    #[test]
    fn parse_defaults_to_eip3009_when_method_is_absent() {
        let intent = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000000",
            None,
            Some(auth(Address::ZERO)),
            None,
        )
        .expect("intent");
        assert_eq!(intent.amount, U256::from(1_000_000u64));
        assert_eq!(intent.asset, TOKEN);
    }

    #[test]
    fn parse_accepts_hex_amounts() {
        let intent = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "0x0a",
            None,
            Some(auth(Address::ZERO)),
            None,
        )
        .expect("intent");
        assert_eq!(intent.amount, U256::from(10u64));
    }

    #[test]
    fn parse_rejects_zero_amount() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "0",
            None,
            Some(auth(Address::ZERO)),
            None,
        )
        .expect_err("expected zero rejection");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }

    /// Permit2 gets its own code rather than the generic unknown-method one, so a client can tell
    /// "not implemented yet" from "you sent nonsense".
    fn permit2_auth(from: Address) -> Permit2Authorization {
        Permit2Authorization {
            from,
            nonce: U256::from(7u64),
            deadline: U256::from(2_000_000_000u64),
            signature: vec![0u8; 65].into(),
        }
    }

    #[test]
    fn parse_accepts_a_permit2_authorization() {
        let intent = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000",
            Some("permit2"),
            None,
            Some(permit2_auth(Address::ZERO)),
        )
        .expect("intent");
        assert!(matches!(
            intent.authorization,
            DepositAuthorization::Permit2(_)
        ));
    }

    /// The payload shape and the discriminator must agree, or the caller is confused about what it
    /// sent and we would silently verify under the wrong scheme.
    #[test]
    fn parse_rejects_a_method_that_contradicts_the_payload() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000",
            Some("permit2"),
            Some(auth(Address::ZERO)),
            None,
        )
        .expect_err("expected mismatch rejection");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }

    #[test]
    fn parse_requires_exactly_one_authorization() {
        let none = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000",
            None,
            None,
            None,
        )
        .expect_err("expected missing-authorization rejection");
        assert_eq!(none.code(), "INVALID_REQUEST");

        let both = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000",
            None,
            Some(auth(Address::ZERO)),
            Some(permit2_auth(Address::ZERO)),
        )
        .expect_err("expected both-authorizations rejection");
        assert_eq!(both.code(), "INVALID_REQUEST");
    }

    /// Permit2's domain is fixed per chain, so a wrong derivation would silently produce
    /// signatures no deposit can ever redeem. Computed here from the literal type string.
    #[test]
    fn permit2_domain_matches_an_independently_computed_separator() {
        use alloy::primitives::keccak256;

        let chain_id = 1337u64;
        let type_hash = keccak256(
            b"EIP712Domain(string name,uint256 chainId,address verifyingContract)".as_slice(),
        );
        let mut encoded = Vec::with_capacity(32 * 4);
        encoded.extend_from_slice(type_hash.as_slice());
        encoded.extend_from_slice(keccak256(b"Permit2".as_slice()).as_slice());
        encoded.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
        let mut word = [0u8; 32];
        word[12..].copy_from_slice(PERMIT2_ADDRESS.as_slice());
        encoded.extend_from_slice(&word);

        assert_eq!(permit2_domain_separator(chain_id), keccak256(encoded));
    }

    #[test]
    fn parse_rejects_an_unknown_transfer_method() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1",
            Some("erc7710"),
            Some(auth(Address::ZERO)),
            None,
        )
        .expect_err("expected unknown-method rejection");
        assert_eq!(err.code(), "UNSUPPORTED_TRANSFER_METHOD");
    }

    /// The digest must match what the token's own `ecrecover` will check. Computed here from the
    /// literal EIP-3009 type string rather than via `eip712_hash_struct`, so a wrong field order
    /// fails instead of cancelling out on both sides.
    #[test]
    fn digest_matches_an_independently_computed_eip3009_hash() {
        use alloy::primitives::keccak256;

        let from = address!("00000000000000000000000000000000000000a1");
        let value = U256::from(1_000_000u64);
        let valid_after = U256::ZERO;
        let valid_before = U256::from(2_000_000_000u64);
        let nonce = B256::repeat_byte(0x42);

        let type_hash = keccak256(
            b"ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
                .as_slice(),
        );
        let word = |a: Address| {
            let mut w = [0u8; 32];
            w[12..].copy_from_slice(a.as_slice());
            w
        };
        let mut encoded = Vec::with_capacity(32 * 7);
        encoded.extend_from_slice(type_hash.as_slice());
        encoded.extend_from_slice(&word(from));
        encoded.extend_from_slice(&word(CONTRACT));
        encoded.extend_from_slice(&value.to_be_bytes::<32>());
        encoded.extend_from_slice(&valid_after.to_be_bytes::<32>());
        encoded.extend_from_slice(&valid_before.to_be_bytes::<32>());
        encoded.extend_from_slice(nonce.as_slice());

        let mut buf = Vec::with_capacity(66);
        buf.push(0x19);
        buf.push(0x01);
        buf.extend_from_slice(DOMAIN.as_slice());
        buf.extend_from_slice(keccak256(encoded).as_slice());
        let expected = keccak256(buf);

        let actual = receive_authorization_digest(
            DOMAIN,
            from,
            CONTRACT,
            value,
            valid_after,
            valid_before,
            nonce,
        );
        assert_eq!(actual, expected);
    }

    #[test]
    fn recover_signer_round_trips_a_real_signature() {
        let signer = PrivateKeySigner::random();
        let from = signer.address();
        let value = U256::from(1_000_000u64);
        let valid_before = U256::from(2_000_000_000u64);
        let nonce = B256::repeat_byte(0x42);

        let digest = receive_authorization_digest(
            DOMAIN,
            from,
            CONTRACT,
            value,
            U256::ZERO,
            valid_before,
            nonce,
        );
        let sig = signer.sign_hash_sync(&digest).expect("sign");

        let authorization = ReceiveAuthorization {
            from,
            validAfter: U256::ZERO,
            validBefore: valid_before,
            nonce,
            v: 27 + sig.v() as u8,
            r: sig.r().into(),
            s: sig.s().into(),
        };

        let recovered = recover_signer(&digest, authorization.r, authorization.s, authorization.v)
            .expect("recover");
        assert_eq!(recovered, from);
    }

    #[test]
    fn recover_signer_rejects_an_invalid_v() {
        let mut authorization = auth(Address::ZERO);
        authorization.v = 42;
        let err = recover_signer(
            &B256::ZERO,
            authorization.r,
            authorization.s,
            authorization.v,
        )
        .expect_err("expected v rejection");
        assert_eq!(err.code(), "MALFORMED_SIGNATURE");
    }
}
