//! Sponsored clearing-cycle settlement: creditors' claims and debtors' payments.
//!
//! A creditor whose cycle has been funded is owed money, but claiming it costs a transaction — and
//! a creditor with no native balance cannot send one. A debtor owes money, and paying it costs a
//! transaction *plus* an allowance. This module lets the relayer send both for them.
//!
//! # Trust model
//!
//! `claimNetCreditFor` pays the address the committed Merkle leaf names, for the amount that leaf
//! fixes, so unlike the withdrawal flow there is nothing for the creditor to sign: a relayer cannot
//! redirect the payout or inflate it, and the worst it can do is decline to submit.
//!
//! A payment is different: it pulls money *out of* the debtor's wallet, so it carries the debtor's
//! EIP-3009 `receiveWithAuthorization` signature. The signature binds the receiver (the
//! ClearingHouse), the exact amount, and — because `payNetDebitWithAuthorization` requires
//! `nonce == cycleId` — the cycle it settles, so a relayer can change none of them.
//!
//! What the relayer *could* do is aim at the wrong contract, so the ClearingHouse address, the
//! amount and the proof are all resolved from core rather than taken from the request — see
//! [`actions`].
//!
//! As with deposits and withdrawals, verification here is a **gas optimisation, not a security
//! boundary**. Every check is re-enforced on-chain or by the token.

mod actions;
mod error;

use std::sync::Arc;

use alloy::primitives::{Address, B256};
use sdk_4mica::contract::Core4Mica::ReceiveAuthorization;

use crate::deposit::eip712::{receive_authorization_digest, recover_signer};
use crate::limits::{SponsorGuard, SponsorLimits, SponsorPermit};
use crate::relayer::{ClearingHouse, DepositToken, Relayer};

pub use actions::{ClaimTerms, ClearingActions, PayTerms};
pub use error::{ClaimError, PayError};

use error::{classify_call_error, classify_pay_call_error};

impl ClaimTerms {
    /// Identifies one claim for in-flight deduplication.
    ///
    /// A claim has no nonce, so this keys on the cycle. Two concurrent claims for the same
    /// (creditor, cycle) are a duplicate, and one of them would revert as `AlreadyClaimed` after
    /// paying gas — which is exactly what the guard exists to prevent.
    fn dedup_key(&self) -> B256 {
        self.cycle_id
    }
}

/// Runs every check that can be made without broadcasting.
///
/// There is no signature and no validity window, so unlike a withdrawal there is nothing to check
/// locally — whether the cycle is claimable, funded, and unclaimed is all chain state. The
/// simulation reads it in one round trip and prices the call at the same time.
pub async fn verify(
    relayer: &Relayer,
    limits: &SponsorLimits,
    terms: &ClaimTerms,
) -> Result<(), ClaimError> {
    let estimated = estimate_gas(relayer, terms).await?;
    if estimated > limits.max_gas {
        return Err(ClaimError::GasCeilingExceeded {
            estimated,
            ceiling: limits.max_gas,
        });
    }

    Ok(())
}

async fn estimate_gas(relayer: &Relayer, terms: &ClaimTerms) -> Result<u64, ClaimError> {
    relayer
        .clearing_house(terms.clearing_house)
        .claimNetCreditFor(
            terms.creditor,
            terms.cycle_id,
            terms.amount,
            terms.proof.clone(),
        )
        .from(relayer.address())
        .estimate_gas()
        .await
        .map_err(classify_call_error)
}

/// Verifies, reserves capacity, then broadcasts and waits for the receipt.
///
/// Re-verifies rather than trusting an earlier `/clearing/claim/verify`: the two are separate
/// requests, and the creditor may have claimed for themselves in between.
///
/// Unlike the withdrawal path, the rate-limit reservation can happen against `creditor` immediately:
/// core proved the leaf before these terms existed, so it is not merely a claim the caller made.
pub async fn submit(
    relayer: &Relayer,
    guard: &Arc<SponsorGuard>,
    terms: &ClaimTerms,
) -> Result<B256, ClaimError> {
    verify(relayer, guard.limits(), terms).await?;

    let _permit: SponsorPermit = guard.reserve(terms.creditor, terms.dedup_key())?;

    let balance = relayer.cached_balance().await?;
    guard.check_relayer_balance(balance)?;

    // Explicit gas rather than estimated: an estimate is advisory, a limit is enforced. Unused gas
    // is refunded, so this caps the worst case without costing anything normally.
    let pending = relayer
        .clearing_house(terms.clearing_house)
        .claimNetCreditFor(
            terms.creditor,
            terms.cycle_id,
            terms.amount,
            terms.proof.clone(),
        )
        .gas(guard.limits().max_gas)
        .send()
        .await
        .map_err(|err| ClaimError::Broadcast(err.to_string()))?;

    // Past this point the transaction is on the wire, so a failure is no longer safe to retry.
    let tx_hash = *pending.tx_hash();
    let receipt = pending
        .get_receipt()
        .await
        .map_err(|err| ClaimError::ReceiptUnavailable {
            tx_hash,
            reason: err.to_string(),
        })?;

    if !receipt.status() {
        return Err(ClaimError::RevertedOnChain {
            tx_hash: receipt.transaction_hash,
        });
    }

    Ok(receipt.transaction_hash)
}

