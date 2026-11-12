use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, RawQuery, State};
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use reqwest::RequestBuilder;
use serde_json::json;
use sha2::{Digest, Sha256};
use tracing::error;

use entities::invocation::InvocationStatus;
use entities::{account, credential, job};

use crate::App;
use crate::capacity::{Demand, Lease, credential_checks, payer_check};
use crate::providers::{JobRole, Provider, Route};
use crate::repo::invocations::{self, NewInvocation, Outcome};
use crate::repo::jobs::{self, NewJob};
use crate::repo::{credentials, sellers};

/// Request: the most the call may cost, in the provider's units. Reserved from quota up front.
pub const MAX_COST_HEADER: &str = "x-max-cost";
/// Response: what the call actually cost, in the provider's units. Absent when the call never
/// reached the provider.
pub const COST_HEADER: &str = "x-proxy-cost";
/// Response to a job follow-up: the job's final cost once it has settled. It replaces what the
/// starting call charged.
pub const JOB_COST_HEADER: &str = "x-proxy-job-cost";

/// Forwards a seller's call to the provider once the payer and an account have capacity for it.
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
    let invocation_id = required_header(&headers, "x-invocation-id")?;
    let payer = required_header(&headers, "x-payer")?;
    let max_cost: u64 = parse_header(&headers, MAX_COST_HEADER)?
        .ok_or_else(|| invalid_request(format!("{MAX_COST_HEADER} header is required")))?;

    let route = provider.route_for(&method, &path);
    let job = match route.job {
        Some(JobRole::Follow) => Some(find_job(&app, provider.id, seller_id, route, &path).await?),
        _ => None,
    };

    let invocation = NewInvocation {
        id: invocation_id,
        seller_id,
        provider: provider.id,
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

    let demand = Demand {
        bucket: route.bucket,
        class: route.class,
        cost: max_cost,
        lease_ttl: provider.timeout + Duration::from_secs(5),
    };

    let mut url = format!("{}{path}", provider.base_url);
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
        .timeout(provider.timeout)
        .headers(forwarded)
        .body(body);

    let started = Instant::now();
    let pinned = job.as_ref().map(|j| j.credential_id);
    let (response, outcome) =
        match lease_credential(&app, provider.id, payer, &demand, pinned, invocation_id).await {
            Ok((credential, account, key, lease)) => {
                let mut done = send(
                    &app,
                    provider,
                    route,
                    credential.id,
                    max_cost,
                    provider.authorize(request, &key),
                )
                .await;
                if route.job == Some(JobRole::Follow) {
                    // The reported cost here is the job's running total, which settlement charges instead.
                    done.cost = 0;
                }
                let job_cost = match (route.job, &job) {
                    (Some(JobRole::Start), _) if done.status == InvocationStatus::Succeeded => {
                        match provider.started_job_id(&done.body) {
                            Some(job_id) => {
                                let new = NewJob {
                                    provider: provider.id,
                                    job_id: &job_id,
                                    invocation_id,
                                    seller_id,
                                    credential_id: credential.id,
                                    reserved: done.cost,
                                };
                                if let Err(err) = jobs::create(&app.db, new).await {
                                    error!(invocation_id, job_id, %err, "failed to record job");
                                }
                            }
                            None => error!(invocation_id, "job start response has no job id"),
                        }
                        None
                    }
                    (_, Some(job)) => {
                        settle_job(
                            &app,
                            provider,
                            route,
                            job,
                            &account,
                            done.status,
                            &done.body,
                        )
                        .await
                    }
                    _ => None,
                };
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
                let mut response = done.response;
                let headers = response.headers_mut();
                headers.insert(COST_HEADER, HeaderValue::from(done.cost));
                if let Some(cost) = job_cost {
                    headers.insert(JOB_COST_HEADER, HeaderValue::from(cost));
                }
                (response, outcome)
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

/// The seller's job a follow-up call names; another seller's job is reported as unknown.
async fn find_job(
    app: &App,
    provider: &str,
    seller_id: i64,
    route: &Route,
    path: &str,
) -> Result<job::Model, ApiError> {
    let unknown = || ApiError::new(StatusCode::NOT_FOUND, "unknown_job", "no such job");
    let job_id = route.job_id(path).ok_or_else(unknown)?;
    jobs::find(&app.db, provider, job_id)
        .await?
        .filter(|job| job.seller_id == seller_id)
        .ok_or_else(unknown)
}

/// The job's final cost: settles it on the first follow-up that shows a final state, moving the
/// account's quota from the reserved to the final cost.
async fn settle_job(
    app: &App,
    provider: &Provider,
    route: &Route,
    job: &job::Model,
    account: &account::Model,
    status: InvocationStatus,
    body: &[u8],
) -> Option<u64> {
    if let Some(cost) = job.cost {
        return Some(cost as u64);
    }
    if status != InvocationStatus::Succeeded {
        return None;
    }
    let cost = provider.final_job_cost(route, body)?;
    match jobs::settle(&app.db, job, cost).await {
        Ok(true) if account.limits.monthly_quota.is_some() => {
            let delta = cost as i64 - job.reserved;
            let started = job.created_at.to_utc();
            if let Err(err) = app.capacity.adjust_quota(account.id, started, delta).await {
                error!(job_id = job.job_id, %err, "failed to correct quota for settled job");
            }
        }
        Ok(_) => {}
        Err(err) => {
            error!(job_id = job.job_id, %err, "failed to settle job");
            return None;
        }
    }
    Some(cost)
}

/// Resolves the seller from its bearer token.
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

/// Reads a header that must be present and 1-128 characters long.
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

/// Parses an optional header, rejecting values that do not parse.
fn parse_header<T: std::str::FromStr>(
    headers: &HeaderMap,
    name: &str,
) -> Result<Option<T>, ApiError> {
    let Some(value) = headers.get(name) else {
        return Ok(None);
    };
    value
        .to_str()
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .map(Some)
        .ok_or_else(|| invalid_request(format!("{name} header is not a valid number")))
}

/// A 400 with the given message.
fn invalid_request(message: String) -> ApiError {
    ApiError::new(StatusCode::BAD_REQUEST, "invalid_request", message)
}

/// Picks the first credential whose limits all have room, and takes the capacity it needs.
async fn lease_credential(
    app: &App,
    provider: &str,
    payer: &str,
    demand: &Demand<'_>,
    pinned: Option<i64>,
    lease_id: &str,
) -> Result<(credential::Model, account::Model, String, Lease), ApiError> {
    let now = Utc::now();
    let candidates = credentials::candidates(&app.db, provider, pinned).await?;
    if pinned.is_some() && candidates.is_empty() {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "job_unavailable",
            "the credential running this job has been disabled",
        ));
    }
    for (credential, account) in candidates {
        let Ok(key) = std::env::var(&credential.key_env) else {
            error!(credential = credential.id, env = %credential.key_env, "credential key is not set");
            continue;
        };
        let mut checks = vec![payer_check(provider, payer, app.payer_rate_per_minute, now)];
        checks.extend(credential_checks(credential.id, &account, demand, now));
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
    /// The provider's response body; empty when there was none.
    body: Bytes,
    status: InvocationStatus,
    upstream_status: Option<u16>,
    cost: u64,
}

/// Calls the provider; cost is its report, else `max_cost` on success or unknown outcome and 0 on failure.
async fn send(
    app: &App,
    provider: &Provider,
    route: &Route,
    credential_id: i64,
    max_cost: u64,
    request: RequestBuilder,
) -> Done {
    let failed = |code, message: &str, status, cost| Done {
        response: ApiError::new(code, "upstream_error", message).into_response(),
        body: Bytes::new(),
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
        Err(err) if err.is_timeout() => {
            return failed(
                StatusCode::GATEWAY_TIMEOUT,
                "provider timed out",
                InvocationStatus::Unknown,
                max_cost,
            );
        }
        Err(_) => {
            return failed(
                StatusCode::BAD_GATEWAY,
                "provider request failed",
                InvocationStatus::Unknown,
                max_cost,
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
            max_cost,
        );
    };
    let reported = provider.reported_cost(route, &body);

    let (state, cost) = match status {
        StatusCode::TOO_MANY_REQUESTS => {
            cool_down(
                app,
                credential_id,
                retry_after.unwrap_or(Duration::from_secs(60)),
            )
            .await;
            (InvocationStatus::Rejected, reported.unwrap_or(0))
        }
        StatusCode::PAYMENT_REQUIRED => {
            error!(
                credential = credential_id,
                provider = provider.id,
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
                body,
                status: InvocationStatus::Failed,
                upstream_status: Some(status.as_u16()),
                cost: reported.unwrap_or(0),
            };
        }
        _ if status.is_success() => (InvocationStatus::Succeeded, reported.unwrap_or(max_cost)),
        _ => (InvocationStatus::Failed, reported.unwrap_or(0)),
    };

    let mut response = (status, body.clone()).into_response();
    if let Some(content_type) = content_type {
        response.headers_mut().insert(CONTENT_TYPE, content_type);
    }
    Done {
        response,
        body,
        status: state,
        upstream_status: Some(status.as_u16()),
        cost,
    }
}

/// Takes a credential out of rotation for a while, logging rather than failing if that cannot be stored.
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
    /// An error with a stable machine-readable code.
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    /// Logs the cause and returns a 500 that does not leak it.
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
    /// Database failures surface as an opaque 500.
    fn from(err: sea_orm::DbErr) -> Self {
        Self::internal(err)
    }
}

impl From<redis::RedisError> for ApiError {
    /// Valkey failures surface as an opaque 500.
    fn from(err: redis::RedisError) -> Self {
        Self::internal(err)
    }
}

impl IntoResponse for ApiError {
    /// Renders as `{ "code", "message" }` with the error's status.
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({ "code": self.code, "message": self.message })),
        )
            .into_response()
    }
}
