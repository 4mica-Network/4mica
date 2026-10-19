//! Payment guarantees: the payer signs a request, the recipient redeems it for a receipt the
//! operator signed, and either side can verify that receipt offline.

use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use alloy::primitives::{Address, B256, U256};
use alloy::signers::{Signature, Signer};
use alloy::sol_types::Eip712Domain;
use rpc::{
    ActiveCycleResponse, ApiClientError, CheckpointAcceptedResponse, CheckpointBatchResponse,
    CheckpointPayload, ERROR_CODE_CHECKPOINT_REQUIRED, ERROR_CODE_CYCLE_MISMATCH,
    ERROR_CODE_TIMESTAMP_NOT_PAST_CUTOFF, Guarantee, GuaranteeReceipt, PaymentRequest,
    PaymentRequestPayload, SignedCheckpoint,
};

use crate::{
    client::{ClientCtx, model::Asset, model::RecipientPaymentInfo},
    error::PaymentError,
    sig::PayerSigner,
};

pub struct PaymentClient<S> {
    ctx: ClientCtx<S>,
}

impl<S> Clone for PaymentClient<S> {
    fn clone(&self) -> Self {
        Self {
            ctx: self.ctx.clone(),
        }
    }
}

impl<S> PaymentClient<S> {
    pub(super) fn new(ctx: ClientCtx<S>) -> Self {
        Self { ctx }
    }

    /// Checks that `receipt` was issued by the operator this client trusts, returning the
    /// guarantee it attests.
    ///
    /// Offline: nothing here reaches the chain or the operator.
    pub fn verify_guarantee(&self, receipt: &GuaranteeReceipt) -> Result<Guarantee, PaymentError> {
        verify_guarantee_receipt(
            receipt,
            &self.ctx.guarantee_domain(),
            self.ctx.guarantee_signer(),
        )
    }
}

/// Checks that `receipt` carries `guarantee_signer`'s signature over the guarantee it holds, and
/// returns that guarantee.
///
/// Standalone so a service that never builds a [`crate::Client`] — a facilitator vouching for a
/// receipt it is asked to act on — can run the same check. `domain` is
/// [`rpc::guarantee_registry_domain`] for the deployment the receipt was issued by.
pub fn verify_guarantee_receipt(
    receipt: &GuaranteeReceipt,
    domain: &Eip712Domain,
    guarantee_signer: Address,
) -> Result<Guarantee, PaymentError> {
    let guarantee = receipt.guarantee()?;
    let digest = guarantee.signing_digest(domain);

    let recovered = receipt
        .signature
        .parse::<Signature>()
        .map_err(|_| PaymentError::UnreadableReceiptSignature)?
        .recover_address_from_prehash(&digest)
        .map_err(|_| PaymentError::UnreadableReceiptSignature)?;

    if recovered != guarantee_signer {
        return Err(PaymentError::ReceiptSignerMismatch {
            expected: guarantee_signer,
            recovered,
        });
    }

    Ok(guarantee)
}

