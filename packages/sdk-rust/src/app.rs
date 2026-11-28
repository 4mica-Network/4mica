use reqwest::{Method, StatusCode, header};
use serde::{Deserialize, Serialize, Serializer, de::DeserializeOwned};
use serde_json::Value;
use url::Url;

use crate::config::Network;

pub const DEFAULT_APP_BASE_URL: &str = "https://api.app.4mica.io";

const SDK_CLIENT: &str = concat!("rust-sdk-4mica/", env!("CARGO_PKG_VERSION"));
const SDK_CLIENT_HEADER: &str = "x-4mica-sdk";

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("invalid app API configuration: {0}")]
    Config(String),
    #[error("request to {path} failed: {message}")]
    Transport { path: String, message: String },
    #[error("{message}")]
    Api {
        path: String,
        status: u16,
        code: Option<String>,
        message: String,
        body: Option<Value>,
    },
    #[error("invalid JSON response from {path}: {message}")]
    Decode {
        path: String,
        status: u16,
        message: String,
    },
}

impl AppError {
    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Api { status, .. } | Self::Decode { status, .. } => Some(*status),
            Self::Config(_) | Self::Transport { .. } => None,
        }
    }

    pub fn code(&self) -> Option<&str> {
        match self {
            Self::Api { code, .. } => code.as_deref(),
            _ => None,
        }
    }

    pub fn is_transient(&self) -> bool {
        match self {
            Self::Transport { .. } => true,
            Self::Api { status, .. } => {
                *status == StatusCode::TOO_MANY_REQUESTS.as_u16()
                    || *status >= StatusCode::INTERNAL_SERVER_ERROR.as_u16()
            }
            Self::Config(_) | Self::Decode { .. } => false,
        }
    }
}

