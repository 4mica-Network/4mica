use anyhow::Context;
use envconfig::Envconfig;
use migration::{Migrator, MigratorTrait};
use proxy_4mica::capacity::Capacity;
use proxy_4mica::config::Config;
use proxy_4mica::{App, providers, router};
use sea_orm::Database;
use tokio::net::TcpListener;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let config = Config::init_from_env().context("invalid configuration")?;
    let db = Database::connect(&config.database_url)
        .await
        .context("failed to connect to Postgres")?;
    Migrator::up(&db, None)
        .await
        .context("failed to run migrations")?;
    let app = App {
        db,
        capacity: Capacity::connect(&config.valkey_url)
            .await
            .context("failed to connect to Valkey")?,
        providers: providers::all(),
        http: reqwest::Client::new(),
        payer_rate_per_minute: config.payer_rate_per_minute,
    };

    let listener = TcpListener::bind((config.host.as_str(), config.port))
        .await
        .context("failed to bind listener")?;
    info!(addr = %listener.local_addr()?, providers = ?app.providers.keys().collect::<Vec<_>>(), "proxy started");
    axum::serve(listener, router(app))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("failed to install SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}
