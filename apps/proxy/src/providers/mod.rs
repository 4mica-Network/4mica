mod firecrawl;

use std::collections::HashMap;
use std::time::Duration;

use axum::http::Method;
use reqwest::RequestBuilder;
use serde_json::Value;

/// Bucket for paths no route matches.
pub const DEFAULT_BUCKET: &str = "default";

pub struct Provider {
    pub id: &'static str,
    pub base_url: String,
    pub auth: Auth,
    pub timeout: Duration,
    /// JSON pointer to the cost the provider reports in its response body, if it reports one.
    pub cost_field: Option<&'static str>,
    /// First match wins.
    pub routes: Vec<Route>,
}

pub enum Auth {
    Bearer,
    Header(&'static str),
}

pub struct Route {
    pub method: Method,
    pub path_prefix: &'static str,
    /// Key into the account's `limits.rates`.
    pub bucket: &'static str,
    /// Key into the account's `limits.concurrency`.
    pub class: Option<&'static str>,
}

impl Route {
    pub fn new(
        method: Method,
        path_prefix: &'static str,
        bucket: &'static str,
        class: Option<&'static str>,
    ) -> Self {
        Self {
            method,
            path_prefix,
            bucket,
            class,
        }
    }
}

impl Provider {
    /// The bucket and concurrency class a call counts against.
    pub fn limits_for(&self, method: &Method, path: &str) -> (&'static str, Option<&'static str>) {
        self.routes
            .iter()
            .find(|r| r.method == method && path.starts_with(r.path_prefix))
            .map_or((DEFAULT_BUCKET, None), |r| (r.bucket, r.class))
    }

    pub fn authorize(&self, request: RequestBuilder, key: &str) -> RequestBuilder {
        match self.auth {
            Auth::Bearer => request.bearer_auth(key),
            Auth::Header(name) => request.header(name, key),
        }
    }

    pub fn reported_cost(&self, response: &[u8]) -> Option<u64> {
        let pointer = self.cost_field?;
        serde_json::from_slice::<Value>(response)
            .ok()?
            .pointer(pointer)?
            .as_u64()
    }
}

pub type Providers = HashMap<&'static str, Provider>;

pub fn all() -> Providers {
    [firecrawl::firecrawl()]
        .into_iter()
        .map(|p| (p.id, p))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider() -> Provider {
        Provider {
            id: "p",
            base_url: String::new(),
            auth: Auth::Bearer,
            timeout: Duration::from_secs(1),
            cost_field: Some("/usage/credits"),
            routes: vec![
                Route::new(Method::POST, "/v1/jobs", "jobs", Some("worker")),
                Route::new(Method::GET, "/v1/jobs/", "job_status", None),
            ],
        }
    }

    #[test]
    fn routes_match_method_and_path_prefix_with_a_default() {
        let p = provider();
        assert_eq!(
            p.limits_for(&Method::POST, "/v1/jobs"),
            ("jobs", Some("worker"))
        );
        assert_eq!(
            p.limits_for(&Method::GET, "/v1/jobs/42"),
            ("job_status", None)
        );
        assert_eq!(
            p.limits_for(&Method::GET, "/v1/other"),
            (DEFAULT_BUCKET, None)
        );
    }

    #[test]
    fn reported_cost_reads_the_configured_field() {
        let p = provider();
        assert_eq!(
            p.reported_cost(br#"{ "usage": { "credits": 7 } }"#),
            Some(7)
        );
        assert_eq!(p.reported_cost(b"{}"), None);
        assert_eq!(p.reported_cost(b"not json"), None);
    }
}