fn app_network<S: Serializer>(network: &Network, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str(match network {
        Network::Base => "BASE",
        Network::BaseSepolia => "BASE_SEPOLIA",
        Network::EthereumSepolia => "ETHEREUM_SEPOLIA",
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizeSpend {
    #[serde(serialize_with = "app_network")]
    pub network: Network,
    pub asset_address: Option<String>,
    pub amount: String,
    pub payer_address: String,
    pub recipient_address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub req_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeSpend {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub req_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SpendAuthorizationStatus {
    Reserved,
    PendingApproval,
    Denied,
    Consumed,
    Released,
    Expired,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpendAuthorization {
    pub id: String,
    pub status: SpendAuthorizationStatus,
    #[serde(default)]
    pub denied_reason: Option<String>,
    #[serde(default)]
    pub policy_id: Option<String>,
    #[serde(default)]
    pub approval_request_id: Option<String>,
    pub expires_at: String,
    pub amount: String,
    pub network: String,
    #[serde(default)]
    pub asset_address: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApproval {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer_id: Option<String>,
    pub payer_address: String,
    #[serde(serialize_with = "app_network")]
    pub network: Network,
    pub asset_address: Option<String>,
    pub amount: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
    Expired,
    Cancelled,
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedApproval {
    pub id: String,
    pub status: ApprovalStatus,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalState {
    pub id: String,
    pub status: ApprovalStatus,
    pub expires_at: String,
    #[serde(default)]
    pub decided_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AppClient {
    http: reqwest::Client,
    base_url: Url,
    api_key: String,
}

impl AppClient {
    pub fn new(api_key: impl Into<String>) -> Result<Self, AppError> {
        let api_key = api_key.into().trim().to_string();
        if api_key.is_empty() {
            return Err(AppError::Config(
                "an API key is required to call the 4Mica API".into(),
            ));
        }
        Ok(Self {
            http: reqwest::Client::new(),
            base_url: Url::parse(DEFAULT_APP_BASE_URL)
                .map_err(|err| AppError::Config(err.to_string()))?,
            api_key,
        })
    }

    pub fn with_base_url(mut self, base_url: &str) -> Result<Self, AppError> {
        let url = Url::parse(base_url.trim_end_matches('/'))
            .map_err(|err| AppError::Config(format!("invalid base URL {base_url}: {err}")))?;
        if url.cannot_be_a_base() {
            return Err(AppError::Config(format!("invalid base URL {base_url}")));
        }
        self.base_url = url;
        Ok(self)
    }

    pub fn with_http_client(mut self, http: reqwest::Client) -> Self {
        self.http = http;
        self
    }

    pub async fn authorize_spend(
        &self,
        input: &AuthorizeSpend,
    ) -> Result<SpendAuthorization, AppError> {
        self.request(Method::POST, &["v1", "spend", "authorize"], Some(input))
            .await
    }

    pub async fn get_spend_authorization(&self, id: &str) -> Result<SpendAuthorization, AppError> {
        self.request::<(), _>(Method::GET, &["v1", "spend", "authorizations", id], None)
            .await
    }

    pub async fn consume_spend_authorization(
        &self,
        id: &str,
        input: &ConsumeSpend,
    ) -> Result<SpendAuthorization, AppError> {
        self.request(
            Method::POST,
            &["v1", "spend", "authorizations", id, "consume"],
            Some(input),
        )
        .await
    }

    pub async fn release_spend_authorization(
        &self,
        id: &str,
    ) -> Result<SpendAuthorization, AppError> {
        self.request(
            Method::POST,
            &["v1", "spend", "authorizations", id, "release"],
            Some(&serde_json::Map::new()),
        )
        .await
    }

    pub async fn create_approval(
        &self,
        input: &CreateApproval,
    ) -> Result<CreatedApproval, AppError> {
        self.request(Method::POST, &["v1", "approvals"], Some(input))
            .await
    }

    pub async fn get_approval(&self, id: &str) -> Result<ApprovalState, AppError> {
        self.request::<(), _>(Method::GET, &["v1", "approvals", id], None)
            .await
    }

    async fn request<B: Serialize + ?Sized, T: DeserializeOwned>(
        &self,
        method: Method,
        segments: &[&str],
        payload: Option<&B>,
    ) -> Result<T, AppError> {
        let mut url = self.base_url.clone();
        url.path_segments_mut()
            .map_err(|()| AppError::Config(format!("invalid base URL {}", self.base_url)))?
            .pop_if_empty()
            .extend(segments);
        let path = url.path().to_string();

        let mut request = self
            .http
            .request(method, url)
            .bearer_auth(&self.api_key)
            .header(SDK_CLIENT_HEADER, SDK_CLIENT);
        if let Some(payload) = payload {
            let body =
                serde_json::to_vec(payload).map_err(|err| AppError::Config(err.to_string()))?;
            request = request
                .header(header::CONTENT_TYPE, "application/json")
                .body(body);
        }

        let transport = |err: reqwest::Error| AppError::Transport {
            path: path.clone(),
            message: err.to_string(),
        };
        let response = request.send().await.map_err(transport)?;
        let status = response.status();
        let bytes = response.bytes().await.map_err(transport)?;

        let body: Option<Value> = if bytes.is_empty() {
            None
        } else {
            Some(
                serde_json::from_slice(&bytes).map_err(|err| AppError::Decode {
                    path: path.clone(),
                    status: status.as_u16(),
                    message: err.to_string(),
                })?,
            )
        };

        if !status.is_success() {
            let field = |name: &str| {
                body.as_ref()
                    .and_then(|body| body.get(name))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            };
            return Err(AppError::Api {
                code: field("error"),
                message: field("message")
                    .unwrap_or_else(|| format!("request to {path} failed with {status}")),
                status: status.as_u16(),
                path,
                body,
            });
        }

        serde_json::from_value(body.unwrap_or(Value::Null)).map_err(|err| AppError::Decode {
            path,
            status: status.as_u16(),
            message: err.to_string(),
        })
    }
}