impl PayTerms {
    /// Identifies one payment for in-flight deduplication. The cycle id doubles as the EIP-3009
    /// nonce (the contract requires it), so keying on it collides exactly the submissions that
    /// would revert as `AlreadyPaid` or a burnt nonce after paying gas.
    fn dedup_key(&self) -> B256 {
        self.cycle_id
    }
}

/// Runs every payment check that can be made without broadcasting: the authorization's window,
/// nonce binding and signature, the debtor's token balance, and a priced simulation.
pub async fn verify_pay(
    relayer: &Relayer,
    limits: &SponsorLimits,
    terms: &PayTerms,
    auth: &ReceiveAuthorization,
    now: u64,
) -> Result<(), PayError> {
    let valid_before = auth.validBefore.saturating_to::<u64>();
    if valid_before <= now {
        return Err(PayError::Expired { valid_before, now });
    }
    let valid_after = auth.validAfter.saturating_to::<u64>();
    if valid_after > now {
        return Err(PayError::NotYetValid { valid_after, now });
    }
    if auth.nonce != terms.cycle_id {
        return Err(PayError::InvalidRequest(format!(
            "the authorization's nonce {:#x} must name the cycle {:#x} it settles",
            auth.nonce, terms.cycle_id
        )));
    }

    // The digest binds the ClearingHouse as receiver and the committed amount — the terms core
    // proved, not anything the caller sent. A signature over different terms simply mismatches.
    let domain_separator = relayer
        .token_domain_separator(terms.asset)
        .await
        .map_err(|err| PayError::Chain(anyhow::Error::msg(err.to_string())))?;
    let digest = receive_authorization_digest(
        domain_separator,
        auth.from,
        terms.clearing_house,
        terms.amount,
        auth.validAfter,
        auth.validBefore,
        auth.nonce,
    );
    let recovered = recover_signer(&digest, auth.r, auth.s, auth.v)
        .map_err(|err| PayError::MalformedSignature(err.to_string()))?;
    if recovered != auth.from {
        return Err(PayError::SignatureMismatch {
            recovered,
            declared: auth.from,
        });
    }

    let token = DepositToken::new(terms.asset, relayer.provider());

    // Cheap and decisive: a used nonce always reverts, so paying gas to discover that is pure
    // loss. Best-effort — the simulation is authoritative for tokens without the accessor.
    match token.authorizationState(auth.from, auth.nonce).call().await {
        Ok(true) => return Err(PayError::NonceAlreadyUsed),
        Ok(false) => {}
        Err(err) => tracing::debug!(
            asset = %terms.asset,
            error = %err,
            "token does not expose authorizationState; relying on simulation for replay detection"
        ),
    }

    let balance =
        token.balanceOf(auth.from).call().await.map_err(|err| {
            PayError::Chain(anyhow::Error::new(err).context("read debtor balance"))
        })?;
    if balance < terms.amount {
        return Err(PayError::InsufficientBalance {
            balance,
            needed: terms.amount,
        });
    }

    let estimated = estimate_pay_gas(relayer, terms, auth).await?;
    if estimated > limits.max_gas {
        return Err(PayError::GasCeilingExceeded {
            estimated,
            ceiling: limits.max_gas,
        });
    }

    Ok(())
}

async fn estimate_pay_gas(
    relayer: &Relayer,
    terms: &PayTerms,
    auth: &ReceiveAuthorization,
) -> Result<u64, PayError> {
    relayer
        .clearing_house(terms.clearing_house)
        .payNetDebitWithAuthorization(
            terms.cycle_id,
            terms.amount,
            terms.proof.clone(),
            chain_auth(auth),
        )
        .from(relayer.address())
        .estimate_gas()
        .await
        .map_err(classify_pay_call_error)
}

