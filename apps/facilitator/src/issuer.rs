use async_trait::async_trait;
use reqwest::Url;
use rpc::{ApiClientError, GuaranteeReceipt, PaymentRequest, RpcProxy};
use serde_json::Value;
use std::sync::Arc;
use thiserror::Error;
use tracing::debug;

use crate::auth::AuthSession;

#[async_trait]
pub trait GuaranteeIssuer: Send + Sync {
    async fn issue(&self, request: PaymentRequest) -> Result<GuaranteeReceipt, IssueError>;
}

/// Why core issued no receipt.
#[derive(Debug, Clone, Error)]
#[error("{message}")]
pub struct IssueError {
    pub message: String,
    /// Core's machine-readable code, such as `CHECKPOINT_REQUIRED`. Passed through untouched so
    /// the payer can act on it.
    pub code: Option<String>,
    pub details: Option<Value>,
}

impl IssueError {
    fn unavailable(message: String) -> Self {
        Self {
            message,
            code: None,
            details: None,
        }
    }
}

impl From<ApiClientError> for IssueError {
    fn from(err: ApiClientError) -> Self {
        match err {
            ApiClientError::Api {
                status,
                message,
                code,
                details,
            } => Self {
                message: format!("core refused the guarantee ({status}): {message}"),
                code,
                details,
            },
            other => Self::unavailable(format!("core guarantee request failed: {other}")),
        }
    }
}

pub struct LiveGuaranteeIssuer {
    proxy: RpcProxy,
    auth: Option<Arc<AuthSession>>,
}

impl LiveGuaranteeIssuer {
    pub fn try_new(base_url: Url, auth: Option<Arc<AuthSession>>) -> anyhow::Result<Self> {
        Ok(Self {
            proxy: RpcProxy::new(base_url.as_str())?,
            auth,
        })
    }
}

#[async_trait]
impl GuaranteeIssuer for LiveGuaranteeIssuer {
    async fn issue(&self, request: PaymentRequest) -> Result<GuaranteeReceipt, IssueError> {
        let mut proxy = self.proxy.clone();
        if let Some(auth) = &self.auth {
            let token = auth.access_token().await.map_err(|err| {
                IssueError::unavailable(format!("failed to authenticate with core: {err}"))
            })?;
            proxy = proxy.with_bearer_token(token);
        }

        debug!(
            req_id = %request.payload.req_id(),
            cycle_id = %request.payload.cycle_id(),
            "Sending core guarantee request"
        );
        let receipt = proxy.issue_guarantee(request).await?;
        debug!(receipt = %receipt.receipt, "Core guarantee response");
        Ok(receipt)
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
    use reqwest::StatusCode;
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

    #[test]
    fn a_core_refusal_keeps_its_code_and_details() {
        let err = IssueError::from(ApiClientError::Api {
            status: StatusCode::CONFLICT,
            message: "payer must submit a checkpoint".into(),
            code: Some("CHECKPOINT_REQUIRED".into()),
            details: Some(json!({ "uncheckpointed": 64 })),
        });

        assert_eq!(err.code.as_deref(), Some("CHECKPOINT_REQUIRED"));
        assert_eq!(err.details, Some(json!({ "uncheckpointed": 64 })));
        assert!(err.message.contains("payer must submit a checkpoint"));
    }
}
