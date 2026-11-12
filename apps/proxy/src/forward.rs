use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, RawQuery, State};
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use reqwest::RequestBuilder;
use serde_json::json;
use sha2::{Digest, Sha256};
use tracing::error;

use entities::invocation::InvocationStatus;
use entities::{account, credential};

use crate::App;
use crate::capacity::{Lease, credential_checks, payer_check};
use crate::providers::{Provider, Route};
use crate::repo::invocations::{self, NewInvocation, Outcome};
use crate::repo::{credentials, sellers};

pub async fn handle(
    State(app): State<Arc<App>>,
    Path((provider_id, path)): Path<(String, String)>,
    RawQuery(query): RawQuery,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, ApiError> {
    let seller_id = authenticate(&app, &headers).await?;
    let provider = app.providers.get(provider_id.as_str()).ok_or_else(|| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "unknown_provider",
            "no such provider",
        )
    })?;
    let path = format!("/{path}");
    let route = provider.route(&method, &path, &body).ok_or_else(|| {
        ApiError::new(
            StatusCode::NOT_FOUND,
            "unknown_endpoint",
            "this endpoint is not offered",
        )
    })?;
    let invocation_id = required_header(&headers, "x-invocation-id")?;
    let payer = required_header(&headers, "x-payer")?;

    let invocation = NewInvocation {
        id: invocation_id,
        seller_id,
        provider: provider.id(),
        payer,
        method: method.as_str(),
        path: &path,
    };
    if !invocations::start(&app.db, invocation).await? {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "duplicate_invocation",
            "this invocation id was already used",
        ));
    }

    let mut url = format!("{}{path}", provider.base_url());
    if let Some(query) = query {
        url = format!("{url}?{query}");
    }
    let mut forwarded = HeaderMap::new();
    for name in [CONTENT_TYPE, ACCEPT] {
        if let Some(value) = headers.get(&name) {
            forwarded.insert(name, value.clone());
        }
    }
    let request = app
        .http
        .request(method, url)
        .timeout(route.timeout)
        .headers(forwarded)
        .body(body);

    let started = Instant::now();
    let (response, outcome) = match admit(&app, provider.id(), payer, &route, invocation_id).await {
        Ok((credential, _, key, lease)) => {
            let done = send(
                &app,
                provider.as_ref(),
                &route,
                credential.id,
                provider.authorize(request, &key),
            )
            .await;
            if let Err(err) = app.capacity.release(lease, done.cost).await {
                error!(invocation_id, %err, "failed to release capacity lease");
            }
            let outcome = Outcome {
                status: done.status,
                credential_id: Some(credential.id),
                upstream_status: done.upstream_status.map(i32::from),
                cost: Some(done.cost as i64),
                latency_ms: Some(started.elapsed().as_millis() as i32),
            };
            (done.response, outcome)
        }
        Err(err) => (
            err.into_response(),
            Outcome {
                status: InvocationStatus::Rejected,
                credential_id: None,
                upstream_status: None,
                cost: None,
                latency_ms: None,
            },
        ),
    };

    if let Err(err) = invocations::finish(&app.db, invocation_id, outcome).await {
        error!(invocation_id, %err, "failed to record invocation outcome");
    }
    Ok(response)
}

async fn authenticate(app: &App, headers: &HeaderMap) -> Result<i64, ApiError> {
    let unauthorized = || {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "missing or invalid seller token",
        )
    };
    let token = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(unauthorized)?;
    let hash = hex::encode(Sha256::digest(token.as_bytes()));
    sellers::find_enabled_by_token_hash(&app.db, &hash)
        .await?
        .map(|seller| seller.id)
        .ok_or_else(unauthorized)
}

fn required_header<'a>(headers: &'a HeaderMap, name: &'static str) -> Result<&'a str, ApiError> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| (1..=128).contains(&v.len()))
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_request",
                format!("{name} header is required (1-128 chars)"),
            )
        })
}