/// Verifies, reserves capacity, then broadcasts and waits for the receipt.
///
/// Re-verifies rather than trusting an earlier `/clearing/pay/verify`: the two are separate
/// requests, and the debtor may have paid self-funded in between.
pub async fn submit_pay(
    relayer: &Relayer,
    guard: &Arc<SponsorGuard>,
    terms: &PayTerms,
    auth: &ReceiveAuthorization,
    now: u64,
) -> Result<B256, PayError> {
    verify_pay(relayer, guard.limits(), terms, auth, now).await?;

    let _permit: SponsorPermit = guard.reserve(terms.debtor, terms.dedup_key())?;

    let balance = relayer.cached_balance().await?;
    guard.check_relayer_balance(balance)?;

    // Explicit gas rather than estimated: an estimate is advisory, a limit is enforced. Unused gas
    // is refunded, so this caps the worst case without costing anything normally.
    let pending = relayer
        .clearing_house(terms.clearing_house)
        .payNetDebitWithAuthorization(
            terms.cycle_id,
            terms.amount,
            terms.proof.clone(),
            chain_auth(auth),
        )
        .gas(guard.limits().max_gas)
        .send()
        .await
        .map_err(|err| PayError::Broadcast(err.to_string()))?;

    // Past this point the transaction is on the wire, so a failure is no longer safe to retry.
    let tx_hash = *pending.tx_hash();
    let receipt = pending
        .get_receipt()
        .await
        .map_err(|err| PayError::ReceiptUnavailable {
            tx_hash,
            reason: err.to_string(),
        })?;

    if !receipt.status() {
        return Err(PayError::RevertedOnChain {
            tx_hash: receipt.transaction_hash,
        });
    }

    Ok(receipt.transaction_hash)
}

/// The wire authorization re-shaped into the contract binding's struct — same fields, different
/// `sol!` type.
fn chain_auth(auth: &ReceiveAuthorization) -> ClearingHouse::ReceiveAuthorization {
    ClearingHouse::ReceiveAuthorization {
        from: auth.from,
        validAfter: auth.validAfter,
        validBefore: auth.validBefore,
        nonce: auth.nonce,
        v: auth.v,
        r: auth.r,
        s: auth.s,
    }
}

/// Validates the identifiers a claim request carries. The rest of the transaction comes from core.
pub fn parse_creditor(value: &str) -> Result<Address, ClaimError> {
    value
        .trim()
        .parse()
        .map_err(|_| ClaimError::InvalidRequest(format!("invalid creditor address: {value}")))
}

/// [`parse_cycle_id`], for the payment path's error type.
pub fn parse_pay_cycle_id(value: &str) -> Result<&str, PayError> {
    parse_cycle_id(value).map_err(|err| PayError::InvalidRequest(err.to_string()))
}

/// The cycle id is core's identifier, not ours, so it stays a string — but it travels in a URL
/// path, so anything that could restructure that URL is rejected rather than encoded.
pub fn parse_cycle_id(value: &str) -> Result<&str, ClaimError> {
    let cycle_id = value.trim();
    if cycle_id.is_empty() {
        return Err(ClaimError::InvalidRequest("cycleId cannot be empty".into()));
    }
    if !cycle_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '-' | '_'))
    {
        return Err(ClaimError::InvalidRequest(format!(
            "invalid cycle id: {cycle_id}"
        )));
    }
    Ok(cycle_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{U256, address};

    fn terms(cycle_id: B256) -> ClaimTerms {
        ClaimTerms {
            clearing_house: address!("00000000000000000000000000000000c1ea4111"),
            cycle_id,
            creditor: address!("000000000000000000000000000000000000c0ed"),
            amount: U256::from(1_000u64),
            proof: Vec::new(),
        }
    }

    /// A claim has no nonce, so two concurrent submissions for the same cycle must still collide —
    /// otherwise both broadcast and one reverts as `AlreadyClaimed` after paying gas.
    #[test]
    fn a_claim_dedups_on_its_cycle() {
        let cycle = B256::repeat_byte(0xaa);
        assert_eq!(terms(cycle).dedup_key(), cycle);
    }

    #[test]
    fn claims_for_different_cycles_do_not_collide() {
        assert_ne!(
            terms(B256::repeat_byte(0xaa)).dedup_key(),
            terms(B256::repeat_byte(0xbb)).dedup_key()
        );
    }

    #[test]
    fn a_malformed_creditor_is_rejected() {
        let err = parse_creditor("not-an-address").expect_err("invalid address");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }

    #[test]
    fn both_cycle_id_forms_are_accepted() {
        assert_eq!(
            parse_cycle_id(" eth:1800000000 ").unwrap(),
            "eth:1800000000"
        );
        let hash = format!("{:#x}", B256::repeat_byte(0xaa));
        assert_eq!(parse_cycle_id(&hash).unwrap(), hash);
    }

    /// The cycle id is spliced into the path of a GET against core, so anything that could
    /// restructure that URL must be refused, not encoded.
    #[test]
    fn a_cycle_id_that_could_escape_its_path_segment_is_rejected() {
        for hostile in ["", "a/b", "..", "eth:1?admin", "eth:1#x", "eth 1"] {
            let err = parse_cycle_id(hostile).expect_err(hostile);
            assert_eq!(err.code(), "INVALID_REQUEST", "{hostile}");
        }
    }
}
