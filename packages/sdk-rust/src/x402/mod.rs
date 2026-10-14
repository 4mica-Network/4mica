use crate::{Asset, Client, error::X402Error};
use alloy::{
    primitives::{Address, B256, Bytes, U256},
    signers::Signer,
};
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use reqwest::{Client as HttpClient, Url};
use rpc::{PaymentRequest, PaymentRequestPayload, ValidationRequirement};

pub mod model;

pub use model::*;

/// What the flow needs of a payer: a payload scoped to the live settlement cycle, and a signature
/// over it.
#[async_trait]
pub trait FlowSigner: Send + Sync {
    async fn new_payment(
        &self,
        recipient: Address,
        amount: U256,
        asset: Asset,
    ) -> Result<PaymentRequestPayload, X402Error>;

    async fn sign_payment(
        &self,
        payload: PaymentRequestPayload,
    ) -> Result<PaymentRequest, X402Error>;
}

#[async_trait]
impl<S> FlowSigner for Client<S>
where
    S: Signer + Send + Sync,
{
    async fn new_payment(
        &self,
        recipient: Address,
        amount: U256,
        asset: Asset,
    ) -> Result<PaymentRequestPayload, X402Error> {
        self.payment
            .new_payment(recipient, amount, asset)
            .await
            .map_err(X402Error::Signing)
    }

    async fn sign_payment(
        &self,
        payload: PaymentRequestPayload,
    ) -> Result<PaymentRequest, X402Error> {
        self.payment
            .sign_request(payload)
            .await
            .map_err(X402Error::Signing)
    }
}

/// High-level helper that handles the 402 -> signed-claim flow for a paid resource.
#[derive(Clone)]
pub struct X402Flow<S> {
    http: HttpClient,
    signer: S,
}

impl<S> X402Flow<S> {
    /// Create a flow helper that will default to the local x402 URL.
    pub fn new(signer: S) -> Result<Self, X402Error> {
        Ok(Self {
            http: HttpClient::new(),
            signer,
        })
    }
}

