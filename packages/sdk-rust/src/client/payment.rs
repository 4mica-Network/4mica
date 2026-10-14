//! Payment guarantees: the payer signs a request, the recipient redeems it for a receipt the
//! operator signed, and either side can verify that receipt offline.

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

    /// Signs the checkpoint covering everything core holds for the payer in the cycle this
    /// client's payments are scoped to, and submits it.
    ///
    /// That cycle may have closed since the last payment went into it. Core still accepts a
    /// checkpoint for it, and covering it is what keeps the authorization tail short if the payer
    /// later defaults.
    ///
    /// Returns `None` when there is nothing new to cover.
    pub async fn checkpoint(
        &self,
        asset: Asset,
    ) -> Result<Option<CheckpointAcceptedResponse>, PaymentError> {
        let cycle = self.ctx.active_cycle(asset.address()).await?;
        self.checkpoint_cycle(asset, cycle.id).await
    }

    /// The same, for a cycle named outright — the one a refusal pointed at, say, rather than the
    /// one this client is paying into now.
    pub async fn checkpoint_cycle(
        &self,
        asset: Asset,
        cycle_id: B256,
    ) -> Result<Option<CheckpointAcceptedResponse>, PaymentError> {
        let batch = self.checkpoint_batch_for_cycle(asset, cycle_id).await?;
        let Some(payload) = checkpoint_payload(self.ctx.signer_address(), &batch)? else {
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

    /// The latest checkpoint the payer signed in `asset`'s active cycle, plus every payment it
    /// does not yet cover.
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

    /// The same, for a cycle named outright. A cycle that has closed still answers, until
    /// settlement has read what it holds.
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
    /// Resubmitting the latest accepted checkpoint succeeds and covers nothing.
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
    batch: &CheckpointBatchResponse,
) -> Result<Option<CheckpointPayload>, PaymentError> {
    if batch.authorizations.is_empty() {
        return Ok(None);
    }

    let mut cumulative_gross = match &batch.previous {
        Some(previous) => previous.payload.cumulative_gross,
        None => U256::ZERO,
    };
    let mut timestamp_cutoff = 0u64;
    for authorization in &batch.authorizations {
        cumulative_gross = cumulative_gross
            .checked_add(authorization.payload.amount())
            .ok_or_else(|| PaymentError::InvalidParams("cumulative gross overflows".to_string()))?;
        timestamp_cutoff = timestamp_cutoff.max(authorization.payload.timestamp());
    }

    Ok(Some(CheckpointPayload {
        payer: payer.to_string(),
        cycle_id: batch.cycle_id.parse().map_err(|_| {
            PaymentError::Decode(format!("unreadable cycle id: {}", batch.cycle_id))
        })?,
        asset_address: batch.asset_address.clone(),
        cumulative_gross,
        timestamp_cutoff,
    }))
}

fn unix_now() -> u64 {
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
    use rpc::{CheckpointPayload, SignedCheckpoint, guarantee_registry_domain};

    const CHAIN_ID: u64 = 31337;
    const REGISTRY: &str = "0x0000000000000000000000000000000000065e61";
    const PAYER: &str = "0x1234567890123456789012345678901234567890";
    const RECIPIENT: &str = "0x00000000000000000000000000000000000000Be";
    const ASSET: &str = "0x0000000000000000000000000000000000000000";

    fn domain() -> alloy::sol_types::Eip712Domain {
        guarantee_registry_domain(CHAIN_ID, REGISTRY.parse().unwrap())
    }

    fn payment(amount: u64, timestamp: u64) -> PaymentRequestPayload {
        PaymentRequestPayload::new(
            PAYER.to_string(),
            RECIPIENT.to_string(),
            B256::repeat_byte(0x11),
            U256::from(amount),
            U256::from(amount),
            timestamp,
            Some(ASSET.to_string()),
            B256::repeat_byte(0x22),
        )
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
        previous: Option<(u64, u64)>,
        authorizations: Vec<(u64, u64)>,
    ) -> CheckpointBatchResponse {
        CheckpointBatchResponse {
            cycle_id: format!("{:#x}", B256::repeat_byte(0x11)),
            cycle_id_text: "0x0:1700000000".to_string(),
            asset_address: ASSET.to_string(),
            payer: PAYER.to_string(),
            previous: previous.map(|(gross, cutoff)| SignedCheckpoint {
                payload: CheckpointPayload {
                    payer: PAYER.to_string(),
                    cycle_id: B256::repeat_byte(0x11),
                    asset_address: ASSET.to_string(),
                    cumulative_gross: U256::from(gross),
                    timestamp_cutoff: cutoff,
                },
                signature: "0x00".to_string(),
            }),
            authorizations: authorizations
                .into_iter()
                .map(|(amount, timestamp)| {
                    PaymentRequest::new(payment(amount, timestamp), "0x00".to_string())
                })
                .collect(),
            max_uncheckpointed: 2,
        }
    }

    #[test]
    fn a_checkpoint_extends_the_previous_one() {
        let payer = PAYER.parse().unwrap();
        let payload = checkpoint_payload(
            payer,
            &batch(
                Some((50, 1_699_999_000)),
                vec![(10, 1_700_000_000), (7, 1_700_000_500)],
            ),
        )
        .expect("builds")
        .expect("covers the batch");

        assert_eq!(payload.cumulative_gross, U256::from(67u64));
        assert_eq!(payload.timestamp_cutoff, 1_700_000_500);
    }

    #[test]
    fn a_first_checkpoint_starts_from_zero() {
        let payer = PAYER.parse().unwrap();
        let payload = checkpoint_payload(payer, &batch(None, vec![(10, 1_700_000_000)]))
            .expect("builds")
            .expect("covers the batch");

        assert_eq!(payload.cumulative_gross, U256::from(10u64));
        assert_eq!(payload.timestamp_cutoff, 1_700_000_000);
    }

    /// The cutoff is the newest payment covered, not whatever arrived last.
    #[test]
    fn the_cutoff_is_the_latest_payment_whatever_the_order() {
        let payer = PAYER.parse().unwrap();
        let payload = checkpoint_payload(
            payer,
            &batch(None, vec![(1, 1_700_000_900), (1, 1_700_000_100)]),
        )
        .expect("builds")
        .expect("covers the batch");

        assert_eq!(payload.timestamp_cutoff, 1_700_000_900);
    }

    #[test]
    fn an_empty_batch_needs_no_checkpoint() {
        let payer = PAYER.parse().unwrap();
        assert!(
            checkpoint_payload(payer, &batch(None, vec![]))
                .expect("builds")
                .is_none()
        );
    }
}
