//! Gasless withdrawal verification and submission.
//!
//! The user signs an EIP-712 authorization and never touches the chain; this module checks that
//! signature and, on `/withdraw`, broadcasts the matching Core4Mica call with the relayer paying
//! gas.
//!
//! # Trust model
//!
//! The signed digest binds the user, the asset, the amount and the validity window, and Core4Mica
//! applies the action to `auth.user` rather than `msg.sender`. So a relayer that alters any field
//! produces a signature that no longer recovers, and the transaction reverts. The worst a malicious
//! relayer can do is refuse to submit.
//!
//! Finalization carries no signature at all. It needs none: `finalizeWithdrawalFor` pays the user,
//! and the amount was fixed when they requested it — so a submitter gains nothing by calling it.
//!
//! As with deposits, verification here is a **gas optimisation, not a security boundary**. It
//! exists so the facilitator does not pay for transactions that were always going to revert; every
//! check is re-enforced on-chain.

mod error;

use std::sync::Arc;

use alloy::primitives::{Address, B256, Signature, U256};
use alloy::providers::Provider;
use sdk_4mica::contract::Core4Mica::{
    WithdrawalCancelAuthorization, WithdrawalRequestAuthorization,
};
use sdk_4mica::digest::{
    eip712_digest_for_cancel_withdrawal, eip712_digest_for_request_withdrawal,
};

use crate::limits::{SponsorGuard, SponsorLimits, SponsorPermit};
use crate::relayer::Relayer;

pub use error::WithdrawError;

use error::classify_call_error;

/// Which withdrawal step to sponsor.
#[derive(Debug)]
pub enum WithdrawIntent {
    /// Open a withdrawal request, starting its grace period.
    Request(WithdrawalRequestAuthorization),
    /// Clear a pending request before its grace period elapses.
    Cancel(WithdrawalCancelAuthorization),
    /// Pay out an elapsed request. Permissionless, so there is nothing to sign.
    Finalize { user: Address, asset: Address },
}

impl WithdrawIntent {
    /// The account the action applies to. Bound inside the signature for the two signed variants,
    /// so it can never be the relayer.
    pub fn user(&self) -> Address {
        match self {
            Self::Request(auth) => auth.user,
            Self::Cancel(auth) => auth.user,
            Self::Finalize { user, .. } => *user,
        }
    }

    pub fn asset(&self) -> Address {
        match self {
            Self::Request(auth) => auth.asset,
            Self::Cancel(auth) => auth.asset,
            Self::Finalize { asset, .. } => *asset,
        }
    }

    /// Identifies one action for in-flight deduplication.
    ///
    /// The signed variants use their authorization nonce. Finalization has none, so it keys on the
    /// asset — which is exactly right: two concurrent finalizations of the same (user, asset) are a
    /// duplicate, and one of them would revert.
    pub fn dedup_key(&self) -> B256 {
        match self {
            Self::Request(auth) => auth.nonce,
            Self::Cancel(auth) => auth.nonce,
            Self::Finalize { asset, .. } => asset.into_word(),
        }
    }

    pub fn action(&self) -> &'static str {
        match self {
            Self::Request(_) => "request",
            Self::Cancel(_) => "cancel",
            Self::Finalize { .. } => "finalize",
        }
    }

    /// The requested amount, for the request variant only. Echoed back to the caller.
    pub fn amount(&self) -> Option<U256> {
        match self {
            Self::Request(auth) => Some(auth.amount),
            _ => None,
        }
    }
}

