use tracing_subscriber::{EnvFilter, fmt};

pub fn init() {
    let _ = fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .try_init();
}
