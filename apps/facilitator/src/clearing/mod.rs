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
//! signature — EIP-3009 `receiveWithAuthorization`, or a Permit2 `PermitTransferFrom` for tokens
//! without EIP-3009. Either way the signature binds the receiver/spender (the ClearingHouse), the
//! exact amount, and — because both entry points require the nonce to equal the cycle id — the
//! cycle it settles, so a relayer can change none of them.
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

use alloy::primitives::{Address, B256, U256};
use sdk_4mica::contract::Core4Mica::{Permit2Authorization, ReceiveAuthorization};

use crate::deposit::eip712::{
    permit_transfer_from_digest, permit2_domain_separator, receive_authorization_digest,
    recover_signer, require_signer_from_bytes,
};
use crate::deposit::{
    ASSET_TRANSFER_METHOD_EIP3009, ASSET_TRANSFER_METHOD_PERMIT2, Eip2612Permit,
    ensure_permit2_allowance, needs_permit2_allowance, submit_permit,
};
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
    /// Identifies one payment for in-flight deduplication. The cycle id doubles as the
    /// authorization's nonce in both schemes (the contract requires it), so keying on it collides
    /// exactly the submissions that would revert as `AlreadyPaid` or a burnt nonce after paying
    /// gas.
    fn dedup_key(&self) -> B256 {
        self.cycle_id
    }
}

/// Which signature scheme pulls the debtor's funds. Mirrors
/// [`crate::deposit::DepositAuthorization`], travelling under the same x402
/// `assetTransferMethod` names.
#[derive(Debug, Clone)]
pub enum PayAuthorization {
    /// The token itself verifies the signature and enforces the nonce. Truly gasless.
    Eip3009(ReceiveAuthorization),
    /// Routed through the canonical Permit2 contract, so it works for any ERC-20 — at the cost of
    /// a one-time `approve(PERMIT2, ...)`, which `permit` sponsors when the token supports
    /// EIP-2612 and the debtor has not approved already.
    Permit2 {
        authorization: Permit2Authorization,
        permit: Option<Eip2612Permit>,
    },
}

