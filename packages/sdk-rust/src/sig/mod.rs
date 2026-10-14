use alloy::hex;
use alloy::primitives::Address;
use alloy::signers::Signer;
use alloy::sol_types::Eip712Domain;
use async_trait::async_trait;
use rpc::{CheckpointPayload, PaymentRequest, PaymentRequestPayload, SignedCheckpoint};

use crate::error::PaymentError;

#[cfg(test)]
mod tests;

/// Signs the payloads a payer authorizes, under the domain the ClearingHouse verifies them in.
#[async_trait]
pub(crate) trait PayerSigner: Send + Sync {
    async fn sign_payment_request(
        &self,
        domain: &Eip712Domain,
        payload: PaymentRequestPayload,
    ) -> Result<PaymentRequest, PaymentError>;

    async fn sign_checkpoint(
        &self,
        domain: &Eip712Domain,
        payload: CheckpointPayload,
    ) -> Result<SignedCheckpoint, PaymentError>;
}

#[async_trait]
impl<S> PayerSigner for S
where
    S: Signer + Send + Sync,
{
    async fn sign_payment_request(
        &self,
        domain: &Eip712Domain,
        payload: PaymentRequestPayload,
    ) -> Result<PaymentRequest, PaymentError> {
        require_signer_is(self.address(), payload.user_address())?;

        let digest = payload
            .signing_digest(domain)
            .map_err(|err| PaymentError::SigningFailed(err.to_string()))?;
        let signature = self.sign_hash(&digest).await.map_err(sign_failed)?;

        Ok(PaymentRequest::new(
            payload,
            hex::encode_prefixed(signature.as_bytes()),
        ))
    }

    async fn sign_checkpoint(
        &self,
        domain: &Eip712Domain,
        payload: CheckpointPayload,
    ) -> Result<SignedCheckpoint, PaymentError> {
        require_signer_is(self.address(), &payload.payer)?;

        let digest = payload
            .signing_digest(domain)
            .map_err(|err| PaymentError::SigningFailed(err.to_string()))?;
        let signature = self.sign_hash(&digest).await.map_err(sign_failed)?;

        Ok(SignedCheckpoint {
            payload,
            signature: hex::encode_prefixed(signature.as_bytes()),
        })
    }
}

fn require_signer_is(signer: Address, payer: &str) -> Result<(), PaymentError> {
    let payer = payer
        .parse::<Address>()
        .map_err(|_| PaymentError::InvalidPayerAddress)?;

    if signer != payer {
        return Err(PaymentError::AddressMismatch { signer, payer });
    }
    Ok(())
}

fn sign_failed(err: alloy::signers::Error) -> PaymentError {
    PaymentError::SigningFailed(err.to_string())
}