impl<S> PaymentClient<S>
where
    S: Signer + Send + Sync,
{
    /// A payment payload for the configured signer, scoped to the asset's active settlement cycle.
    ///
    /// Waits out the remainder of the current second when the payer's last checkpoint covers it,
    /// since a payment must be stamped strictly after what the checkpoint already accounts for.
    pub async fn new_payment(
        &self,
        recipient: Address,
        amount: U256,
        asset: Asset,
    ) -> Result<PaymentRequestPayload, PaymentError> {
        let cycle = self.ctx.active_cycle(asset.address()).await?;
        let timestamp = self.next_payment_timestamp(asset.address()).await;

        Ok(PaymentRequestPayload::new(
            self.ctx.signer_address().to_string(),
            recipient.to_string(),
            cycle.id,
            U256::from_be_bytes(rand::random::<[u8; 32]>()),
            amount,
            timestamp,
            match asset {
                Asset::Native => None,
                Asset::Erc20(token) => Some(token.to_string()),
            },
            B256::from(rand::random::<[u8; 32]>()),
        ))
    }

    /// Signs a payment as the payer. Hand the result to the recipient, who redeems it with
    /// [`Self::issue_guarantee`].
    pub async fn sign_request(
        &self,
        payload: PaymentRequestPayload,
    ) -> Result<PaymentRequest, PaymentError> {
        self.ctx
            .signer()
            .sign_payment_request(&self.ctx.clearing_house_domain(), payload)
            .await
    }

    /// Signs and submits a checkpoint covering the payer's outstanding payments in `asset`'s active
    /// cycle.
    ///
    /// Returns `None` when there is nothing to cover.
    pub async fn checkpoint_active_cycle(
        &self,
        asset: Asset,
    ) -> Result<Option<CheckpointAcceptedResponse>, PaymentError> {
        let cycle = self.ctx.active_cycle(asset.address()).await?;
        self.checkpoint_cycle(asset, cycle.id).await
    }

    /// Signs and submits a checkpoint covering the payer's outstanding payments in `cycle_id`, such
    /// as the cycle a `CHECKPOINT_REQUIRED` refusal names.
    ///
    /// Returns `None` when there is nothing to cover.
    pub async fn checkpoint_cycle(
        &self,
        asset: Asset,
        cycle_id: B256,
    ) -> Result<Option<CheckpointAcceptedResponse>, PaymentError> {
        let batch = self.checkpoint_batch_for_cycle(asset, cycle_id).await?;
        let Some(payload) = checkpoint_payload(
            self.ctx.signer_address(),
            asset.address(),
            cycle_id,
            &self.ctx.clearing_house_domain(),
            &batch,
        )?
        else {
            return Ok(None);
        };

        let signed = self
            .ctx
            .signer()
            .sign_checkpoint(&self.ctx.clearing_house_domain(), payload)
            .await?;
        self.submit_checkpoint(signed).await.map(Some)
    }

    /// The timestamp to stamp a payment with, never at or before what a checkpoint already covers.
    async fn next_payment_timestamp(&self, asset: Address) -> u64 {
        let now = unix_now();
        let Some(cutoff) = self.ctx.payment_cutoff(asset).await else {
            return now;
        };
        if now > cutoff {
            return now;
        }

        tokio::time::sleep(Duration::from_secs(cutoff + 1 - now)).await;
        unix_now().max(cutoff + 1)
    }
}

