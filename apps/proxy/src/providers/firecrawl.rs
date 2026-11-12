use std::time::Duration;

use axum::http::Method;

use super::{Auth, Jobs, Provider, Route};

/// Buckets mirror Firecrawl's per-endpoint rate limits; `browser` is the plan's concurrent browsers.
pub fn firecrawl() -> Provider {
    Provider {
        id: "firecrawl",
        base_url: "https://api.firecrawl.dev".into(),
        auth: Auth::Bearer,
        // Firecrawl accepts request timeouts up to 300 s.
        timeout: Duration::from_secs(330),
        cost_field: Some("/creditsUsed"),
        jobs: Some(Jobs {
            id_field: "/id",
            state_field: "/status",
            final_states: &["completed", "failed", "cancelled"],
        }),
        routes: vec![
            Route::new(Method::POST, "/v2/scrape", "scrape", Some("browser"))
                .cost_field(Some("/data/metadata/creditsUsed")),
            Route::new(Method::POST, "/v2/map", "map", None),
            Route::new(Method::POST, "/v2/search", "search", None),
            Route::new(Method::POST, "/v2/crawl", "crawl", None).starts_job(),
            Route::new(Method::POST, "/v2/batch/scrape", "crawl", None).starts_job(),
            Route::new(Method::POST, "/v2/extract", "agent", None).starts_job(),
            Route::new(Method::POST, "/v2/agent", "agent", None).starts_job(),
            Route::new(Method::GET, "/v2/crawl/", "crawl_status", None).follows_job(),
            Route::new(Method::DELETE, "/v2/crawl/", "crawl_status", None).follows_job(),
            Route::new(Method::GET, "/v2/batch/scrape/", "crawl_status", None).follows_job(),
            Route::new(Method::DELETE, "/v2/batch/scrape/", "crawl_status", None).follows_job(),
            Route::new(Method::GET, "/v2/extract/", "agent_status", None).follows_job(),
            Route::new(Method::GET, "/v2/agent/", "agent_status", None).follows_job(),
        ],
    }
}
