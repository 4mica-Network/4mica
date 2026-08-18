use axum::{
    Json, Router,
    extract::State,
    response::IntoResponse,
    routing::{get, post},
};
use serde::Serialize;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};

use super::{
    model::{
        DepositRequest, DepositResponse, DepositVerifyResponse, SettleRequest, SettleResponse,
        SupportedKind, SupportedResponse, VerifyRequest, VerifyResponse, WithdrawRequest,
        WithdrawResponse, WithdrawVerifyResponse,
    },
    state::SharedState,
};
use crate::deposit::{self, DepositError, DepositIntent};
use crate::withdraw::{self, WithdrawError, WithdrawIntent};

pub(super) fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(home_handler))
        .route("/supported", get(supported_handler))
        .route("/verify", post(verify_handler))
        .route("/settle", post(settle_handler))
        .route("/deposit", post(deposit_handler))
        .route("/deposit/verify", post(deposit_verify_handler))
        .route("/withdraw", post(withdraw_handler))
        .route("/withdraw/verify", post(withdraw_verify_handler))
        .route("/health", get(health_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Preflight for [`deposit_handler`]. Runs every check without broadcasting, so a client can find
/// out an authorization is unusable before anyone spends gas on it.
async fn deposit_verify_handler(
    State(state): State<SharedState>,
    Json(request): Json<DepositRequest>,
) -> impl IntoResponse {
    match run_deposit_verify(&state, request).await {
        Ok(()) => Json(DepositVerifyResponse::valid()),
        Err(err) => {
            // Counted like a submit rejection: this endpoint consumes a global rate-limit slot and
            // several eth_calls, so abuse aimed here would otherwise be invisible on /health.
            state.deposit_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "deposit verification failed");
            Json(DepositVerifyResponse::invalid(&err))
        }
    }
}

async fn run_deposit_verify(
    state: &SharedState,
    request: DepositRequest,
) -> Result<(), DepositError> {
    // Before any RPC work: /deposit/verify makes several eth_calls per request, so an unbounded
    // caller could exhaust the node quota without ever submitting anything.
    state.deposit_guard().check_global()?;
    let relayer = state.relayer_for(request.network.as_deref())?;
    let intent = DepositIntent::parse(
        &request.asset,
        &request.amount,
        request.asset_transfer_method.as_deref(),
        request.authorization,
        request.permit2_authorization,
        request.eip2612_permit.map(|p| p.parse()).transpose()?,
    )?;
    deposit::verify(relayer, state.deposit_guard().limits(), &intent, now_secs()).await
}

/// Submits a gasless deposit, with the relayer paying gas.
///
/// The collateral is credited to `authorization.from`, never to the relayer — the token binds the
/// destination and amount inside the signature, so this service cannot alter either.
async fn deposit_handler(
    State(state): State<SharedState>,
    Json(request): Json<DepositRequest>,
) -> impl IntoResponse {
    match run_deposit(&state, request).await {
        Ok(response) => {
            state.deposit_guard().record_sponsored();
            info!(
                tx_hash = response.tx_hash.as_deref().unwrap_or_default(),
                from = response.from.as_deref().unwrap_or_default(),
                asset = response.asset.as_deref().unwrap_or_default(),
                amount = response.amount.as_deref().unwrap_or_default(),
                network = response.network.as_deref().unwrap_or_default(),
                "gasless deposit submitted"
            );
            Json(response)
        }
        Err(err) => {
            state.deposit_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "gasless deposit failed");
            Json(DepositResponse::failure(&err))
        }
    }
}

async fn run_deposit(
    state: &SharedState,
    request: DepositRequest,
) -> Result<DepositResponse, DepositError> {
    state.deposit_guard().check_global()?;
    let relayer = state.relayer_for(request.network.as_deref())?;
    let intent = DepositIntent::parse(
        &request.asset,
        &request.amount,
        request.asset_transfer_method.as_deref(),
        request.authorization,
        request.permit2_authorization,
        request.eip2612_permit.map(|p| p.parse()).transpose()?,
    )?;

    let tx_hash = deposit::submit(relayer, state.deposit_guard(), &intent, now_secs()).await?;
    Ok(DepositResponse::success(
        tx_hash,
        relayer.network(),
        &intent,
    ))
}

/// Preflight for [`withdraw_handler`], with the same guarantee: every check, no broadcast.
async fn withdraw_verify_handler(
    State(state): State<SharedState>,
    Json(request): Json<WithdrawRequest>,
) -> impl IntoResponse {
    match run_withdraw_verify(&state, request).await {
        Ok(()) => Json(WithdrawVerifyResponse::valid()),
        Err(err) => {
            state.withdraw_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "withdrawal verification failed");
            Json(WithdrawVerifyResponse::invalid(&err))
        }
    }
}