impl<S> PaymentClient<S>
where
    S: Signer + Sync,
{
    /// Redeems a payer's signed request for the operator's guarantee receipt, as the recipient.
    pub async fn issue_guarantee(
        &self,
        request: PaymentRequest,
    ) -> Result<GuaranteeReceipt, PaymentError> {
        let asset = request
            .payload
            .asset_address()
            .parse::<Address>()
            .unwrap_or(Address::ZERO);

        match self.ctx.rpc_proxy().await?.issue_guarantee(request).await {
            Ok(receipt) => Ok(receipt),
            Err(err) => Err(self.classify(err, asset).await),
        }
    }

    /// The cycle payments for `asset` must be signed for right now.
    pub async fn active_cycle(&self, asset: Asset) -> Result<ActiveCycleResponse, PaymentError> {
        Ok(self
            .ctx
            .rpc_proxy()
            .await?
            .get_active_cycle(asset.address().to_string())
            .await?)
    }

    /// The payer's latest checkpoint in `asset`'s active cycle and the payments it does not cover
    /// yet.
    pub async fn checkpoint_batch(
        &self,
        asset: Asset,
    ) -> Result<CheckpointBatchResponse, PaymentError> {
        Ok(self
            .ctx
            .rpc_proxy()
            .await?
            .get_checkpoint_batch(
                self.ctx.signer_address().to_string(),
                asset.address().to_string(),
            )
            .await?)
    }

    /// The payer's latest checkpoint in `cycle_id` and the payments it does not cover yet.
    pub async fn checkpoint_batch_for_cycle(
        &self,
        asset: Asset,
        cycle_id: B256,
    ) -> Result<CheckpointBatchResponse, PaymentError> {
        Ok(self
            .ctx
            .rpc_proxy()
            .await?
            .get_checkpoint_batch_for_cycle(
                self.ctx.signer_address().to_string(),
                asset.address().to_string(),
                cycle_id,
            )
            .await?)
    }

    /// Submits a checkpoint the payer has already signed.
    ///
    /// Submitting a checkpoint that was already accepted succeeds and covers nothing.
    pub async fn submit_checkpoint(
        &self,
        signed: SignedCheckpoint,
    ) -> Result<CheckpointAcceptedResponse, PaymentError> {
        let asset = signed
            .payload
            .asset_address
            .parse::<Address>()
            .unwrap_or(Address::ZERO);

        let accepted = match self.ctx.rpc_proxy().await?.submit_checkpoint(signed).await {
            Ok(accepted) => accepted,
            Err(err) => return Err(self.classify(err, asset).await),
        };

        self.ctx
            .record_payment_cutoff(asset, accepted.timestamp_cutoff)
            .await;
        Ok(accepted)
    }

    /// Payments guaranteed to the signer as a recipient.
    pub async fn list_received(&self) -> Result<Vec<RecipientPaymentInfo>, PaymentError> {
        let address = self.ctx.signer_address().to_string();
        self.ctx
            .rpc_proxy()
            .await?
            .list_recipient_payments(address)
            .await?
            .into_iter()
            .map(|payment| RecipientPaymentInfo::try_from(payment).map_err(PaymentError::Decode))
            .collect()
    }

    /// Turns core's coded refusals into typed errors, and refreshes what they prove stale.
    async fn classify(&self, err: ApiClientError, asset: Address) -> PaymentError {
        match err.code() {
            Some(ERROR_CODE_CYCLE_MISMATCH) => {
                self.ctx.forget_active_cycle(asset).await;
                match err.details() {
                    Some(details) => PaymentError::CycleMismatch(Box::new(details)),
                    None => PaymentError::Rpc(err),
                }
            }
            Some(ERROR_CODE_TIMESTAMP_NOT_PAST_CUTOFF) => match err.details() {
                Some(details) => {
                    let details: rpc::TimestampNotPastCutoffDetails = details;
                    // A cutoff belongs to the payer it names. Issuance is the recipient's call, so
                    // the refusal often describes someone else, and holding back this client's own
                    // payments for a stranger's cutoff would be nothing but a delay.
                    if details
                        .payer
                        .parse::<Address>()
                        .is_ok_and(|payer| payer == self.ctx.signer_address())
                    {
                        self.ctx
                            .record_payment_cutoff(asset, details.timestamp_cutoff)
                            .await;
                    }
                    PaymentError::TimestampNotPastCutoff(Box::new(details))
                }
                None => PaymentError::Rpc(err),
            },
            Some(ERROR_CODE_CHECKPOINT_REQUIRED) => match err.details() {
                Some(details) => PaymentError::CheckpointRequired(Box::new(details)),
                None => PaymentError::Rpc(err),
            },
            _ => PaymentError::Rpc(err),
        }
    }
}

/// The checkpoint that covers `batch`, or `None` when it covers nothing new.
fn checkpoint_payload(
    payer: Address,
    asset: Address,
    cycle_id: B256,
    domain: &Eip712Domain,
    batch: &CheckpointBatchResponse,
) -> Result<Option<CheckpointPayload>, PaymentError> {
    if batch.authorizations.is_empty() {
        return Ok(None);
    }

    let batch_cycle = batch
        .cycle_id
        .parse::<B256>()
        .map_err(|_| PaymentError::Decode(format!("unreadable cycle id: {}", batch.cycle_id)))?;
    if batch_cycle != cycle_id {
        return Err(untrusted(format!(
            "batch is for cycle {batch_cycle:#x}, not {cycle_id:#x}"
        )));
    }
    if batch.asset_address.parse::<Address>().ok() != Some(asset) {
        return Err(untrusted(format!(
            "batch is for asset {}, not {asset}",
            batch.asset_address
        )));
    }

    let (mut cumulative_gross, previous_cutoff) = match &batch.previous {
        Some(previous) => {
            let checkpoint = &previous.payload;
            if checkpoint.payer.parse::<Address>().ok() != Some(payer)
                || checkpoint.cycle_id != cycle_id
                || checkpoint.asset_address.parse::<Address>().ok() != Some(asset)
            {
                return Err(untrusted(
                    "previous checkpoint is for another payer, cycle or asset".to_string(),
                ));
            }
            let digest = checkpoint
                .signing_digest(domain)
                .map_err(|err| untrusted(format!("previous checkpoint: {err}")))?;
            if recover(&previous.signature, digest) != Some(payer) {
                return Err(untrusted(
                    "previous checkpoint is not signed by the payer".to_string(),
                ));
            }
            (checkpoint.cumulative_gross, checkpoint.timestamp_cutoff)
        }
        None => (U256::ZERO, 0),
    };

    let mut req_ids = HashSet::with_capacity(batch.authorizations.len());
    let mut timestamp_cutoff = previous_cutoff;
    for authorization in &batch.authorizations {
        let payment = &authorization.payload;
        let req_id = payment.req_id();
        if payment.user_address().parse::<Address>().ok() != Some(payer)
            || payment.cycle_id() != cycle_id
            || payment.asset_address().parse::<Address>().ok() != Some(asset)
        {
            return Err(untrusted(format!(
                "authorization {req_id} is for another payer, cycle or asset"
            )));
        }
        let digest = payment
            .signing_digest(domain)
            .map_err(|err| untrusted(format!("authorization {req_id}: {err}")))?;
        if recover(&authorization.signature, digest) != Some(payer) {
            return Err(untrusted(format!(
                "authorization {req_id} is not signed by the payer"
            )));
        }
        if payment.timestamp() <= previous_cutoff {
            return Err(untrusted(format!(
                "authorization {req_id} is already covered by the previous checkpoint"
            )));
        }
        if !req_ids.insert(req_id) {
            return Err(untrusted(format!("authorization {req_id} appears twice")));
        }

        cumulative_gross = cumulative_gross
            .checked_add(payment.amount())
            .ok_or_else(|| PaymentError::InvalidParams("cumulative gross overflows".to_string()))?;
        timestamp_cutoff = timestamp_cutoff.max(payment.timestamp());
    }

    Ok(Some(CheckpointPayload {
        payer: payer.to_string(),
        cycle_id,
        asset_address: batch.asset_address.clone(),
        cumulative_gross,
        timestamp_cutoff,
    }))
}

