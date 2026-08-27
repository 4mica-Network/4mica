use std::sync::Arc;

use anyhow::Context;
use async_trait::async_trait;
use reqwest::{Client, Url};
use tracing::{info, warn};
use x402_rs::chain::{ChainRegistry, FromConfig};
use x402_rs::config::Config as X402Config;
use x402_rs::facilitator::Facilitator;
use x402_rs::facilitator_local::FacilitatorLocal;
use x402_rs::proto::{self, SupportedPaymentKind};
use x402_rs::scheme::{SchemeBlueprints, SchemeRegistry};

use crate::server::model::{
    PaymentRequirements, SettleRequest, SettleResponse, SupportedKind, VerifyRequest,
    VerifyResponse,
};
use crate::server::state::ValidationError;

const ENV_DEBIT_URL: &str = "X402_DEBIT_URL";
const ENV_CONFIG_PATH: &str = "X402_CONFIG_PATH";

fn convert_supported_kind(kind: SupportedPaymentKind) -> Result<SupportedKind, ValidationError> {
    Ok(SupportedKind {
        scheme: kind.scheme,
        network: kind.network,
        x402_version: Some(kind.x402_version),
        extra: kind.extra,
    })
}

fn convert_supported(
    response: proto::SupportedResponse,
) -> Result<Vec<SupportedKind>, ValidationError> {
    response
        .kinds
        .into_iter()
        .map(convert_supported_kind)
        .collect()
}

fn convert_requirements(req: &PaymentRequirements) -> serde_json::Value {
    use serde_json::{Map, Value as JsonValue};

    let mut map = Map::new();
    map.insert("scheme".into(), JsonValue::String(req.scheme.clone()));
    map.insert("network".into(), JsonValue::String(req.network.clone()));
    map.insert(
        "maxAmountRequired".into(),
        JsonValue::String(req.max_amount_required.clone()),
    );
    if let Some(amount) = &req.amount {
        map.insert("amount".into(), JsonValue::String(amount.clone()));
    }
    map.insert(
        "resource".into(),
        JsonValue::String(req.resource.clone().unwrap_or_default()),
    );
    map.insert(
        "description".into(),
        JsonValue::String(req.description.clone().unwrap_or_default()),
    );
    map.insert(
        "mimeType".into(),
        JsonValue::String(req.mime_type.clone().unwrap_or_default()),
    );
    if let Some(schema) = &req.output_schema {
        map.insert("outputSchema".into(), schema.clone());
    }
    map.insert("payTo".into(), JsonValue::String(req.pay_to.clone()));
    map.insert(
        "maxTimeoutSeconds".into(),
        JsonValue::Number(req.max_timeout_seconds.unwrap_or_default().into()),
    );
    map.insert("asset".into(), JsonValue::String(req.asset.clone()));
    if let Some(extra) = &req.extra {
        map.insert("extra".into(), extra.clone());
    }

    JsonValue::Object(map)
}

fn convert_verify_request(
    request: &VerifyRequest,
) -> Result<proto::VerifyRequest, ValidationError> {
    use serde_json::{Map, Value as JsonValue};

    let x402_version = request.resolved_x402_version()?;
    if x402_version != 1 && x402_version != 2 {
        return Err(ValidationError::UnsupportedVersion(x402_version));
    }

    let payload = request.payment_payload.clone();
    let payment_requirements = convert_requirements(&request.payment_requirements);

    let mut map = Map::new();
    map.insert(
        "x402Version".into(),
        JsonValue::Number(serde_json::Number::from(x402_version as u64)),
    );
    map.insert(
        "paymentPayload".into(),
        serde_json::to_value(payload).map_err(|err| ValidationError::Other(err.into()))?,
    );
    map.insert("paymentRequirements".into(), payment_requirements);

    Ok(proto::VerifyRequest::from(JsonValue::Object(map)))
}

fn convert_settle_request(
    request: &SettleRequest,
) -> Result<proto::SettleRequest, ValidationError> {
    convert_verify_request(&VerifyRequest {
        x402_version: request.x402_version,
        payment_payload: request.payment_payload.clone(),
        payment_requirements: request.payment_requirements.clone(),
    })
}

pub async fn try_from_env() -> anyhow::Result<Option<Arc<dyn ExactService>>> {
    if let Some(remote) = HttpExactService::from_env()? {
        info!(url = %remote.base_url, "using remote debit facilitator");
        return Ok(Some(Arc::new(remote)));
    }

    match LocalExactService::try_from_env().await {
        Ok(Some(service)) => Ok(Some(Arc::new(service))),
        Ok(None) => Ok(None),
        Err(err) => {
            warn!(reason = %err, "exact scheme facilitator disabled");
            Ok(None)
        }
    }
}

