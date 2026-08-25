mod auth;
mod clearing;
mod config;
mod deposit;
mod exact;
mod issuer;
mod limits;
mod relayer;
mod server;
mod telemetry;
mod verifier;
mod withdraw;

use std::sync::Arc;

use anyhow::Context;

use crate::auth::AuthSession;
use crate::clearing::ClearingActions;
use crate::config::{ServiceConfig, load_public_params};
use crate::exact::ExactService;
use crate::exact::try_from_env as build_exact_service;
use crate::issuer::{GuaranteeIssuer, LiveGuaranteeIssuer};
use crate::limits::SponsorGuard;
use crate::relayer::Relayer;
use crate::server::state::{AppState, FourMicaHandler, SponsorGuards};
use crate::verifier::{CertificateValidator, CertificateVerifier};
use tracing::{info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if dotenvy::from_filename(".env").is_err() {
        dotenvy::dotenv().ok();
    }
    telemetry::init();

    let service_cfg =
        ServiceConfig::from_env().context("failed to load facilitator configuration")?;
    let mut four_mica_handlers = Vec::new();
    let mut relayers: Vec<Relayer> = Vec::new();
    let mut clearing_actions: Vec<(String, Arc<ClearingActions>)> = Vec::new();
    for network in service_cfg.networks.iter() {
        let auth_cfg = &network.auth;
        let auth_session = Some(Arc::new(
            AuthSession::try_new(
                auth_cfg.auth_url.clone(),
                &auth_cfg.wallet_private_key,
                auth_cfg.refresh_margin_secs,
            )
            .with_context(|| {
                format!(
                    "failed to initialize auth session for network {}",
                    network.id
                )
            })?,
        ));
        let public_params = load_public_params(&network.core_api_base_url)
            .await
            .with_context(|| {
                format!(
                    "failed to load 4mica public parameters for network {}",
                    network.id
                )
            })?;

        let verifier = Arc::new(
            CertificateVerifier::try_new(
                public_params.operator_public_key,
                public_params.guarantee_domain,
            )
            .map_err(anyhow::Error::msg)
            .with_context(|| {
                format!(
                    "failed to build 4mica certificate verifier for network {}",
                    network.id
                )
            })?,
        ) as Arc<dyn CertificateValidator>;
        let issuer = Arc::new(
            LiveGuaranteeIssuer::try_new(network.core_api_base_url.clone(), auth_session.clone())
                .with_context(|| {
                format!(
                    "failed to initialize 4mica guarantee issuer for network {}",
                    network.id
                )
            })?,
        ) as Arc<dyn GuaranteeIssuer>;

        if let Some(relayer) = connect_relayer(network, &public_params).await? {
            relayers.push(relayer);
        }

        clearing_actions.push((
            network.id.clone(),
            Arc::new(ClearingActions::new(
                network.core_api_base_url.clone(),
                auth_session.clone(),
            )),
        ));

        four_mica_handlers.push(FourMicaHandler::new(
            service_cfg.scheme.clone(),
            network.id.clone(),
            verifier,
            issuer,
            public_params.validators.clone(),
        ));
    }

    let deposit_guard = SponsorGuard::new(service_cfg.deposit_limits.clone());
    let withdraw_guard = SponsorGuard::new(service_cfg.withdraw_limits.clone());
    let claim_guard = SponsorGuard::new(service_cfg.claim_limits.clone());
    let pay_guard = SponsorGuard::new(service_cfg.pay_limits.clone());
    log_sponsor_limits("deposit", &deposit_guard, relayers.is_empty());
    log_sponsor_limits("withdraw", &withdraw_guard, relayers.is_empty());
    log_sponsor_limits("claim", &claim_guard, relayers.is_empty());
    log_sponsor_limits("pay", &pay_guard, relayers.is_empty());

    let exact_service: Option<Arc<dyn ExactService>> = build_exact_service().await?;

    let state = AppState::new(
        four_mica_handlers,
        exact_service,
        relayers,
        clearing_actions,
        SponsorGuards {
            deposit: deposit_guard,
            withdraw: withdraw_guard,
            claim: claim_guard,
            pay: pay_guard,
        },
    );

    server::run(service_cfg, state).await
}

/// Connects this network's relayer, or `None` when it did not configure one.
///
/// A relayer that cannot reach its chain, or sits on the wrong one, aborts startup — those are
/// misconfigurations that would otherwise surface as failed deposits. A balance that cannot be
/// *read* is only a warning: `/health` already models that as degraded-but-running, and a transient
/// RPC hiccup should not stop the process from serving `/verify` and `/settle`.
async fn connect_relayer(
    network: &config::NetworkConfig,
    public_params: &config::PublicParameters,
) -> anyhow::Result<Option<Relayer>> {
    let Some(relayer) = Relayer::try_new(network, public_params).await? else {
        info!(
            network = %network.id,
            "no relayer configured; gas sponsorship disabled for this network"
        );
        return Ok(None);
    };

    match relayer.balance().await {
        Ok(balance) if balance.is_zero() => warn!(
            network = %relayer.network(),
            relayer = %relayer.address(),
            "relayer account has no native balance; sponsored transactions will fail until it is funded"
        ),
        Ok(balance) => info!(
            network = %relayer.network(),
            relayer = %relayer.address(),
            balance_wei = %balance,
            "relayer ready to sponsor transactions"
        ),
        Err(err) => warn!(
            network = %relayer.network(),
            relayer = %relayer.address(),
            error = ?err,
            "could not read relayer balance at startup; /health will report degraded"
        ),
    }

    Ok(Some(relayer))
}

fn log_sponsor_limits(action: &str, guard: &SponsorGuard, no_relayers: bool) {
    if no_relayers {
        info!(
            action,
            "no relayers configured; gas sponsorship is unavailable"
        );
        return;
    }

    let limits = guard.limits();
    info!(
        max_in_flight = limits.max_in_flight,
        per_address_limit = limits.per_address_limit,
        global_limit = limits.global_limit,
        window_secs = limits.window.as_secs(),
        min_relayer_balance_wei = %limits.min_relayer_balance_wei,
        max_gas = limits.max_gas,
        action,
        "sponsorship throttling active"
    );
    if limits.min_relayer_balance_wei.is_zero() {
        warn!(
            action,
            "no MIN_RELAYER_BALANCE_WEI floor is set; transactions will keep being submitted \
             until the relayer is fully drained"
        );
    }
}
