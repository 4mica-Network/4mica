mod auth;
mod config;
mod exact;
mod issuer;
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
use crate::server::state::{AppState, FourMicaHandler};
use crate::verifier::{CertificateValidator, CertificateVerifier};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if dotenvy::from_filename(".env").is_err() {
        dotenvy::dotenv().ok();
    }
    telemetry::init();

    let service_cfg =
        ServiceConfig::from_env().context("failed to load facilitator configuration")?;
    let mut four_mica_handlers = Vec::new();
    for network in service_cfg.networks.iter() {
        let auth_session = match &network.auth {
            Some(auth_cfg) => Some(Arc::new(
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
            )),
            None => None,
        };
        let public_params = load_public_params(&network.core_api_base_url)
            .await
            .with_context(|| {
                format!(
                    "failed to load 4mica public parameters for network {}",
                    network.id
                )
            })?;

        let verifier = Arc::new(CertificateVerifier::new(
            public_params.operator_public_key,
            public_params.guarantee_domain,
            public_params.legacy_v1_guarantee_domain,
        )) as Arc<dyn CertificateValidator>;
        let issuer = Arc::new(
            LiveGuaranteeIssuer::try_new(network.core_api_base_url.clone(), auth_session.clone())
                .with_context(|| {
                format!(
                    "failed to initialize 4mica guarantee issuer for network {}",
                    network.id
                )
            })?,
        ) as Arc<dyn GuaranteeIssuer>;

        four_mica_handlers.push(FourMicaHandler::new(
            service_cfg.scheme.clone(),
            network.id.clone(),
            verifier,
            issuer,
            public_params.accepted_guarantee_versions.clone(),
            public_params.trusted_validation_registries.clone(),
        ));
    }

    let exact_service: Option<Arc<dyn ExactService>> = build_exact_service().await?;

    let state = AppState::new(four_mica_handlers, exact_service);

    server::run(service_cfg, state).await
}