#[async_trait]
pub(crate) trait ExactService: Send + Sync {
    async fn verify(&self, request: &VerifyRequest) -> Result<VerifyResponse, ValidationError>;
    async fn settle(&self, request: &SettleRequest) -> Result<SettleResponse, ValidationError>;
    async fn supported(&self) -> Result<Vec<SupportedKind>, ValidationError>;
}

struct LocalExactService {
    inner: Arc<FacilitatorLocal<SchemeRegistry>>,
}

impl LocalExactService {
    pub async fn try_from_env() -> anyhow::Result<Option<Self>> {
        let config = load_x402_config()?;
        if config.chains().is_empty() || config.schemes().is_empty() {
            return Ok(None);
        }

        let chain_registry = match ChainRegistry::from_config(config.chains()).await {
            Ok(registry) => registry,
            Err(err) => {
                warn!(reason = %err, "failed to initialize exact facilitator from environment");
                return Ok(None);
            }
        };

        let scheme_registry =
            SchemeRegistry::build(chain_registry, SchemeBlueprints::full(), config.schemes());
        if scheme_registry.values().next().is_none() {
            return Ok(None);
        }

        let facilitator = FacilitatorLocal::new(scheme_registry);
        Ok(Some(Self {
            inner: Arc::new(facilitator),
        }))
    }

    fn convert_verify_response(
        response: proto::VerifyResponse,
    ) -> Result<VerifyResponse, ValidationError> {
        let response = x402_rs::proto::v1::VerifyResponse::try_from(response)
            .map_err(|err| ValidationError::Exact(err.to_string()))?;
        Ok(match response {
            x402_rs::proto::v1::VerifyResponse::Valid { .. } => VerifyResponse {
                is_valid: true,
                invalid_reason: None,
                certificate: None,
            },
            x402_rs::proto::v1::VerifyResponse::Invalid { reason, .. } => VerifyResponse {
                is_valid: false,
                invalid_reason: Some(reason.to_string()),
                certificate: None,
            },
        })
    }

    fn convert_settle_response(
        response: proto::SettleResponse,
    ) -> Result<SettleResponse, ValidationError> {
        let response: x402_rs::proto::v1::SettleResponse = serde_json::from_value(response.0)
            .map_err(|err| ValidationError::Exact(err.to_string()))?;
        let (success, error, tx_hash, network) = match response {
            x402_rs::proto::v1::SettleResponse::Success {
                transaction,
                network,
                ..
            } => (true, None, Some(transaction), network),
            x402_rs::proto::v1::SettleResponse::Error { reason, network } => {
                (false, Some(reason), None, network)
            }
        };
        Ok(SettleResponse::from_exact(success, error, tx_hash, network))
    }
}

#[async_trait]
impl ExactService for LocalExactService {
    async fn verify(&self, request: &VerifyRequest) -> Result<VerifyResponse, ValidationError> {
        let converted = convert_verify_request(request)?;
        let result = self
            .inner
            .verify(&converted)
            .await
            .map_err(|err| ValidationError::Exact(err.to_string()))?;
        Self::convert_verify_response(result)
    }

    async fn settle(&self, request: &SettleRequest) -> Result<SettleResponse, ValidationError> {
        let converted = convert_settle_request(request)?;
        let result = self
            .inner
            .settle(&converted)
            .await
            .map_err(|err| ValidationError::Exact(err.to_string()))?;
        Self::convert_settle_response(result)
    }

    async fn supported(&self) -> Result<Vec<SupportedKind>, ValidationError> {
        let response = self
            .inner
            .supported()
            .await
            .map_err(|err| ValidationError::Exact(err.to_string()))?;
        convert_supported(response)
    }
}

struct HttpExactService {
    client: Client,
    base_url: Url,
}

impl HttpExactService {
    fn from_env() -> anyhow::Result<Option<Self>> {
        let Some((raw, source)) = Self::debit_url_from_env() else {
            return Ok(None);
        };

        let base_url = Url::parse(&raw)
            .or_else(|_| Url::parse(&format!("{raw}/")))
            .with_context(|| format!("failed to parse {source}"))?;

        Ok(Some(Self {
            client: reqwest::Client::builder()
                .no_proxy()
                .user_agent(format!("x402-4mica/{}", env!("CARGO_PKG_VERSION")))
                .default_headers({
                    let mut h = reqwest::header::HeaderMap::new();
                    h.insert(reqwest::header::ACCEPT, "application/json".parse().unwrap());
                    h
                })
                .build()
                .context("failed to build reqwest client")?,
            base_url,
        }))
    }

