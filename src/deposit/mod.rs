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

pub(crate) mod eip712;
mod error;

use std::str::FromStr;
use std::sync::Arc;

use alloy::primitives::{Address, B256, U256};
use sdk_4mica::contract::Core4Mica::{Permit2Authorization, ReceiveAuthorization};
use sdk_4mica::contract::PERMIT2_ADDRESS;

use crate::limits::{SponsorGuard, SponsorLimits};
use crate::relayer::{DepositToken, Relayer};

pub(crate) use error::classify_core4mica_revert;
pub use error::{DepositError, Permit2AllowanceDetails};

use eip712::{
    permit_digest, permit_transfer_from_digest, permit2_domain_separator,
    receive_authorization_digest, require_signer, require_signer_from_bytes,
};
use error::classify_call_error;

/// Asset transfer methods this facilitator can service, matching x402's `scheme_exact_evm` names.
///
/// `eip3009` is truly gasless. `permit2` works for any ERC-20 but needs a prior on-chain
/// `approve(PERMIT2, ...)` from the payer, so the payer still pays gas once.
const ASSET_TRANSFER_METHOD_EIP3009: &str = "eip3009";
const ASSET_TRANSFER_METHOD_PERMIT2: &str = "permit2";

/// An EIP-2612 permit authorising Permit2 to spend the payer's tokens.
///
/// This is x402's `eip2612GasSponsoring` extension: Permit2 needs a one-time on-chain approval,
/// which normally costs the payer gas and breaks the gasless promise. When the token implements
/// EIP-2612 the payer can sign that approval instead, and the relayer submits it.
///
/// Unlike x402's `erc20ApprovalGasSponsoring`, this needs no atomic batch. That extension has the
/// facilitator send ETH to the payer's wallet, which a front-runner could steal between funding
/// and settlement. Here the permit only grants an allowance to Permit2, and Permit2 will not move
/// anything without a `PermitTransferFrom` signature naming Core4Mica as spender — so a dangling
/// allowance is not exploitable and the two transactions need not be atomic.
#[derive(Debug, Clone)]
pub struct Eip2612Permit {
    pub value: U256,
    pub deadline: U256,
    pub v: u8,
    pub r: B256,
    pub s: B256,
}

/// Which signature scheme moves the tokens.
#[derive(Debug, Clone)]
pub enum DepositAuthorization {
    /// The token itself verifies the signature and enforces the nonce. Truly gasless.
    Eip3009(ReceiveAuthorization),
    /// Routed through the canonical Permit2 contract, so it works for any ERC-20 — at the cost of
    /// a one-time `approve(PERMIT2, ...)`, which `permit` sponsors when the token supports
    /// EIP-2612 and the payer has not approved already.
    Permit2 {
        authorization: Permit2Authorization,
        permit: Option<Eip2612Permit>,
    },
}

impl DepositAuthorization {
    /// The signer, and the account collateral is credited to. Bound inside the signature in both
    /// schemes, so it can never be the relayer.
    pub fn from(&self) -> Address {
        match self {
            Self::Eip3009(auth) => auth.from,
            Self::Permit2 { authorization, .. } => authorization.from,
        }
    }

    /// Identifies one authorization for in-flight deduplication. EIP-3009 nonces are `bytes32`;
    /// Permit2's are `uint256`, so the latter is narrowed to the same shape.
    pub fn nonce(&self) -> B256 {
        match self {
            Self::Eip3009(auth) => auth.nonce,
            Self::Permit2 { authorization, .. } => {
                B256::from(authorization.nonce.to_be_bytes::<32>())
            }
        }
    }