impl<S> X402Flow<S>
where
    S: FlowSigner,
{
    /// Build a signed payment envelope for the given payment requirements, for x402 version 1.
    pub async fn sign_payment(
        &self,
        payment_requirements: PaymentRequirements,
    ) -> Result<X402SignedPayment, X402Error> {
        if payment_requirements.scheme != SCHEME_4MICA_CREDIT {
            return Err(X402Error::InvalidScheme(payment_requirements.scheme));
        }

        let payload = self.build_payment(&payment_requirements).await?;
        let request = self.signer.sign_payment(payload).await?;

        let envelope = X402PaymentEnvelope {
            x402_version: 1,
            scheme: payment_requirements.scheme,
            network: payment_requirements.network,
            payload: request.clone(),
        };

        Self::finish(1, &envelope, request)
    }

    /// Build a signed payment envelope for the given payment requirements, for x402 version 2.
    pub async fn sign_payment_v2(
        &self,
        payment_required: X402PaymentRequiredV2,
        accepted: PaymentRequirementsV2,
    ) -> Result<X402SignedPayment, X402Error> {
        if accepted.scheme != SCHEME_4MICA_CREDIT {
            return Err(X402Error::InvalidScheme(accepted.scheme));
        }
        if payment_required.x402_version != 2 {
            return Err(X402Error::InvalidVersion("expected x402 version 2".into()));
        }

        let payload = self.build_payment(&accepted).await?;
        let request = self.signer.sign_payment(payload).await?;

        let envelope = X402PaymentEnvelopeV2 {
            x402_version: 2,
            accepted: accepted.clone(),
            payload: request.clone(),
            resource: Some(payment_required.resource),
            extensions: payment_required.extensions,
        };

        Self::finish(2, &envelope, request)
    }

    /// Encode a signed envelope once, keeping both the object form (for a facilitator's
    /// `paymentPayload`) and the base64 form (for the payment request header).
    fn finish(
        x402_version: u8,
        envelope: &impl serde::Serialize,
        payload: PaymentRequest,
    ) -> Result<X402SignedPayment, X402Error> {
        let envelope =
            serde_json::to_value(envelope).map_err(|e| X402Error::EncodeEnvelope(e.to_string()))?;
        let bytes =
            serde_json::to_vec(&envelope).map_err(|e| X402Error::EncodeEnvelope(e.to_string()))?;

        Ok(X402SignedPayment {
            header: BASE64_STANDARD.encode(bytes),
            envelope,
            x402_version,
            payload,
        })
    }

    /// Settle a previously signed payment through the X402 /settle endpoint.
    pub async fn settle_payment(
        &self,
        payment: X402SignedPayment,
        payment_requirements: X402Requirements,
        facilitator_url: &str,
    ) -> Result<X402SettledPayment, X402Error> {
        if payment_requirements.x402_version() != payment.x402_version {
            return Err(X402Error::InvalidVersion(format!(
                "payment is x402 v{}, but requirements are x402 v{}",
                payment.x402_version,
                payment_requirements.x402_version(),
            )));
        }

        let base_url = Url::parse(facilitator_url)
            .map_err(|e| X402Error::InvalidFacilitatorUrl(e.to_string()))?;
        let url = base_url
            .join("settle")
            .map_err(|e| X402Error::InvalidFacilitatorUrl(e.to_string()))?;

        let response = self
            .http
            .post(url)
            .json(&FacilitatorSettleParams {
                x402_version: payment.x402_version,
                payment_payload: payment.envelope.clone(),
                payment_requirements,
            })
            .send()
            .await?;

        let status = response.status();
        let settlement: serde_json::Value = response.json().await?;

        if !status.is_success() {
            return Err(X402Error::SettlementFailed {
                status,
                body: settlement,
            });
        }

        Ok(X402SettledPayment {
            payment,
            settlement,
        })
    }

    /// The payment these requirements ask for, scoped to the live settlement cycle.
    async fn build_payment(
        &self,
        requirements: &impl X402PaymentRequirements,
    ) -> Result<PaymentRequestPayload, X402Error> {
        let recipient = parse_address_field("payTo", requirements.pay_to())?;
        let amount = parse_u256_field("amount", requirements.amount())?;
        let asset = match parse_address_field("asset", requirements.asset())? {
            Address::ZERO => Asset::Native,
            token => Asset::Erc20(token),
        };

        let mut payload = self.signer.new_payment(recipient, amount, asset).await?;
        // Echo the advertised spelling of the recipient rather than a re-encoded one, so a
        // resource server that compares it as a string still matches. What the payer commits to
        // is the parsed address either way.
        let PaymentRequestPayload::V1(inner) = &mut payload;
        inner.recipient_address = requirements.pay_to().trim().to_string();

        let Some(validation) = parse_validation_extra(requirements)? else {
            return Ok(payload);
        };

        let subject = parse_b256_field("subject", &validation.subject)?;
        let params = match validation.params.as_deref() {
            Some(raw) => parse_bytes_field("params", raw)?,
            None => Bytes::new(),
        };

        Ok(payload.with_validation(ValidationRequirement {
            validator: validation.validator,
            subject,
            deadline: validation.deadline,
            params,
        }))
    }
}

fn parse_validation_extra(
    requirements: &impl X402PaymentRequirements,
) -> Result<Option<ValidationExtra>, X402Error> {
    let Some(extra) = requirements.extra() else {
        return Ok(None);
    };
    let parsed: PaymentRequirementsExtra = serde_json::from_value(extra.clone())
        .map_err(|e| X402Error::InvalidExtra(e.to_string()))?;
    Ok(parsed.validation)
}

fn parse_address_field(field: &str, raw: &str) -> Result<Address, X402Error> {
    raw.trim()
        .parse::<Address>()
        .map_err(|e| X402Error::InvalidNumber {
            field: field.to_string(),
            source: e.into(),
        })
}

fn parse_u256_field(field: &str, raw: &str) -> Result<U256, X402Error> {
    let trimmed = raw.trim();
    let value = if let Some(rest) = trimmed.strip_prefix("0x") {
        U256::from_str_radix(rest, 16)
    } else {
        U256::from_str_radix(trimmed, 10)
    };
    value.map_err(|e| X402Error::InvalidNumber {
        field: field.to_string(),
        source: e.into(),
    })
}

fn parse_b256_field(field: &str, raw: &str) -> Result<B256, X402Error> {
    let trimmed = raw.trim();
    <B256 as std::str::FromStr>::from_str(trimmed).map_err(|e| X402Error::InvalidNumber {
        field: field.to_string(),
        source: e.into(),
    })
}

fn parse_bytes_field(field: &str, raw: &str) -> Result<Bytes, X402Error> {
    let trimmed = raw.trim();
    <Bytes as std::str::FromStr>::from_str(trimmed).map_err(|e| X402Error::InvalidNumber {
        field: field.to_string(),
        source: e.into(),
    })
}
