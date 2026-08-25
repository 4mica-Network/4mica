mod handlers;
pub mod model;
pub(crate) mod state;
#[cfg(test)]
mod tests;

use std::sync::Arc;

use anyhow::Context;
use tokio::net::TcpListener;
use tracing::{error, info};

use crate::config::ServiceConfig;

use self::{handlers::build_router, state::AppState};

pub async fn run(cfg: ServiceConfig, state: AppState) -> anyhow::Result<()> {
    let state = Arc::new(state);
    let router = build_router(state.clone());

    let listener = TcpListener::bind(cfg.bind_addr)
        .await
        .context("failed to bind listener")?;

    let addr = listener.local_addr()?;
    info!(%addr, "x402-4mica facilitator started");

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(err) = tokio::signal::ctrl_c().await {
            error!(%err, "failed to install CTRL+C handler");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut sig) => {
                sig.recv().await;
            }
            Err(err) => {
                error!(%err, "failed to install SIGTERM handler");
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => (),
        _ = terminate => (),
    }
}
