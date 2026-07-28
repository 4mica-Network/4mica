mod auth;
mod config;
mod exact;
mod issuer;
mod relayer;
mod server;
mod telemetry;
mod verifier;

use std::sync::Arc;

use anyhow::Context;

use crate::auth::AuthSession;
use crate::config::{ServiceConfig, load_public_params};
use crate::exact::ExactService;
use crate::exact::try_from_env as build_exact_service;
use crate::issuer::{GuaranteeIssuer, LiveGuaranteeIssuer};
use crate::relayer::Relayer;
use crate::server::state::{AppState, FourMicaHandler};
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

        // Gas sponsorship is opt-in per network. When configured, connecting is part of startup:
        // a relayer that cannot reach its chain, or sits on the wrong one, should stop the process
        // rather than surface as a failed deposit later.
        match Relayer::try_new(network, &public_params).await? {
            Some(relayer) => {
                let balance = relayer.balance().await?;
                if balance.is_zero() {
                    warn!(
                        network = %relayer.network(),
                        relayer = %relayer.address(),
                        "relayer account has no native balance; sponsored transactions will fail \
                         until it is funded"
                    );
                } else {
                    info!(
                        network = %relayer.network(),
                        relayer = %relayer.address(),
                        balance_wei = %balance,
                        "relayer ready to sponsor transactions"
                    );
                }
                relayers.push(relayer);
            }
            None => info!(
                network = %network.id,
                "no relayer configured; gas sponsorship disabled for this network"
            ),
        }

        four_mica_handlers.push(FourMicaHandler::new(
            service_cfg.scheme.clone(),
            network.id.clone(),
            verifier,
            issuer,
            public_params.validators.clone(),
        ));
    }

    let exact_service: Option<Arc<dyn ExactService>> = build_exact_service().await?;

    let state = AppState::new(four_mica_handlers, exact_service);

    server::run(service_cfg, state).await
}
