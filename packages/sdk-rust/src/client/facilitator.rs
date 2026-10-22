//! Transport for the service that submits signed authorizations and pays the gas for them.

use alloy::primitives::U256;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use url::Url;

use crate::error::{DepositError, SponsorshipError};

pub(super) struct Facilitator {
    http: reqwest::Client,
    /// `None` when none was configured; every call then fails with
    /// [`SponsorshipError::NotConfigured`] rather than silently doing nothing.
    base_url: Option<Url>,
}

impl Clone for Facilitator {
    fn clone(&self) -> Self {
        Self {
            http: self.http.clone(),
            base_url: self.base_url.clone(),
        }
    }
}

impl Facilitator {
    pub(super) fn new(base_url: Option<Url>) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url,
        }
    }

    pub(super) fn is_configured(&self) -> bool {
        self.base_url.is_some()
    }

    pub(super) async fn post<Req, Resp>(
        &self,
        path: &str,
        body: &Req,
    ) -> Result<Resp, SponsorshipError>
    where
        Req: Serialize + ?Sized,
        Resp: serde::de::DeserializeOwned,
    {
        let url = self.endpoint(path)?;
        let response = self.http.post(url).json(body).send().await.map_err(|err| {
            let message = format!("facilitator request failed: {err}");
            if err.is_connect() || err.is_builder() {
                SponsorshipError::Transport(message)
            } else {
                SponsorshipError::OutcomeUnknown(message)
            }
        })?;

        let status = response.status();
        let bytes = response.bytes().await.map_err(|err| {
            SponsorshipError::OutcomeUnknown(format!("failed to read facilitator response: {err}"))
        })?;

        // Rejections are reported in the body with a 200, so a non-success status is a transport or
        // routing problem rather than a refused request.
        if !status.is_success() {
            let message = format!(
                "facilitator returned {status}: {}",
                String::from_utf8_lossy(&bytes)
            );
            return Err(
                if status.is_client_error() && status != StatusCode::REQUEST_TIMEOUT {
                    SponsorshipError::Transport(message)
                } else {
                    SponsorshipError::OutcomeUnknown(message)
                },
            );
        }

        serde_json::from_slice(&bytes).map_err(|err| {
            SponsorshipError::OutcomeUnknown(format!("malformed facilitator response: {err}"))
        })
    }

    fn endpoint(&self, path: &str) -> Result<Url, SponsorshipError> {
        let base = self
            .base_url
            .as_ref()
            .ok_or(SponsorshipError::NotConfigured)?;
        base.join(path).map_err(|err| {
            SponsorshipError::InvalidParams(format!("invalid facilitator URL for {path}: {err}"))
        })
    }
}

/// What the facilitator adds to a failure, under `extra`. Flattened into every response, whatever
/// it was asked to do; the reason and message travel beside it under the names that response uses.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FacilitatorFailure {
    #[serde(default)]
    extra: FailureExtra,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FailureExtra {
    retryable: Option<bool>,
    details: Option<FailureDetails>,
}

/// The one detail this SDK reads: the EIP-2612 nonce attached to `permit2_allowance_required`,
/// which a client with no chain access cannot compute.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FailureDetails {
    eip2612_nonce: Option<String>,
}

impl FacilitatorFailure {
    /// The EIP-2612 nonce attached to a `permit2_allowance_required` rejection, for callers that
    /// unpack the allowance detail themselves rather than through [`Self::into_error`].
    pub(super) fn eip2612_nonce(&self) -> Option<U256> {
        self.extra
            .details
            .as_ref()
            .and_then(|details| details.eip2612_nonce.as_ref())
            .and_then(|raw| raw.parse().ok())
    }

    // Absent `retryable` means "not retryable": a facilitator that omits it is not promising anything.
    fn retryable(&self) -> bool {
        self.extra.retryable.unwrap_or(false)
    }

    /// The generic rejection, for sponsored actions with no scheme-specific detail to unpack.
    pub(super) fn into_sponsorship_error(
        self,
        reason: Option<String>,
        message: Option<String>,
    ) -> SponsorshipError {
        SponsorshipError::Rejected {
            code: reason.unwrap_or_else(|| "unknown".into()),
            message: message.unwrap_or_else(|| "facilitator gave no reason".into()),
            retryable: self.retryable(),
        }
    }

    pub(super) fn into_error(
        self,
        reason: Option<String>,
        message: Option<String>,
    ) -> DepositError {
        DepositError::from_facilitator(reason, message, self.retryable(), self.eip2612_nonce())
    }
}