    fn method(&self) -> &'static str {
        match self {
            Self::Eip3009(_) => ASSET_TRANSFER_METHOD_EIP3009,
            Self::Permit2 { .. } => ASSET_TRANSFER_METHOD_PERMIT2,
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
        permit: Option<Eip2612Permit>,
    ) -> Result<Self, DepositError> {
        if permit.is_some() && permit2.is_none() {
            return Err(DepositError::InvalidRequest(
                "`eip2612Permit` only applies to a permit2 deposit".into(),
            ));
        }

        // Exactly one authorization, mirroring x402's "exactly one of erc3009Authorization or
        // permit2Authorization must be present".
        let authorization = match (eip3009, permit2) {
            (Some(auth), None) => DepositAuthorization::Eip3009(auth),
            (None, Some(authorization)) => DepositAuthorization::Permit2 {
                authorization,
                permit,
            },
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
    limits: &SponsorLimits,
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
        DepositAuthorization::Permit2 {
            authorization,
            permit,
        } => verify_permit2(relayer, &token, intent, authorization, permit.as_ref(), now).await?,
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

    // A sponsored permit has not been submitted yet at verification time, so Permit2 still has no
    // allowance and simulating the deposit would revert with `TRANSFER_FROM_FAILED` — a guaranteed
    // false negative rather than a useful signal. Everything cheap has already been checked; the
    // explicit `.gas(max_gas)` on the send still bounds the cost.
    if sponsored_permit_pending(intent) {
        tracing::debug!(
            asset = %intent.asset,
            "skipping simulation: the sponsored permit lands before the deposit"
        );
        return Ok(());
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

/// Whether this deposit depends on an approval that has not been granted yet.
fn sponsored_permit_pending(intent: &DepositIntent) -> bool {
    matches!(
        &intent.authorization,
        DepositAuthorization::Permit2 {
            permit: Some(_),
            ..
        }
    )
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
    permit: Option<&Eip2612Permit>,
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
    require_signer_from_bytes(&digest, auth.signature.as_ref(), auth.from)?;

    // The one precondition unique to Permit2, and the reason x402 gives it a dedicated status:
    // the payer must have made a one-time on-chain `approve(PERMIT2, ...)` themselves. Without a
    // distinct code the client just sees a revert and has no idea an approval is what is missing.
    let allowance = token
        .allowance(auth.from, PERMIT2_ADDRESS)
        .call()
        .await
        .map_err(classify_call_error)?;
    if allowance < intent.amount {
        // x402's `eip2612GasSponsoring`: a signed permit stands in for the missing approval, and
        // the relayer submits it. Without one there is nothing we can do for the payer.
        let Some(permit) = permit else {
            // Hand back the one value a chain-free client cannot compute for itself. Best-effort:
            // a token without EIP-2612 simply has no nonce to report, which is itself the answer.
            let eip2612_nonce = token.nonces(auth.from).call().await.ok();
            return Err(DepositError::Permit2AllowanceRequired(Box::new(
                Permit2AllowanceDetails {
                    from: auth.from,
                    asset: intent.asset,
                    spender: PERMIT2_ADDRESS,
                    allowance,
                    required: intent.amount,
                    eip2612_nonce,
                },
            )));
        };
        verify_eip2612_permit(relayer, token, intent, auth.from, permit, now).await?;
    }

    // Permit2 tracks nonces in a bitmap rather than a boolean map; the simulation catches a reused
    // nonce, so there is no cheap pre-check worth the extra round trip.
    Ok(())
}

/// Checks a sponsored EIP-2612 permit before the relayer pays to submit it.
///
/// The permit is verified against the token's own domain and current nonce, so a stale or forged
/// signature is rejected here rather than costing a reverted transaction.
async fn verify_eip2612_permit(
    relayer: &Relayer,
    token: &DepositToken::DepositTokenInstance<alloy::providers::DynProvider>,
    intent: &DepositIntent,
    owner: Address,
    permit: &Eip2612Permit,
    now: u64,
) -> Result<(), DepositError> {
    if permit.deadline.saturating_to::<u64>() <= now {
        return Err(DepositError::Expired {
            valid_before: permit.deadline.saturating_to::<u64>(),
            now,
        });
    }
    if permit.value < intent.amount {
        return Err(DepositError::Permit2AllowanceRequired(Box::new(
            Permit2AllowanceDetails {
                from: owner,
                asset: intent.asset,
                spender: PERMIT2_ADDRESS,
                allowance: permit.value,
                required: intent.amount,
                eip2612_nonce: None,
            },
        )));
    }

    // EIP-2612 binds the owner's *current* nonce, so this also rejects a replayed permit.
    let nonce = token
        .nonces(owner)
        .call()
        .await
        .map_err(classify_call_error)?;
    let domain_separator = relayer.token_domain_separator(intent.asset).await?;
    let digest = permit_digest(
        domain_separator,
        owner,
        PERMIT2_ADDRESS,
        permit.value,
        nonce,
        permit.deadline,
    );
    require_signer(&digest, permit.r, permit.s, permit.v, owner)
}

/// Whether Permit2's allowance is still short, re-read immediately before submitting. The payer
/// may have approved between `/deposit/verify` and now, in which case sponsoring is wasted gas.
async fn needs_permit2_allowance(
    relayer: &Relayer,
    intent: &DepositIntent,
    owner: Address,
) -> Result<bool, DepositError> {
    let allowance = DepositToken::new(intent.asset, relayer.provider())
        .allowance(owner, PERMIT2_ADDRESS)
        .call()
        .await
        .map_err(classify_call_error)?;
    Ok(allowance < intent.amount)
}

/// Broadcasts the payer's EIP-2612 permit so Permit2 gains its allowance, with the relayer paying.
async fn submit_permit(
    relayer: &Relayer,
    intent: &DepositIntent,
    owner: Address,
    permit: &Eip2612Permit,
    gas: u64,
) -> Result<(), DepositError> {
    let receipt = DepositToken::new(intent.asset, relayer.provider())
        .permit(
            owner,
            PERMIT2_ADDRESS,
            permit.value,
            permit.deadline,
            permit.v,
            permit.r,
            permit.s,
        )
        .gas(gas)
        .send()
        .await
        .map_err(|err| DepositError::Broadcast(format!("sponsored permit: {err}")))?
        .get_receipt()
        .await
        .map_err(|err| DepositError::Broadcast(format!("sponsored permit receipt: {err}")))?;

    if !receipt.status() {
        return Err(DepositError::RevertedOnChain {
            tx_hash: receipt.transaction_hash,
        });
    }

    tracing::info!(
        tx_hash = %receipt.transaction_hash,
        owner = %owner,
        asset = %intent.asset,
        "sponsored EIP-2612 permit so Permit2 can pull the deposit"
    );
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
        DepositAuthorization::Permit2 { authorization, .. } => {
            contract
                .depositStablecoinWithPermit2(intent.asset, intent.amount, authorization.clone())
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
    guard: &Arc<SponsorGuard>,
    intent: &DepositIntent,
    now: u64,
) -> Result<B256, DepositError> {
    verify(relayer, guard.limits(), intent, now).await?;

    // `from` is proven from here on. Held until this function returns, then released on drop.
    let _permit = guard.reserve(intent.authorization.from(), intent.authorization.nonce())?;

    let balance = relayer.cached_balance().await?;
    guard.check_relayer_balance(balance)?;

    // Submit the sponsored approval first, if one is needed. Deliberately a separate transaction:
    // see `Eip2612Permit` for why atomicity is not required here.
    if let DepositAuthorization::Permit2 {
        authorization,
        permit: Some(permit),
    } = &intent.authorization
        && needs_permit2_allowance(relayer, intent, authorization.from).await?
    {
        submit_permit(
            relayer,
            intent,
            authorization.from,
            permit,
            guard.limits().max_gas,
        )
        .await?;
    }

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
        DepositAuthorization::Permit2 { authorization, .. } => {
            contract
                .depositStablecoinWithPermit2(intent.asset, intent.amount, authorization.clone())
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
    use alloy::primitives::address;

    const TOKEN: Address = address!("000000000000000000000000000000000000d0c5");

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
            None,
        )
        .expect("intent");
        assert!(matches!(
            intent.authorization,
            DepositAuthorization::Permit2 { permit: None, .. }
        ));
    }

    fn eip2612_permit() -> Eip2612Permit {
        Eip2612Permit {
            value: U256::MAX,
            deadline: U256::from(2_000_000_000u64),
            v: 27,
            r: B256::repeat_byte(0x11),
            s: B256::repeat_byte(0x22),
        }
    }

    #[test]
    fn parse_accepts_a_sponsored_permit_alongside_permit2() {
        let intent = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000",
            None,
            None,
            Some(permit2_auth(Address::ZERO)),
            Some(eip2612_permit()),
        )
        .expect("intent");
        assert!(matches!(
            intent.authorization,
            DepositAuthorization::Permit2 {
                permit: Some(_),
                ..
            }
        ));
    }

    /// An EIP-3009 deposit never needs an approval, so a permit alongside one means the caller has
    /// misunderstood the flow — better to say so than to ignore a signature they paid to produce.
    #[test]
    fn parse_rejects_a_permit_without_permit2() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000",
            None,
            Some(auth(Address::ZERO)),
            None,
            Some(eip2612_permit()),
        )
        .expect_err("expected rejection");
        assert_eq!(err.code(), "INVALID_REQUEST");
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
            None,
        )
        .expect_err("expected both-authorizations rejection");
        assert_eq!(both.code(), "INVALID_REQUEST");
    }

    #[test]
    fn parse_rejects_an_unknown_transfer_method() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1",
            Some("erc7710"),
            Some(auth(Address::ZERO)),
            None,
            None,
        )
        .expect_err("expected unknown-method rejection");
        assert_eq!(err.code(), "UNSUPPORTED_TRANSFER_METHOD");
    }
}