async fn admit(
    app: &App,
    provider: &str,
    payer: &str,
    route: &Route,
    lease_id: &str,
) -> Result<(credential::Model, account::Model, String, Lease), ApiError> {
    let now = Utc::now();
    for (credential, account) in credentials::candidates(&app.db, provider).await? {
        let Ok(key) = std::env::var(&credential.key_env) else {
            error!(credential = credential.id, env = %credential.key_env, "credential key is not set");
            continue;
        };
        let mut checks = vec![payer_check(provider, payer, app.payer_rate_per_minute, now)];
        checks.extend(credential_checks(credential.id, &account, route, now));
        match app.capacity.acquire(&checks, lease_id, now).await? {
            Ok(lease) => return Ok((credential, account, key, lease)),
            Err(0) => {
                return Err(ApiError::new(
                    StatusCode::TOO_MANY_REQUESTS,
                    "payer_rate_limited",
                    "too many requests from this payer",
                ));
            }
            Err(_) => continue,
        }
    }
    Err(ApiError::new(
        StatusCode::TOO_MANY_REQUESTS,
        "capacity_exhausted",
        "no capacity available for this endpoint right now",
    ))
}

struct Done {
    response: Response,
    status: InvocationStatus,
    upstream_status: Option<u16>,
    cost: u64,
}

async fn send(
    app: &App,
    provider: &dyn Provider,
    route: &Route,
    credential_id: i64,
    request: RequestBuilder,
) -> Done {
    let failed = |code, message: &str, status, cost| Done {
        response: ApiError::new(code, "upstream_error", message).into_response(),
        status,
        upstream_status: None,
        cost,
    };

    let upstream = match request.send().await {
        Ok(upstream) => upstream,
        Err(err) if err.is_connect() => {
            return failed(
                StatusCode::BAD_GATEWAY,
                "provider unreachable",
                InvocationStatus::Failed,
                0,
            );
        }
        // The provider may have done the work, so the reserved cost stays charged.
        Err(err) if err.is_timeout() => {
            return failed(
                StatusCode::GATEWAY_TIMEOUT,
                "provider timed out",
                InvocationStatus::Unknown,
                route.cost,
            );
        }
        Err(_) => {
            return failed(
                StatusCode::BAD_GATEWAY,
                "provider request failed",
                InvocationStatus::Unknown,
                route.cost,
            );
        }
    };

    let status = upstream.status();
    let content_type = upstream.headers().get(CONTENT_TYPE).cloned();
    let retry_after = upstream
        .headers()
        .get(RETRY_AFTER)
        .and_then(|v| v.to_str().ok()?.parse().ok())
        .map(Duration::from_secs);
    let Ok(body) = upstream.bytes().await else {
        return failed(
            StatusCode::BAD_GATEWAY,
            "provider response was cut off",
            InvocationStatus::Unknown,
            route.cost,
        );
    };

    let (state, cost) = match status {
        StatusCode::TOO_MANY_REQUESTS => {
            cool_down(
                app,
                credential_id,
                retry_after.unwrap_or(Duration::from_secs(60)),
            )
            .await;
            (InvocationStatus::Rejected, 0)
        }
        StatusCode::PAYMENT_REQUIRED => {
            error!(
                credential = credential_id,
                provider = provider.id(),
                "provider account is out of credits"
            );
            cool_down(app, credential_id, Duration::from_secs(3600)).await;
            return Done {
                response: ApiError::new(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "capacity_exhausted",
                    "no capacity available",
                )
                .into_response(),
                status: InvocationStatus::Failed,
                upstream_status: Some(status.as_u16()),
                cost: 0,
            };
        }
        _ if status.is_success() => (
            InvocationStatus::Succeeded,
            provider.cost(route, status, &body),
        ),
        _ => (
            InvocationStatus::Failed,
            provider.cost(route, status, &body),
        ),
    };

    let mut response = (status, body).into_response();
    if let Some(content_type) = content_type {
        response.headers_mut().insert(CONTENT_TYPE, content_type);
    }
    Done {
        response,
        status: state,
        upstream_status: Some(status.as_u16()),
        cost,
    }
}

async fn cool_down(app: &App, credential_id: i64, for_: Duration) {
    if let Err(err) = app.capacity.cool_down(credential_id, for_).await {
        error!(credential = credential_id, %err, "failed to cool down credential");
    }
}

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn internal(err: impl std::fmt::Display) -> Self {
        error!(%err, "internal error");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "internal error",
        )
    }
}

impl From<sea_orm::DbErr> for ApiError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::internal(err)
    }
}

impl From<redis::RedisError> for ApiError {
    fn from(err: redis::RedisError) -> Self {
        Self::internal(err)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({ "code": self.code, "message": self.message })),
        )
            .into_response()
    }
}