/// Runs every check that can be made without broadcasting, cheapest first.
///
/// Ordering is deliberate: local checks before any RPC round trip, and the simulation last since it
/// is the most expensive. The simulation is what catches everything the earlier checks cannot see —
/// a paused contract, an unelapsed grace period, an amount above the withdrawable balance.
pub async fn verify(
    relayer: &Relayer,
    limits: &SponsorLimits,
    intent: &WithdrawIntent,
    now: u64,
) -> Result<(), WithdrawError> {
    match intent {
        WithdrawIntent::Request(auth) => {
            check_window(auth.validAfter, auth.validBefore, now)?;
            let digest = eip712_digest_for_request_withdrawal(
                relayer.core_domain_separator().await?,
                auth.user,
                auth.asset,
                auth.amount,
                auth.validAfter,
                auth.validBefore,
                auth.nonce,
            );
            check_signature(relayer, &digest, &auth.signature, auth.user).await?;
            check_nonce(relayer, auth.user, auth.nonce).await?;
        }
        WithdrawIntent::Cancel(auth) => {
            check_window(auth.validAfter, auth.validBefore, now)?;
            let digest = eip712_digest_for_cancel_withdrawal(
                relayer.core_domain_separator().await?,
                auth.user,
                auth.asset,
                auth.validAfter,
                auth.validBefore,
                auth.nonce,
            );
            check_signature(relayer, &digest, &auth.signature, auth.user).await?;
            check_nonce(relayer, auth.user, auth.nonce).await?;
        }
        // Nothing to check locally: there is no signature, and whether a request exists and its
        // grace period has elapsed are both chain state the simulation reads anyway.
        WithdrawIntent::Finalize { .. } => {}
    }

    // `eth_estimateGas` executes the call against current state, so it both proves the call
    // succeeds and prices it — no separate `eth_call` needed.
    let estimated = estimate_gas(relayer, intent).await?;
    if estimated > limits.max_gas {
        return Err(WithdrawError::GasCeilingExceeded {
            estimated,
            ceiling: limits.max_gas,
        });
    }

    Ok(())
}

fn check_window(valid_after: U256, valid_before: U256, now: u64) -> Result<(), WithdrawError> {
    let valid_before = valid_before.saturating_to::<u64>();
    if valid_before <= now {
        return Err(WithdrawError::Expired { valid_before, now });
    }
    let valid_after = valid_after.saturating_to::<u64>();
    if valid_after > now {
        return Err(WithdrawError::NotYetValid { valid_after, now });
    }
    Ok(())
}

/// Recovers the signature and asserts it matches the declared user.
///
/// A mismatch is only fatal for an EOA. Core4Mica verifies through `SignatureChecker`, which also
/// accepts an EIP-1271 contract signature — and those cannot be recovered from here at all. So when
/// the declared user has code, this defers to the simulation rather than rejecting a smart account
/// outright. The extra `eth_getCode` runs only on the mismatch path.
async fn check_signature(
    relayer: &Relayer,
    digest: &B256,
    signature: &[u8],
    declared: Address,
) -> Result<(), WithdrawError> {
    let parsed = Signature::try_from(signature).map_err(|err| {
        WithdrawError::MalformedSignature(format!("invalid withdrawal signature: {err}"))
    })?;
    let recovered = parsed.recover_address_from_prehash(digest).map_err(|err| {
        WithdrawError::MalformedSignature(format!("unrecoverable signature: {err}"))
    })?;
    if recovered == declared {
        return Ok(());
    }

    let code = relayer
        .provider()
        .get_code_at(declared)
        .await
        .map_err(|err| WithdrawError::Chain(anyhow::Error::new(err).context("eth_getCode")))?;
    if code.is_empty() {
        return Err(WithdrawError::SignatureMismatch {
            recovered,
            declared,
        });
    }

    tracing::debug!(
        user = %declared,
        "declared user is a contract; deferring signature validation to EIP-1271 on-chain"
    );
    Ok(())
}

/// Cheap and decisive: a spent nonce always reverts, so paying gas to discover that is pure loss.
async fn check_nonce(relayer: &Relayer, user: Address, nonce: B256) -> Result<(), WithdrawError> {
    let used = relayer
        .contract()
        .authorizationState(user, nonce)
        .call()
        .await
        .map_err(classify_call_error)?;
    if used {
        return Err(WithdrawError::NonceAlreadyUsed);
    }
    Ok(())
}

async fn estimate_gas(relayer: &Relayer, intent: &WithdrawIntent) -> Result<u64, WithdrawError> {
    let contract = relayer.contract();
    let from = relayer.address();
    match intent {
        WithdrawIntent::Request(auth) => {
            contract
                .requestWithdrawalWithAuthorization(auth.clone())
                .from(from)
                .estimate_gas()
                .await
        }
        WithdrawIntent::Cancel(auth) => {
            contract
                .cancelWithdrawalWithAuthorization(auth.clone())
                .from(from)
                .estimate_gas()
                .await
        }
        WithdrawIntent::Finalize { user, asset } => {
            contract
                .finalizeWithdrawalFor(*user, *asset)
                .from(from)
                .estimate_gas()
                .await
        }
    }
    .map_err(classify_call_error)
}

