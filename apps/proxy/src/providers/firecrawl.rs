use std::time::Duration;

use axum::http::Method;

use super::{Auth, Provider, Route};

/// Buckets mirror Firecrawl's per-endpoint rate limits; `browser` is the plan's concurrent browsers.
pub fn firecrawl() -> Provider {
    Provider {
        id: "firecrawl",
        base_url: "https://api.firecrawl.dev".into(),
        auth: Auth::Bearer,
        // Firecrawl accepts request timeouts up to 300 s.
        timeout: Duration::from_secs(330),
        cost_field: Some("/creditsUsed"),
        routes: vec![
            Route::new(Method::POST, "/v2/scrape", "scrape", Some("browser")),
            Route::new(Method::POST, "/v2/map", "map", None),
            Route::new(Method::POST, "/v2/search", "search", None),
            Route::new(Method::POST, "/v2/crawl", "crawl", None),
            Route::new(Method::POST, "/v2/batch/scrape", "crawl", None),
            Route::new(Method::POST, "/v2/extract", "agent", None),
            Route::new(Method::POST, "/v2/agent", "agent", None),
            Route::new(Method::GET, "/v2/crawl/", "crawl_status", None),
            Route::new(Method::GET, "/v2/batch/scrape/", "crawl_status", None),
            Route::new(Method::GET, "/v2/extract/", "agent_status", None),
            Route::new(Method::GET, "/v2/agent/", "agent_status", None),
        ],
    }
}
