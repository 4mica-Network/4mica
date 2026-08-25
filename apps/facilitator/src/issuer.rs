use async_trait::async_trait;
use reqwest::Url;
use rpc::{PaymentGuaranteeRequest, PaymentGuaranteeRequestClaims, SigningScheme};
use sdk_4mica::BLSCert;
use std::sync::Arc;
use tracing::debug;

use crate::auth::AuthSession;

#[async_trait]
pub trait GuaranteeIssuer: Send + Sync {
    async fn issue(
        &self,
        claims: PaymentGuaranteeRequestClaims,
        signature: String,
        scheme: SigningScheme,
    ) -> Result<BLSCert, String>;
}

pub struct LiveGuaranteeIssuer {
    client: reqwest::Client,
    base_url: Url,
    auth: Option<Arc<AuthSession>>,
}

impl LiveGuaranteeIssuer {
    pub fn try_new(base_url: Url, auth: Option<Arc<AuthSession>>) -> anyhow::Result<Self> {
        Ok(Self {
            client: reqwest::Client::new(),
            base_url,
            auth,
        })
    }
}

#[async_trait]
impl GuaranteeIssuer for LiveGuaranteeIssuer {
    async fn issue(
        &self,
        claims: PaymentGuaranteeRequestClaims,
        signature: String,
        scheme: SigningScheme,
    ) -> Result<BLSCert, String> {
        let body = PaymentGuaranteeRequest::new(claims, signature, scheme);

        let mut url = self.base_url.clone();
        url.set_path("core/guarantees");

        let payload = serde_json::to_string(&body).unwrap_or_else(|_| "<serialize_failed>".into());
        debug!(url = %url, payload = %payload, "Sending core guarantee request");

        let mut request = self.client.post(url).json(&body);
        if let Some(auth) = &self.auth {
            let token = auth.access_token().await.map_err(|err| err.to_string())?;
            request = request.bearer_auth(token);
        }

        let response = request.send().await.map_err(|err| err.to_string())?;

        let status = response.status();
        let bytes = response.bytes().await.map_err(|err| err.to_string())?;
        debug!(
            status = %status,
            body = %String::from_utf8_lossy(&bytes),
            "Core guarantee response"
        );

        if !status.is_success() {
            let message = parse_error_message(&bytes);
            return Err(format!(
                "core guarantee request failed ({status}): {message}"
            ));
        }

        serde_json::from_slice::<BLSCert>(&bytes)
            .map_err(|err| format!("failed to decode guarantee response: {err}"))
    }
}

pub(crate) fn parse_error_message(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return "unknown error".to_string();
    }

    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) {
        if let Some(msg) = value.get("error").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
        if let Some(msg) = value.get("message").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
    }

    match std::str::from_utf8(bytes) {
        Ok(text) if !text.trim().is_empty() => text.trim().to_string(),
        _ => "unknown error".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_error_message_prefers_error_field() {
        let message = parse_error_message(json!({ "error": "bad request" }).to_string().as_bytes());
        assert_eq!(message, "bad request");
    }

    #[test]
    fn parse_error_message_falls_back_to_message_field() {
        let message = parse_error_message(
            json!({ "message": "invalid signature" })
                .to_string()
                .as_bytes(),
        );
        assert_eq!(message, "invalid signature");
    }

    #[test]
    fn parse_error_message_falls_back_to_text() {
        let message = parse_error_message(b"plain text failure");
        assert_eq!(message, "plain text failure");
    }

    #[test]
    fn parse_error_message_handles_empty_body() {
        let message = parse_error_message(&[]);
        assert_eq!(message, "unknown error");
    }
}