/// Verifies, reserves capacity, then broadcasts and waits for the receipt.
///
/// Re-verifies rather than trusting an earlier `/withdraw/verify`: the two are separate requests,
/// and state can change in between (nonce consumed, request cancelled, authorization expired).
///
/// The rate-limit reservation deliberately happens *after* verification. `user` is just a claim
/// until the signature recovers to it, so reserving earlier would let a caller evade per-address
/// limits by varying it on every request.
pub async fn submit(
    relayer: &Relayer,
    guard: &Arc<SponsorGuard>,
    intent: &WithdrawIntent,
    now: u64,
) -> Result<B256, WithdrawError> {
    verify(relayer, guard.limits(), intent, now).await?;

    // `user` is proven from here on — except for finalization, where it need not be: that call pays
    // the user whoever submits it, so an attacker gains nothing by naming someone else, and the
    // simulation above already proved the request exists and is payable.
    let _permit: SponsorPermit = guard.reserve(intent.user(), intent.dedup_key())?;

    let balance = relayer.cached_balance().await?;
    guard.check_relayer_balance(balance)?;

    let contract = relayer.contract();
    // Explicit gas rather than estimated: an estimate is advisory, a limit is enforced. Unused gas
    // is refunded, so this caps the worst case without costing anything normally.
    let gas = guard.limits().max_gas;
    let pending = match intent {
        WithdrawIntent::Request(auth) => {
            contract
                .requestWithdrawalWithAuthorization(auth.clone())
                .gas(gas)
                .send()
                .await
        }
        WithdrawIntent::Cancel(auth) => {
            contract
                .cancelWithdrawalWithAuthorization(auth.clone())
                .gas(gas)
                .send()
                .await
        }
        WithdrawIntent::Finalize { user, asset } => {
            contract
                .finalizeWithdrawalFor(*user, *asset)
                .gas(gas)
                .send()
                .await
        }
    }
    .map_err(|err| WithdrawError::Broadcast(err.to_string()))?;

    // Past this point the transaction is on the wire, so a failure is no longer safe to retry.
    let tx_hash = *pending.tx_hash();
    let receipt = pending
        .get_receipt()
        .await
        .map_err(|err| WithdrawError::ReceiptUnavailable {
            tx_hash,
            reason: err.to_string(),
        })?;

    if !receipt.status() {
        return Err(WithdrawError::RevertedOnChain {
            tx_hash: receipt.transaction_hash,
        });
    }

    Ok(receipt.transaction_hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, b256};

    fn request(nonce: B256) -> WithdrawIntent {
        WithdrawIntent::Request(WithdrawalRequestAuthorization {
            user: address!("00000000000000000000000000000000000000a1"),
            asset: address!("000000000000000000000000000000000000da0c"),
            amount: U256::from(1_000u64),
            validAfter: U256::ZERO,
            validBefore: U256::from(2_000_000_000u64),
            nonce,
            signature: vec![0u8; 65].into(),
        })
    }

    #[test]
    fn a_signed_intent_dedups_on_its_nonce() {
        let nonce = b256!("dead00000000000000000000000000000000000000000000000000000000beef");
        assert_eq!(request(nonce).dedup_key(), nonce);
    }

    /// Finalization has no nonce, so two concurrent submissions for the same asset must still
    /// collide — otherwise both broadcast and one reverts after paying gas.
    #[test]
    fn finalization_dedups_on_the_asset() {
        let asset = address!("000000000000000000000000000000000000da0c");
        let intent = WithdrawIntent::Finalize {
            user: address!("00000000000000000000000000000000000000a1"),
            asset,
        };
        assert_eq!(intent.dedup_key(), asset.into_word());
    }

    #[test]
    fn the_window_rejects_an_expired_authorization() {
        let err = check_window(U256::ZERO, U256::from(100u64), 100).expect_err("expired");
        assert_eq!(err.code(), "EXPIRED");
    }

    #[test]
    fn the_window_rejects_an_authorization_that_is_not_yet_valid() {
        let err =
            check_window(U256::from(200u64), U256::from(300u64), 100).expect_err("not yet valid");
        assert_eq!(err.code(), "NOT_YET_VALID");
    }

    #[test]
    fn the_window_accepts_an_authorization_inside_it() {
        check_window(U256::ZERO, U256::from(200u64), 100).expect("inside the window");
    }
}