async fn run_withdraw_verify(
    state: &SharedState,
    request: WithdrawRequest,
) -> Result<(), WithdrawError> {
    state.withdraw_guard().check_global()?;
    let relayer = state.relayer_for(request.network.as_deref())?;
    let intent = request.parse()?;
    withdraw::verify(
        relayer,
        state.withdraw_guard().limits(),
        &intent,
        now_secs(),
    )
    .await
}

/// Submits a gasless withdrawal step, with the relayer paying gas.
///
/// The action always applies to the user named in the authorization, never to the relayer — the
/// signature binds every field, so this service cannot alter any of them.
async fn withdraw_handler(
    State(state): State<SharedState>,
    Json(request): Json<WithdrawRequest>,
) -> impl IntoResponse {
    match run_withdraw(&state, request).await {
        Ok((response, action)) => {
            state.withdraw_guard().record_sponsored();
            info!(
                action,
                tx_hash = response.tx_hash.as_deref().unwrap_or_default(),
                user = response.user.as_deref().unwrap_or_default(),
                asset = response.asset.as_deref().unwrap_or_default(),
                network = response.network.as_deref().unwrap_or_default(),
                "gasless withdrawal submitted"
            );
            Json(response)
        }
        Err(err) => {
            state.withdraw_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "gasless withdrawal failed");
            Json(WithdrawResponse::failure(&err))
        }
    }
}

async fn run_withdraw(
    state: &SharedState,
    request: WithdrawRequest,
) -> Result<(WithdrawResponse, &'static str), WithdrawError> {
    state.withdraw_guard().check_global()?;
    let relayer = state.relayer_for(request.network.as_deref())?;
    let intent: WithdrawIntent = request.parse()?;

    let tx_hash = withdraw::submit(relayer, state.withdraw_guard(), &intent, now_secs()).await?;
    Ok((
        WithdrawResponse::success(tx_hash, relayer.network(), &intent),
        intent.action(),
    ))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

async fn supported_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let kinds = state.supported().await;
    Json(SupportedResponse::new(kinds))
}

async fn home_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let supported = state.supported().await;
    Json(HomeResponse {
        message: "Welcome to the 4mica credit facilitator. Use /supported to discover payment schemes, /verify to validate X-PAYMENT headers, and /settle to mint certificates or forward debit settlements.",
        supported,
        health: "/health",
        docs: "See README.md for a full flow walkthrough.",
    })
}

async fn health_handler(State(state): State<SharedState>) -> impl IntoResponse {
    Json(state.health().await)
}

async fn verify_handler(
    State(state): State<SharedState>,
    Json(request): Json<VerifyRequest>,
) -> impl IntoResponse {
    let x402_version = match request.resolved_x402_version() {
        Ok(version) => version,
        Err(err) => {
            warn!(reason = %err, "verify request rejected");
            return Json(VerifyResponse {
                is_valid: false,
                invalid_reason: Some(err.to_string()),
                certificate: None,
            });
        }
    };

    if let Err(err) = state.validate_version(x402_version) {
        warn!(reason = %err, "verify request rejected");
        return Json(VerifyResponse {
            is_valid: false,
            invalid_reason: Some(err.to_string()),
            certificate: None,
        });
    }

    match state.verify(&request, x402_version).await {
        Ok(response) => Json(response),
        Err(err) => {
            warn!(reason = %err, "payment validation failed");
            Json(VerifyResponse {
                is_valid: false,
                invalid_reason: Some(err.to_string()),
                certificate: None,
            })
        }
    }
}

async fn settle_handler(
    State(state): State<SharedState>,
    Json(request): Json<SettleRequest>,
) -> impl IntoResponse {
    let x402_version = match request.resolved_x402_version() {
        Ok(version) => version,
        Err(err) => {
            warn!(reason = %err, "settle request rejected");
            return Json(SettleResponse::invalid(err.to_string(), state.network()));
        }
    };

    if let Err(err) = state.validate_version(x402_version) {
        warn!(reason = %err, "settle request rejected");
        return Json(SettleResponse::invalid(err.to_string(), state.network()));
    }

    match state.settle(&request, x402_version).await {
        Ok(response) => {
            if let Some(tx_hash) = response.tx_hash.as_deref() {
                info!(tx_hash, "settlement forwarded to on-chain handler");
            } else if response.certificate.is_some() {
                info!("settlement completed with 4mica guarantee");
            } else {
                info!("settlement acknowledged (deferred)");
            }
            Json(response)
        }
        Err(err) => {
            warn!(reason = %err, "settlement validation failed");
            Json(SettleResponse::invalid(err.to_string(), state.network()))
        }
    }
}

#[derive(Serialize)]
struct HomeResponse<'a> {
    message: &'a str,
    supported: Vec<SupportedKind>,
    health: &'a str,
    docs: &'a str,
}