    fn debit_url_from_env() -> Option<(String, &'static str)> {
        let sanitize = |value: String| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        };

        let url = std::env::var(ENV_DEBIT_URL).ok().and_then(sanitize)?;
        Some((url, ENV_DEBIT_URL))
    }

    fn url(&self, path: &str) -> Result<Url, ValidationError> {
        self.base_url
            .join(path)
            .map_err(|err| ValidationError::Exact(format!("invalid debit facilitator URL: {err}")))
    }

    async fn post<Req, Resp>(&self, path: &str, payload: &Req) -> Result<Resp, ValidationError>
    where
        Req: serde::Serialize + ?Sized,
        Resp: for<'de> serde::Deserialize<'de>,
    {
        let url = self.url(path)?;
        let response = self
            .client
            .post(url)
            .json(payload)
            .send()
            .await
            .map_err(|err| {
                ValidationError::Exact(format!("failed to POST debit facilitator: {err}"))
            })?;
        Self::parse_response(response).await
    }

    async fn parse_response<T: for<'de> serde::Deserialize<'de>>(
        response: reqwest::Response,
    ) -> Result<T, ValidationError> {
        let status = response.status();
        let bytes = response
            .bytes()
            .await
            .map_err(|err| ValidationError::Exact(err.to_string()))?;

        if !status.is_success() {
            let body = String::from_utf8_lossy(&bytes);
            return Err(ValidationError::Exact(format!(
                "debit facilitator returned {status}: {body}"
            )));
        }

        serde_json::from_slice(&bytes).map_err(|err| ValidationError::Exact(err.to_string()))
    }

    async fn get<T: for<'de> serde::Deserialize<'de>>(
        &self,
        path: &str,
    ) -> Result<T, ValidationError> {
        let url = self.url(path)?;
        let response = self.client.get(url).send().await.map_err(|err| {
            ValidationError::Exact(format!("failed to GET debit facilitator: {err}"))
        })?;
        Self::parse_response(response).await
    }
}

#[async_trait]
impl ExactService for HttpExactService {
    async fn verify(&self, request: &VerifyRequest) -> Result<VerifyResponse, ValidationError> {
        let converted = convert_verify_request(request)?;
        let response: proto::VerifyResponse = self.post("verify", &converted).await?;
        LocalExactService::convert_verify_response(response)
    }

    async fn settle(&self, request: &SettleRequest) -> Result<SettleResponse, ValidationError> {
        let converted = convert_settle_request(request)?;
        let response: proto::SettleResponse = self.post("settle", &converted).await?;
        LocalExactService::convert_settle_response(response)
    }

    async fn supported(&self) -> Result<Vec<SupportedKind>, ValidationError> {
        let response: proto::SupportedResponse = self.get("supported").await.map_err(|err| {
            ValidationError::Exact(format!(
                "failed to fetch supported from {}: {err}",
                self.base_url
            ))
        })?;
        convert_supported(response)
    }
}

fn load_x402_config() -> anyhow::Result<X402Config> {
    let config_path = std::env::var(ENV_CONFIG_PATH)
        .ok()
        .and_then(|raw| {
            let trimmed = raw.trim().to_string();
            (!trimmed.is_empty()).then_some(std::path::PathBuf::from(trimmed))
        })
        .or_else(|| {
            let default_path = std::path::PathBuf::from("config.json");
            default_path.exists().then_some(default_path)
        });

    match config_path {
        Some(path) => {
            let content = std::fs::read_to_string(&path)
                .with_context(|| format!("failed to read x402 config at {}", path.display()))?;
            let config = serde_json::from_str(&content)
                .with_context(|| format!("failed to parse x402 config at {}", path.display()))?;
            Ok(config)
        }
        None => Ok(X402Config::default()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::env;

    fn set_debit_url(url: &str) {
        unsafe { env::set_var(ENV_DEBIT_URL, url) };
    }

    fn clear_debit_url() {
        unsafe { env::remove_var(ENV_DEBIT_URL) };
    }

    #[test]
    #[serial]
    fn parses_debit_url_from_env() {
        set_debit_url("http://example.com");
        let service = HttpExactService::from_env()
            .expect("from_env")
            .expect("present");
        let url = service.url("verify").expect("url");
        assert_eq!(url.as_str(), "http://example.com/verify");
        clear_debit_url();
    }
}
