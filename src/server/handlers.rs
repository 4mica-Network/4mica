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
        ClaimRequest, ClaimResponse, ClaimVerifyResponse, DepositRequest, DepositResponse,
        DepositVerifyResponse, PayRequest, PayResponse, PayVerifyResponse, SettleRequest,
        SettleResponse, SupportedKind, SupportedResponse, VerifyRequest, VerifyResponse,
        WithdrawRequest, WithdrawResponse, WithdrawVerifyResponse,
    },
    state::SharedState,
};
use crate::clearing::{self, ClaimError, ClaimTerms, PayError, PayTerms};
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
        .route("/clearing/claim", post(claim_handler))
        .route("/clearing/claim/verify", post(claim_verify_handler))
        .route("/clearing/pay", post(pay_handler))
        .route("/clearing/pay/verify", post(pay_verify_handler))
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

/// Preflight for [`claim_handler`]: every check, no broadcast.
async fn claim_verify_handler(
    State(state): State<SharedState>,
    Json(request): Json<ClaimRequest>,
) -> impl IntoResponse {
    match run_claim_verify(&state, request).await {
        Ok(()) => Json(ClaimVerifyResponse::valid()),
        Err(err) => {
            state.claim_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "claim verification failed");
            Json(ClaimVerifyResponse::invalid(&err))
        }
    }
}

async fn run_claim_verify(state: &SharedState, request: ClaimRequest) -> Result<(), ClaimError> {
    state.claim_guard().check_global()?;
    let (relayer, terms) = resolve_claim(state, &request).await?;
    clearing::verify(relayer, state.claim_guard().limits(), &terms).await
}

/// Submits a net-credit claim on the creditor's behalf, with the relayer paying gas.
///
/// The payout goes to `creditor` for the amount the committed Merkle leaf fixes — this service
/// cannot alter either, which is why the request carries no signature.
async fn claim_handler(
    State(state): State<SharedState>,
    Json(request): Json<ClaimRequest>,
) -> impl IntoResponse {
    match run_claim(&state, request).await {
        Ok(response) => {
            state.claim_guard().record_sponsored();
            info!(
                tx_hash = response.tx_hash.as_deref().unwrap_or_default(),
                creditor = response.creditor.as_deref().unwrap_or_default(),
                cycle_id = response.cycle_id.as_deref().unwrap_or_default(),
                amount = response.amount.as_deref().unwrap_or_default(),
                network = response.network.as_deref().unwrap_or_default(),
                "sponsored net-credit claim submitted"
            );
            Json(response)
        }
        Err(err) => {
            state.claim_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "sponsored net-credit claim failed");
            Json(ClaimResponse::failure(&err))
        }
    }
}

async fn run_claim(
    state: &SharedState,
    request: ClaimRequest,
) -> Result<ClaimResponse, ClaimError> {
    state.claim_guard().check_global()?;
    let (relayer, terms) = resolve_claim(state, &request).await?;
    let tx_hash = clearing::submit(relayer, state.claim_guard(), &terms).await?;
    Ok(ClaimResponse::success(tx_hash, relayer.network(), &terms))
}

/// Preflight for [`pay_handler`]. Runs every check without broadcasting, so a debtor can find out
/// an authorization is unusable before anyone spends gas on it.
async fn pay_verify_handler(
    State(state): State<SharedState>,
    Json(request): Json<PayRequest>,
) -> impl IntoResponse {
    match run_pay_verify(&state, request).await {
        Ok(()) => Json(PayVerifyResponse::valid()),
        Err(err) => {
            state.pay_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "payment verification failed");
            Json(PayVerifyResponse::invalid(&err))
        }
    }
}

async fn run_pay_verify(state: &SharedState, request: PayRequest) -> Result<(), PayError> {
    state.pay_guard().check_global()?;
    let (relayer, terms, authorization) = resolve_pay(state, request).await?;
    clearing::verify_pay(
        relayer,
        state.pay_guard().limits(),
        &terms,
        &authorization,
        now_secs(),
    )
    .await
}

/// Submits a net-debit payment on the debtor's behalf, with the relayer paying gas.
///
/// The funds come from the debtor's own EIP-3009 signature — bound to the ClearingHouse, the
/// committed amount, and the cycle — so this service can decide only whether to submit, never what
/// is paid.
async fn pay_handler(
    State(state): State<SharedState>,
    Json(request): Json<PayRequest>,
) -> impl IntoResponse {
    match run_pay(&state, request).await {
        Ok(response) => {
            state.pay_guard().record_sponsored();
            info!(
                tx_hash = response.tx_hash.as_deref().unwrap_or_default(),
                debtor = response.debtor.as_deref().unwrap_or_default(),
                cycle_id = response.cycle_id.as_deref().unwrap_or_default(),
                amount = response.amount.as_deref().unwrap_or_default(),
                network = response.network.as_deref().unwrap_or_default(),
                "sponsored net-debit payment submitted"
            );
            Json(response)
        }
        Err(err) => {
            state.pay_guard().record_rejected(err.is_throttling());
            warn!(reason = %err, code = err.code(), "sponsored net-debit payment failed");
            Json(PayResponse::failure(&err))
        }
    }
}

async fn run_pay(state: &SharedState, request: PayRequest) -> Result<PayResponse, PayError> {
    state.pay_guard().check_global()?;
    let (relayer, terms, authorization) = resolve_pay(state, request).await?;
    let tx_hash = clearing::submit_pay(
        relayer,
        state.pay_guard(),
        &terms,
        &authorization,
        now_secs(),
    )
    .await?;
    Ok(PayResponse::success(tx_hash, relayer.network(), &terms))
}

/// Validates the request's identifiers and authorization shape, then resolves the debit's terms
/// from the network's core. The debtor is the authorization's `from` — core then proves (or
/// refuses) a leaf for exactly that address, so a stranger's signature simply resolves no terms.
async fn resolve_pay(
    state: &SharedState,
    request: PayRequest,
) -> Result<
    (
        &crate::relayer::Relayer,
        PayTerms,
        clearing::PayAuthorization,
    ),
    PayError,
> {
    let authorization = clearing::PayAuthorization::parse(
        request.asset_transfer_method.as_deref(),
        request.authorization,
        request.permit2_authorization,
        request.eip2612_permit.map(|p| p.parse()).transpose()?,
    )?;
    let cycle_id = clearing::parse_pay_cycle_id(&request.cycle_id)?;
    let relayer = state.relayer_for(request.network.as_deref())?;
    let actions = state
        .clearing_actions_for(relayer.network())
        .ok_or_else(|| {
            PayError::ActionUnavailable(format!(
                "no core endpoint configured for network {}",
                relayer.network()
            ))
        })?;
    let terms = actions.pay_terms(cycle_id, authorization.from()).await?;
    Ok((relayer, terms, authorization))
}

/// Validates the request's identifiers, then resolves the claim's terms from the network's core.
async fn resolve_claim<'a>(
    state: &'a SharedState,
    request: &ClaimRequest,
) -> Result<(&'a crate::relayer::Relayer, ClaimTerms), ClaimError> {
    let creditor = clearing::parse_creditor(&request.creditor)?;
    let cycle_id = clearing::parse_cycle_id(&request.cycle_id)?;
    let relayer = state.relayer_for(request.network.as_deref())?;
    let actions = state
        .clearing_actions_for(relayer.network())
        .ok_or_else(|| {
            ClaimError::ActionUnavailable(format!(
                "no core endpoint configured for network {}",
                relayer.network()
            ))
        })?;
    let terms = actions.claim_terms(cycle_id, creditor).await?;
    Ok((relayer, terms))
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
