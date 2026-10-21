use async_trait::async_trait;
use reqwest::{StatusCode, Url};
use rpc::{
    ApiClientError, ERROR_CODE_CHECKPOINT_REQUIRED, ERROR_CODE_CYCLE_MISMATCH,
    ERROR_CODE_DUPLICATE_GUARANTEE, ERROR_CODE_FUTURE_TIMESTAMP,
    ERROR_CODE_INSUFFICIENT_COLLATERAL, ERROR_CODE_STALE_TIMESTAMP,
    ERROR_CODE_TIMESTAMP_NOT_PAST_CUTOFF, ERROR_CODE_USER_NOT_REGISTERED,
    ERROR_CODE_USER_SUSPENDED, GuaranteeReceipt, PaymentRequest, RpcProxy,
};
use serde_json::Value;
use std::sync::Arc;
use thiserror::Error;
use tracing::debug;

use crate::auth::AuthSession;
use crate::error_code::ErrorCode;

#[async_trait]
pub trait GuaranteeIssuer: Send + Sync {
    async fn issue(&self, request: PaymentRequest) -> Result<GuaranteeReceipt, IssueError>;
}

/// Why core issued no receipt.
#[derive(Debug, Clone, Error)]
#[error("{message}")]
pub struct IssueError {
    pub message: String,
    /// Core's own code, such as `CHECKPOINT_REQUIRED`. [`Self::code`] translates it.
    pub original_code: Option<String>,
    /// What core attached to `code`, passed on untouched so the payer can act on it.
    pub details: Option<Value>,
    /// True when core turned the request itself down, rather than failing to process it.
    pub refused: bool,
}

impl IssueError {
    fn unavailable(message: String) -> Self {
        Self {
            message,
            original_code: None,
            details: None,
            refused: false,
        }
    }

    pub fn code(&self) -> ErrorCode {
        match self.original_code.as_deref() {
            Some(ERROR_CODE_INSUFFICIENT_COLLATERAL) => ErrorCode::InsufficientFunds,
            Some(ERROR_CODE_CHECKPOINT_REQUIRED) => ErrorCode::CheckpointRequired,
            Some(ERROR_CODE_CYCLE_MISMATCH) => ErrorCode::CycleMismatch,
            Some(ERROR_CODE_TIMESTAMP_NOT_PAST_CUTOFF) => ErrorCode::TimestampNotPastCutoff,
            Some(ERROR_CODE_FUTURE_TIMESTAMP) => ErrorCode::FutureTimestamp,
            Some(ERROR_CODE_STALE_TIMESTAMP) => ErrorCode::StaleTimestamp,
            Some(ERROR_CODE_USER_NOT_REGISTERED) => ErrorCode::PayerNotRegistered,
            Some(ERROR_CODE_USER_SUSPENDED) => ErrorCode::PayerSuspended,
            Some(ERROR_CODE_DUPLICATE_GUARANTEE) => ErrorCode::DuplicateRequest,
            _ if self.refused => ErrorCode::InvalidPayload,
            _ => ErrorCode::UnexpectedSettleError,
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
                message,
                original_code: code,
                details,
                refused: status.is_client_error() && status != StatusCode::TOO_MANY_REQUESTS,
            },
            other => Self::unavailable(format!("could not reach core: {other}")),
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
                IssueError::unavailable(format!("could not authenticate with core: {err}"))
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

        assert_eq!(err.code(), ErrorCode::CheckpointRequired);
        assert_eq!(err.details, Some(json!({ "uncheckpointed": 64 })));
        assert_eq!(err.message, "payer must submit a checkpoint");
    }

    #[test]
    fn an_uncoded_refusal_is_the_payloads_fault_and_an_outage_is_not() {
        let refused = IssueError::from(ApiClientError::Api {
            status: StatusCode::BAD_REQUEST,
            message: "invalid signature".into(),
            code: None,
            details: None,
        });
        assert_eq!(refused.code(), ErrorCode::InvalidPayload);
        assert!(refused.refused);

        let outage = IssueError::from(ApiClientError::Api {
            status: StatusCode::SERVICE_UNAVAILABLE,
            message: "issuance is halted".into(),
            code: None,
            details: None,
        });
        assert_eq!(outage.code(), ErrorCode::UnexpectedSettleError);
        assert!(!outage.refused);
    }
}
