pub mod capacity;
pub mod config;
mod forward;
pub mod providers;
pub mod repo;

use std::sync::Arc;

use axum::Router;
use axum::routing::{any, get};
use sea_orm::DatabaseConnection;
use tower_http::trace::TraceLayer;

use crate::capacity::Capacity;
use crate::providers::Providers;

pub struct App {
    pub db: DatabaseConnection,
    pub capacity: Capacity,
    pub providers: Providers,
    pub http: reqwest::Client,
    pub payer_rate_per_minute: u32,
}

pub fn router(app: App) -> Router {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/{provider}/{*path}", any(forward::handle))
        .layer(TraceLayer::new_for_http())
        .with_state(Arc::new(app))
}