impl PayAuthorization {
    pub fn parse(
        asset_transfer_method: Option<&str>,
        eip3009: Option<ReceiveAuthorization>,
        permit2: Option<Permit2Authorization>,
        permit: Option<Eip2612Permit>,
    ) -> Result<Self, PayError> {
        if permit.is_some() && permit2.is_none() {
            return Err(PayError::InvalidRequest(
                "`eip2612Permit` only applies to a permit2 payment".into(),
            ));
        }

        // Exactly one authorization, mirroring the deposit endpoint's shape.
        let authorization = match (eip3009, permit2) {
            (Some(auth), None) => Self::Eip3009(auth),
            (None, Some(authorization)) => Self::Permit2 {
                authorization,
                permit,
            },
            (None, None) => {
                return Err(PayError::InvalidRequest(
                    "one of `authorization` or `permit2Authorization` is required".into(),
                ));
            }
            (Some(_), Some(_)) => {
                return Err(PayError::InvalidRequest(
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
                return Err(PayError::InvalidRequest(format!(
                    "assetTransferMethod is {method} but a {} authorization was supplied",
                    authorization.method()
                )));
            }
            Some(other) => {
                return Err(PayError::UnsupportedTransferMethod(other.to_string()));
            }
        }

        Ok(authorization)
    }

    /// The debtor — the signer, whose funds pay the debit. Bound inside the signature in both
    /// schemes, so it can never be the relayer.
    pub fn from(&self) -> Address {
        match self {
            Self::Eip3009(auth) => auth.from,
            Self::Permit2 { authorization, .. } => authorization.from,
        }
    }

    fn method(&self) -> &'static str {
        match self {
            Self::Eip3009(_) => ASSET_TRANSFER_METHOD_EIP3009,
            Self::Permit2 { .. } => ASSET_TRANSFER_METHOD_PERMIT2,
        }
    }
}

/// Runs every payment check that can be made without broadcasting: the authorization's window,
/// nonce binding and signature, the debtor's token balance, and a priced simulation.
pub async fn verify_pay(
    relayer: &Relayer,
    limits: &SponsorLimits,
    terms: &PayTerms,
    auth: &PayAuthorization,
    now: u64,
) -> Result<(), PayError> {
    let token = DepositToken::new(terms.asset, relayer.provider());

    // Scheme-specific: expiry semantics, which domain the signature is under, and the replay guard
    // all differ. Everything after this point is common.
    match auth {
        PayAuthorization::Eip3009(auth) => {
            verify_pay_eip3009(relayer, &token, terms, auth, now).await?
        }
        PayAuthorization::Permit2 {
            authorization,
            permit,
        } => {
            verify_pay_permit2(relayer, &token, terms, authorization, permit.as_ref(), now).await?
        }
    }

    let balance =
        token.balanceOf(auth.from()).call().await.map_err(|err| {
            PayError::Chain(anyhow::Error::new(err).context("read debtor balance"))
        })?;
    if balance < terms.amount {
        return Err(PayError::InsufficientBalance {
            balance,
            needed: terms.amount,
        });
    }

    // A sponsored permit has not been submitted yet at verification time, so Permit2 still has no
    // allowance and simulating the payment would revert — a guaranteed false negative rather than
    // a useful signal. The explicit `.gas(max_gas)` on the send still bounds the cost.
    if matches!(
        auth,
        PayAuthorization::Permit2 {
            permit: Some(_),
            ..
        }
    ) {
        tracing::debug!(
            asset = %terms.asset,
            "skipping simulation: the sponsored permit lands before the payment"
        );
        return Ok(());
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

async fn verify_pay_eip3009(
    relayer: &Relayer,
    token: &DepositToken::DepositTokenInstance<alloy::providers::DynProvider>,
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

    Ok(())
}

async fn verify_pay_permit2(
    relayer: &Relayer,
    token: &DepositToken::DepositTokenInstance<alloy::providers::DynProvider>,
    terms: &PayTerms,
    auth: &Permit2Authorization,
    permit: Option<&Eip2612Permit>,
    now: u64,
) -> Result<(), PayError> {
    let deadline = auth.deadline.saturating_to::<u64>();
    if deadline <= now {
        return Err(PayError::Expired {
            valid_before: deadline,
            now,
        });
    }
    if auth.nonce != U256::from_be_bytes(terms.cycle_id.0) {
        return Err(PayError::InvalidRequest(format!(
            "the authorization's nonce {:#x} must name the cycle {:#x} it settles",
            auth.nonce, terms.cycle_id
        )));
    }

    // The digest binds the ClearingHouse as spender and the committed amount — the terms core
    // proved, not anything the caller sent. A signature over different terms simply mismatches.
    let digest = permit_transfer_from_digest(
        permit2_domain_separator(relayer.chain_id()),
        terms.asset,
        terms.amount,
        terms.clearing_house,
        auth.nonce,
        auth.deadline,
    );
    require_signer_from_bytes(&digest, auth.signature.as_ref(), auth.from)?;

    // Permit2 tracks nonces in a bitmap rather than a boolean map; the simulation catches a
    // reused one, so there is no cheap pre-check worth the extra round trip.
    ensure_permit2_allowance(
        relayer,
        token,
        terms.asset,
        terms.amount,
        auth.from,
        permit,
        now,
    )
    .await?;
    Ok(())
}

async fn estimate_pay_gas(
    relayer: &Relayer,
    terms: &PayTerms,
    auth: &PayAuthorization,
) -> Result<u64, PayError> {
    let contract = relayer.clearing_house(terms.clearing_house);
    let from = relayer.address();
    match auth {
        PayAuthorization::Eip3009(auth) => {
            contract
                .payNetDebitWithAuthorization(
                    terms.cycle_id,
                    terms.amount,
                    terms.proof.clone(),
                    chain_auth(auth),
                )
                .from(from)
                .estimate_gas()
                .await
        }
        PayAuthorization::Permit2 { authorization, .. } => {
            contract
                .payNetDebitWithPermit2(
                    terms.cycle_id,
                    terms.amount,
                    terms.proof.clone(),
                    chain_permit2_auth(authorization),
                )
                .from(from)
                .estimate_gas()
                .await
        }
    }
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
    auth: &PayAuthorization,
    now: u64,
) -> Result<B256, PayError> {
    verify_pay(relayer, guard.limits(), terms, auth, now).await?;

    let _permit: SponsorPermit = guard.reserve(terms.debtor, terms.dedup_key())?;

    let balance = relayer.cached_balance().await?;
    guard.check_relayer_balance(balance)?;

    // Submit the sponsored approval first, if one is still needed. Deliberately a separate
    // transaction: see [`crate::deposit::Eip2612Permit`] for why atomicity is not required.
    if let PayAuthorization::Permit2 {
        authorization,
        permit: Some(permit),
    } = auth
        && needs_permit2_allowance(relayer, terms.asset, terms.amount, authorization.from).await?
    {
        submit_permit(
            relayer,
            terms.asset,
            authorization.from,
            permit,
            guard.limits().max_gas,
        )
        .await?;
    }

    let contract = relayer.clearing_house(terms.clearing_house);
    // Explicit gas rather than estimated: an estimate is advisory, a limit is enforced. Unused gas
    // is refunded, so this caps the worst case without costing anything normally.
    let gas = guard.limits().max_gas;
    let pending = match auth {
        PayAuthorization::Eip3009(auth) => {
            contract
                .payNetDebitWithAuthorization(
                    terms.cycle_id,
                    terms.amount,
                    terms.proof.clone(),
                    chain_auth(auth),
                )
                .gas(gas)
                .send()
                .await
        }
        PayAuthorization::Permit2 { authorization, .. } => {
            contract
                .payNetDebitWithPermit2(
                    terms.cycle_id,
                    terms.amount,
                    terms.proof.clone(),
                    chain_permit2_auth(authorization),
                )
                .gas(gas)
                .send()
                .await
        }
    }
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

/// [`chain_auth`], for the Permit2 shape.
fn chain_permit2_auth(auth: &Permit2Authorization) -> ClearingHouse::Permit2Authorization {
    ClearingHouse::Permit2Authorization {
        from: auth.from,
        nonce: auth.nonce,
        deadline: auth.deadline,
        signature: auth.signature.clone(),
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

    fn eip3009_auth(from: Address) -> ReceiveAuthorization {
        ReceiveAuthorization {
            from,
            validAfter: U256::ZERO,
            validBefore: U256::from(2_000_000_000u64),
            nonce: B256::repeat_byte(0xaa),
            v: 27,
            r: B256::ZERO,
            s: B256::ZERO,
        }
    }

    fn permit2_auth(from: Address) -> Permit2Authorization {
        Permit2Authorization {
            from,
            nonce: U256::from_be_bytes(B256::repeat_byte(0xaa).0),
            deadline: U256::from(2_000_000_000u64),
            signature: vec![0u8; 65].into(),
        }
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
    fn parse_defaults_to_eip3009_when_method_is_absent() {
        let auth =
            PayAuthorization::parse(None, Some(eip3009_auth(Address::ZERO)), None, None).unwrap();
        assert!(matches!(auth, PayAuthorization::Eip3009(_)));
    }

    #[test]
    fn parse_accepts_a_permit2_authorization() {
        let auth = PayAuthorization::parse(
            Some("permit2"),
            None,
            Some(permit2_auth(Address::ZERO)),
            None,
        )
        .unwrap();
        assert!(matches!(
            auth,
            PayAuthorization::Permit2 { permit: None, .. }
        ));
    }

    #[test]
    fn parse_accepts_a_sponsored_permit_alongside_permit2() {
        let auth = PayAuthorization::parse(
            None,
            None,
            Some(permit2_auth(Address::ZERO)),
            Some(eip2612_permit()),
        )
        .unwrap();
        assert!(matches!(
            auth,
            PayAuthorization::Permit2 {
                permit: Some(_),
                ..
            }
        ));
    }

    /// An EIP-3009 payment never needs an approval, so a permit alongside one means the caller has
    /// misunderstood the flow — better to say so than to ignore a signature they paid to produce.
    #[test]
    fn parse_rejects_a_permit_without_permit2() {
        let err = PayAuthorization::parse(
            None,
            Some(eip3009_auth(Address::ZERO)),
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
        let err = PayAuthorization::parse(
            Some("permit2"),
            Some(eip3009_auth(Address::ZERO)),
            None,
            None,
        )
        .expect_err("expected mismatch rejection");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }

    #[test]
    fn parse_requires_exactly_one_authorization() {
        let none = PayAuthorization::parse(None, None, None, None)
            .expect_err("expected missing rejection");
        assert_eq!(none.code(), "INVALID_REQUEST");

        let both = PayAuthorization::parse(
            None,
            Some(eip3009_auth(Address::ZERO)),
            Some(permit2_auth(Address::ZERO)),
            None,
        )
        .expect_err("expected both-authorizations rejection");
        assert_eq!(both.code(), "INVALID_REQUEST");
    }

    #[test]
    fn parse_rejects_an_unknown_transfer_method() {
        let err = PayAuthorization::parse(
            Some("erc7710"),
            Some(eip3009_auth(Address::ZERO)),
            None,
            None,
        )
        .expect_err("expected unknown-method rejection");
        assert_eq!(err.code(), "UNSUPPORTED_TRANSFER_METHOD");
    }

    /// The debtor is always the signer, whichever scheme travels.
    #[test]
    fn the_debtor_is_the_signer_in_both_schemes() {
        let debtor = address!("00000000000000000000000000000000000000d1");
        let eip3009 =
            PayAuthorization::parse(None, Some(eip3009_auth(debtor)), None, None).unwrap();
        assert_eq!(eip3009.from(), debtor);
        let permit2 =
            PayAuthorization::parse(None, None, Some(permit2_auth(debtor)), None).unwrap();
        assert_eq!(permit2.from(), debtor);
    }
}
