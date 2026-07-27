use std::collections::HashMap;

use rpc::PaymentGuaranteeRequest;
use sdk_4mica::BLSCert;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::state::ValidationError;

#[derive(Clone, Copy, Debug)]
pub struct X402Version<const N: u8>;

impl<const N: u8> Serialize for X402Version<N> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u8(N)
    }
}

impl<'de, const N: u8> Deserialize<'de> for X402Version<N> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        if value == N {
            Ok(X402Version::<N>)
        } else {
            Err(serde::de::Error::custom(format!(
                "invalid x402Version, expected 1 or 2, got {}",
                value
            )))
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X402PaymentPayloadV1 {
    pub x402_version: X402Version<1>,
    pub scheme: String,
    pub network: String,
    pub payload: PaymentGuaranteeRequest,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X402PaymentPayloadV2 {
    pub x402_version: X402Version<2>,
    pub accepted: PaymentRequirements,
    pub payload: PaymentGuaranteeRequest,
}

#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum X402PaymentPayload {
    V1(X402PaymentPayloadV1),
    V2(X402PaymentPayloadV2),
}

impl X402PaymentPayload {
    pub fn x402_version(&self) -> u8 {
        match self {
            X402PaymentPayload::V1(_) => 1,
            X402PaymentPayload::V2(_) => 2,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedKind {
    pub scheme: String,
    pub network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x402_version: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportedResponse {
    pub kinds: Vec<SupportedKind>,
    pub extensions: Vec<String>,
    pub signers: HashMap<String, Vec<String>>,
}

impl SupportedResponse {
    pub fn new(kinds: Vec<SupportedKind>) -> Self {
        Self {
            kinds,
            extensions: Vec::new(),
            signers: HashMap::new(),
        }
    }
}

#[derive(Serialize)]
pub struct HealthResponse<'a> {
    pub status: &'a str,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRequirements {
    pub scheme: String,
    pub network: String,
    #[serde(default)]
    pub max_amount_required: String,
    #[serde(default)]
    pub amount: Option<String>,
    pub resource: Option<String>,
    pub description: Option<String>,
    pub mime_type: Option<String>,
    pub output_schema: Option<Value>,
    pub pay_to: String,
    pub max_timeout_seconds: Option<u64>,
    pub asset: String,
    pub extra: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct VerifyRequest {
    #[serde(rename = "x402Version")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x402_version: Option<u8>,
    #[serde(rename = "paymentPayload")]
    pub payment_payload: X402PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SettleRequest {
    #[serde(rename = "x402Version")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x402_version: Option<u8>,
    #[serde(rename = "paymentPayload")]
    pub payment_payload: X402PaymentPayload,
    #[serde(rename = "paymentRequirements")]
    pub payment_requirements: PaymentRequirements,
}

impl VerifyRequest {
    pub(crate) fn resolved_x402_version(&self) -> Result<u8, ValidationError> {
        super::state::resolve_x402_version(&self.payment_payload, self.x402_version)
    }
}

impl SettleRequest {
    pub(crate) fn resolved_x402_version(&self) -> Result<u8, ValidationError> {
        super::state::resolve_x402_version(&self.payment_payload, self.x402_version)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResponse {
    pub is_valid: bool,
    pub invalid_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate: Option<CertificateResponse>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CertificateResponse {
    pub claims: String,
    pub signature: String,
}

impl From<BLSCert> for CertificateResponse {
    fn from(cert: BLSCert) -> Self {
        Self {
            claims: format!("0x{}", cert.claims().to_hex()),
            signature: format!("0x{}", cert.signature().to_hex()),
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettleResponse {
    pub success: bool,
    pub error: Option<String>,
    pub tx_hash: Option<String>,
    pub network_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate: Option<CertificateResponse>,
}

impl SettleResponse {
    pub fn invalid(reason: String, network: &str) -> Self {
        Self {
            success: false,
            error: Some(reason),
            tx_hash: None,
            network_id: Some(network.to_string()),
            certificate: None,
        }
    }

    pub fn from_exact(
        success: bool,
        error: Option<String>,
        tx_hash: Option<String>,
        network: String,
    ) -> Self {
        Self {
            success,
            error,
            tx_hash,
            network_id: Some(network),
            certificate: None,
        }
    }

    pub fn four_mica_success(network: &str, certificate: CertificateResponse) -> Self {
        Self {
            success: true,
            error: None,
            tx_hash: None,
            network_id: Some(network.to_string()),
            certificate: Some(certificate),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto::bls::KeyMaterial;

    #[test]
    fn certificate_response_from_bls_cert_preserves_hex_fields() {
        let key = KeyMaterial::from_bytes(&[7u8; 32]).expect("secret key");
        let cert = BLSCert::sign(&key, vec![0xab, 0xcd].into()).expect("sign cert");

        let response = CertificateResponse::from(cert);
        assert_eq!(response.claims, "0xabcd");
        assert!(response.signature.starts_with("0x"));
    }
}