fn untrusted(reason: String) -> PaymentError {
    PaymentError::UntrustedCheckpointBatch(reason)
}

fn recover(signature: &str, digest: B256) -> Option<Address> {
    signature
        .parse::<Signature>()
        .ok()?
        .recover_address_from_prehash(&digest)
        .ok()
}

pub(crate) fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::signers::SignerSync;
    use alloy::signers::local::PrivateKeySigner;
    use rpc::{
        CheckpointPayload, SignedCheckpoint, clearing_house_domain, guarantee_registry_domain,
    };

    const CHAIN_ID: u64 = 31337;
    const REGISTRY: &str = "0x0000000000000000000000000000000000065e61";
    const CLEARING_HOUSE: &str = "0x00000000000000000000000000000000000c1ea4";
    const RECIPIENT: &str = "0x00000000000000000000000000000000000000Be";
    const ASSET: Address = Address::ZERO;
    const CYCLE: B256 = B256::repeat_byte(0x11);

    fn domain() -> Eip712Domain {
        guarantee_registry_domain(CHAIN_ID, REGISTRY.parse().unwrap())
    }

    fn payer_domain() -> Eip712Domain {
        clearing_house_domain(CHAIN_ID, CLEARING_HOUSE.parse().unwrap())
    }

    fn payer() -> PrivateKeySigner {
        PrivateKeySigner::from_bytes(&B256::repeat_byte(0x01)).unwrap()
    }

    /// Request ids follow the timestamp, so payments at distinct times never collide.
    fn payment(amount: u64, timestamp: u64) -> PaymentRequestPayload {
        PaymentRequestPayload::new(
            payer().address().to_string(),
            RECIPIENT.to_string(),
            CYCLE,
            U256::from(timestamp),
            U256::from(amount),
            timestamp,
            Some(ASSET.to_string()),
            B256::repeat_byte(0x22),
        )
    }

    fn signed_by(signer: &PrivateKeySigner, payload: PaymentRequestPayload) -> PaymentRequest {
        let digest = payload.signing_digest(&payer_domain()).unwrap();
        let signature = signer.sign_hash_sync(&digest).unwrap();
        PaymentRequest::new(payload, alloy::hex::encode_prefixed(signature.as_bytes()))
    }

    fn checkpoint_by(signer: &PrivateKeySigner, gross: u64, cutoff: u64) -> SignedCheckpoint {
        let payload = CheckpointPayload {
            payer: payer().address().to_string(),
            cycle_id: CYCLE,
            asset_address: ASSET.to_string(),
            cumulative_gross: U256::from(gross),
            timestamp_cutoff: cutoff,
        };
        let digest = payload.signing_digest(&payer_domain()).unwrap();
        let signature = signer.sign_hash_sync(&digest).unwrap();
        SignedCheckpoint {
            payload,
            signature: alloy::hex::encode_prefixed(signature.as_bytes()),
        }
    }

    fn issued(signer: &PrivateKeySigner) -> (Guarantee, GuaranteeReceipt) {
        let guarantee =
            Guarantee::from_payment(&payment(1_000, 1_700_000_000), U256::from(0x11u64))
                .expect("valid addresses");
        let signature = signer
            .sign_hash_sync(&guarantee.signing_digest(&domain()))
            .expect("sign");
        let receipt = GuaranteeReceipt::new(
            &guarantee,
            alloy::hex::encode_prefixed(signature.as_bytes()),
        );
        (guarantee, receipt)
    }

    #[test]
    fn a_receipt_from_the_operator_verifies() {
        let operator = PrivateKeySigner::random();
        let (guarantee, receipt) = issued(&operator);

        let verified = verify_guarantee_receipt(&receipt, &domain(), operator.address())
            .expect("the operator's own receipt must verify");
        assert_eq!(verified, guarantee);
    }

    #[test]
    fn a_receipt_from_anyone_else_is_refused() {
        let (_, receipt) = issued(&PrivateKeySigner::random());
        let expected = PrivateKeySigner::random().address();

        let err = verify_guarantee_receipt(&receipt, &domain(), expected)
            .expect_err("a forged receipt must not verify");
        assert!(
            matches!(err, PaymentError::ReceiptSignerMismatch { .. }),
            "{err:?}"
        );
    }

    /// The domain is inside the digest, so a receipt minted for one deployment cannot be replayed
    /// against another.
    #[test]
    fn a_receipt_does_not_carry_to_another_deployment() {
        let operator = PrivateKeySigner::random();
        let (_, receipt) = issued(&operator);
        let elsewhere = guarantee_registry_domain(CHAIN_ID, RECIPIENT.parse().unwrap());

        let err = verify_guarantee_receipt(&receipt, &elsewhere, operator.address())
            .expect_err("another deployment's domain must not verify");
        assert!(
            matches!(err, PaymentError::ReceiptSignerMismatch { .. }),
            "{err:?}"
        );
    }

    #[test]
    fn a_truncated_receipt_is_refused() {
        let operator = PrivateKeySigner::random();
        let (_, mut receipt) = issued(&operator);
        receipt.receipt.truncate(10);

        let err = verify_guarantee_receipt(&receipt, &domain(), operator.address())
            .expect_err("a truncated receipt must not verify");
        assert!(matches!(err, PaymentError::MalformedReceipt(_)), "{err:?}");
    }

    fn batch(
        previous: Option<SignedCheckpoint>,
        authorizations: Vec<PaymentRequest>,
    ) -> CheckpointBatchResponse {
        CheckpointBatchResponse {
            cycle_id: format!("{CYCLE:#x}"),
            cycle_id_text: "0x0:1700000000".to_string(),
            asset_address: ASSET.to_string(),
            payer: payer().address().to_string(),
            previous,
            authorizations,
            max_uncheckpointed: 2,
        }
    }

    fn payments(entries: &[(u64, u64)]) -> Vec<PaymentRequest> {
        entries
            .iter()
            .map(|&(amount, timestamp)| signed_by(&payer(), payment(amount, timestamp)))
            .collect()
    }

    fn build(batch: &CheckpointBatchResponse) -> Result<Option<CheckpointPayload>, PaymentError> {
        checkpoint_payload(payer().address(), ASSET, CYCLE, &payer_domain(), batch)
    }

    fn refused(batch: &CheckpointBatchResponse) -> String {
        match build(batch) {
            Err(PaymentError::UntrustedCheckpointBatch(reason)) => reason,
            other => panic!("expected the batch to be refused, got {other:?}"),
        }
    }

    #[test]
    fn a_checkpoint_extends_the_previous_one() {
        let payload = build(&batch(
            Some(checkpoint_by(&payer(), 50, 1_699_999_000)),
            payments(&[(10, 1_700_000_000), (7, 1_700_000_500)]),
        ))
        .expect("builds")
        .expect("covers the batch");

        assert_eq!(payload.cumulative_gross, U256::from(67u64));
        assert_eq!(payload.timestamp_cutoff, 1_700_000_500);
    }

    #[test]
    fn a_first_checkpoint_starts_from_zero() {
        let payload = build(&batch(None, payments(&[(10, 1_700_000_000)])))
            .expect("builds")
            .expect("covers the batch");

        assert_eq!(payload.cumulative_gross, U256::from(10u64));
        assert_eq!(payload.timestamp_cutoff, 1_700_000_000);
    }

    /// The cutoff is the newest payment covered, not whatever arrived last.
    #[test]
    fn the_cutoff_is_the_latest_payment_whatever_the_order() {
        let payload = build(&batch(
            None,
            payments(&[(1, 1_700_000_900), (1, 1_700_000_100)]),
        ))
        .expect("builds")
        .expect("covers the batch");

        assert_eq!(payload.timestamp_cutoff, 1_700_000_900);
    }

    #[test]
    fn an_empty_batch_needs_no_checkpoint() {
        assert!(build(&batch(None, vec![])).expect("builds").is_none());
    }

    /// An operator that slips in a payment the payer never signed would inflate what the payer
    /// can be charged on default.
    #[test]
    fn a_payment_the_payer_did_not_sign_is_refused() {
        let mut authorizations = payments(&[(10, 1_700_000_000)]);
        authorizations.push(signed_by(
            &PrivateKeySigner::random(),
            payment(1_000_000, 1_700_000_100),
        ));

        let reason = refused(&batch(None, authorizations));
        assert!(reason.contains("not signed by the payer"), "{reason}");
    }

    #[test]
    fn a_payment_with_a_tampered_amount_is_refused() {
        let mut authorizations = payments(&[(10, 1_700_000_000)]);
        let PaymentRequestPayload::V1(inner) = &mut authorizations[0].payload;
        inner.amount = U256::from(10_000u64);

        let reason = refused(&batch(None, authorizations));
        assert!(reason.contains("not signed by the payer"), "{reason}");
    }

    #[test]
    fn another_payers_payment_is_refused() {
        let stranger = PrivateKeySigner::random();
        let mut theirs = payment(10, 1_700_000_000);
        let PaymentRequestPayload::V1(inner) = &mut theirs;
        inner.user_address = stranger.address().to_string();

        let reason = refused(&batch(None, vec![signed_by(&stranger, theirs)]));
        assert!(reason.contains("another payer"), "{reason}");
    }

    #[test]
    fn a_payment_from_another_cycle_is_refused() {
        let mut elsewhere = payment(10, 1_700_000_000);
        let PaymentRequestPayload::V1(inner) = &mut elsewhere;
        inner.cycle_id = B256::repeat_byte(0x33);

        let reason = refused(&batch(None, vec![signed_by(&payer(), elsewhere)]));
        assert!(reason.contains("another payer, cycle or asset"), "{reason}");
    }

    #[test]
    fn a_payment_counted_twice_is_refused() {
        let once = payments(&[(10, 1_700_000_000)]);
        let twice = vec![once[0].clone(), once[0].clone()];

        let reason = refused(&batch(None, twice));
        assert!(reason.contains("appears twice"), "{reason}");
    }

    #[test]
    fn a_payment_the_previous_checkpoint_covers_is_refused() {
        let reason = refused(&batch(
            Some(checkpoint_by(&payer(), 50, 1_700_000_000)),
            payments(&[(10, 1_700_000_000)]),
        ));
        assert!(reason.contains("already covered"), "{reason}");
    }

    /// The previous total is carried forward, so a forged one inflates the new checkpoint just as
    /// a forged payment would.
    #[test]
    fn a_previous_checkpoint_the_payer_did_not_sign_is_refused() {
        let reason = refused(&batch(
            Some(checkpoint_by(
                &PrivateKeySigner::random(),
                1_000_000,
                1_699_999_000,
            )),
            payments(&[(10, 1_700_000_000)]),
        ));
        assert!(reason.contains("previous checkpoint"), "{reason}");
    }

    #[test]
    fn a_batch_for_another_cycle_is_refused() {
        let mut other = batch(None, payments(&[(10, 1_700_000_000)]));
        other.cycle_id = format!("{:#x}", B256::repeat_byte(0x33));

        let reason = refused(&other);
        assert!(reason.contains("batch is for cycle"), "{reason}");
    }
}
