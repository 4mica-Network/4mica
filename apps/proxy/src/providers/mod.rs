use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::http::{Method, StatusCode};
use reqwest::RequestBuilder;

pub struct Route {
    /// Key into the account's `limits.rates`.
    pub bucket: &'static str,
    /// Key into the account's `limits.concurrency`.
    pub class: Option<&'static str>,
    /// Worst-case cost in the provider's own units, reserved from quota before the call.
    pub cost: u64,
    pub timeout: Duration,
}

pub trait Provider: Send + Sync {
    fn id(&self) -> &'static str;

    fn base_url(&self) -> &str;

    /// `None` means the endpoint is not offered.
    fn route(&self, method: &Method, path: &str, body: &[u8]) -> Option<Route>;

    fn authorize(&self, request: RequestBuilder, key: &str) -> RequestBuilder {
        request.bearer_auth(key)
    }

    fn cost(&self, route: &Route, status: StatusCode, _body: &[u8]) -> u64 {
        if status.is_success() { route.cost } else { 0 }
    }
}

pub type Providers = HashMap<&'static str, Arc<dyn Provider>>;

pub fn all() -> Providers {
    let list: Vec<Arc<dyn Provider>> = vec![];
    list.into_iter().map(|p| (p.id(), p)).collect()
}
