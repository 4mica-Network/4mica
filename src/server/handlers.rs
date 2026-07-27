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
        HealthResponse, SettleRequest, SettleResponse, SupportedKind, SupportedResponse,
        VerifyRequest, VerifyResponse,
    },
    state::SharedState,
};

pub(super) fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(home_handler))
        .route("/supported", get(supported_handler))
        .route("/verify", post(verify_handler))
        .route("/settle", post(settle_handler))
        .route("/health", get(health_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
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

async fn health_handler() -> impl IntoResponse {
    Json(HealthResponse { status: "ok" })
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
