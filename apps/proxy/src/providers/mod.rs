mod firecrawl;

use std::collections::HashMap;
use std::time::Duration;

use axum::http::Method;
use reqwest::RequestBuilder;
use serde_json::Value;

/// Bucket for paths no route matches.
pub const DEFAULT_BUCKET: &str = "default";

static DEFAULT_ROUTE: Route = Route {
    method: Method::GET,
    path_prefix: "",
    bucket: DEFAULT_BUCKET,
    class: None,
    cost_field: None,
    job: None,
};

pub struct Provider {
    pub id: &'static str,
    pub base_url: String,
    pub auth: Auth,
    pub timeout: Duration,
    /// JSON pointer to the cost the provider reports in its response body, if it reports one.
    /// Routes can override it.
    pub cost_field: Option<&'static str>,
    pub jobs: Option<Jobs>,
    /// First match wins.
    pub routes: Vec<Route>,
}

/// Where a provider's async jobs report their id and state.
pub struct Jobs {
    /// JSON pointer to the new job's id in the response that starts it.
    pub id_field: &'static str,
    /// JSON pointer to the job's state in a follow-up response.
    pub state_field: &'static str,
    /// States after which the job's cost stops changing.
    pub final_states: &'static [&'static str],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum JobRole {
    Start,
    /// Status, cancel, etc. The path segment after the prefix is the job id, and the reported cost
    /// is the job's running total rather than this call's.
    Follow,
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
    /// Overrides the provider's `cost_field`; `Some(None)` means this route reports no cost.
    pub cost_field: Option<Option<&'static str>>,
    pub job: Option<JobRole>,
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
            cost_field: None,
            job: None,
        }
    }

    pub fn starts_job(mut self) -> Self {
        self.job = Some(JobRole::Start);
        self
    }

    pub fn follows_job(mut self) -> Self {
        self.job = Some(JobRole::Follow);
        self
    }

    /// The job id in a follow-up call's path.
    pub fn job_id<'a>(&self, path: &'a str) -> Option<&'a str> {
        path.strip_prefix(self.path_prefix)?
            .split('/')
            .next()
            .filter(|id| !id.is_empty())
    }

    pub fn cost_field(mut self, pointer: Option<&'static str>) -> Self {
        self.cost_field = Some(pointer);
        self
    }
}

impl Provider {
    /// The route a call matches, or a default one with no limits beyond `DEFAULT_BUCKET`.
    pub fn route_for(&self, method: &Method, path: &str) -> &Route {
        self.routes
            .iter()
            .find(|r| r.method == method && path.starts_with(r.path_prefix))
            .unwrap_or(&DEFAULT_ROUTE)
    }

    pub fn authorize(&self, request: RequestBuilder, key: &str) -> RequestBuilder {
        match self.auth {
            Auth::Bearer => request.bearer_auth(key),
            Auth::Header(name) => request.header(name, key),
        }
    }

    pub fn reported_cost(&self, route: &Route, response: &[u8]) -> Option<u64> {
        let pointer = route.cost_field.unwrap_or(self.cost_field)?;
        serde_json::from_slice::<Value>(response)
            .ok()?
            .pointer(pointer)?
            .as_u64()
    }

    pub fn started_job_id(&self, response: &[u8]) -> Option<String> {
        let pointer = self.jobs.as_ref()?.id_field;
        let body: Value = serde_json::from_slice(response).ok()?;
        Some(body.pointer(pointer)?.as_str()?.to_owned())
    }

    /// The job's final cost, once a follow-up response shows it in a final state and reports a cost.
    pub fn final_job_cost(&self, route: &Route, response: &[u8]) -> Option<u64> {
        let jobs = self.jobs.as_ref()?;
        let body: Value = serde_json::from_slice(response).ok()?;
        let state = body.pointer(jobs.state_field)?.as_str()?;
        if !jobs.final_states.contains(&state) {
            return None;
        }
        body.pointer(route.cost_field.unwrap_or(self.cost_field)?)?
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
            jobs: Some(Jobs {
                id_field: "/id",
                state_field: "/status",
                final_states: &["done"],
            }),
            routes: vec![
                Route::new(Method::POST, "/v1/jobs", "jobs", Some("worker")),
                Route::new(Method::GET, "/v1/jobs/", "job_status", None).cost_field(None),
                Route::new(Method::POST, "/v1/pages", "pages", None)
                    .cost_field(Some("/meta/credits")),
            ],
        }
    }

    #[test]
    fn routes_match_method_and_path_prefix_with_a_default() {
        let p = provider();
        let limits = |method, path| {
            let r = p.route_for(&method, path);
            (r.bucket, r.class)
        };
        assert_eq!(limits(Method::POST, "/v1/jobs"), ("jobs", Some("worker")));
        assert_eq!(limits(Method::GET, "/v1/jobs/42"), ("job_status", None));
        assert_eq!(limits(Method::GET, "/v1/other"), (DEFAULT_BUCKET, None));
    }

    #[test]
    fn reported_cost_reads_the_route_field_or_the_provider_default() {
        let p = provider();
        let cost = |method, path, body: &[u8]| p.reported_cost(p.route_for(&method, path), body);
        let both = br#"{ "usage": { "credits": 7 }, "meta": { "credits": 3 } }"#;
        assert_eq!(cost(Method::POST, "/v1/jobs", both), Some(7));
        assert_eq!(cost(Method::GET, "/v1/other", both), Some(7));
        assert_eq!(cost(Method::POST, "/v1/pages", both), Some(3));
        assert_eq!(cost(Method::GET, "/v1/jobs/42", both), None);
        assert_eq!(cost(Method::POST, "/v1/jobs", b"{}"), None);
        assert_eq!(cost(Method::POST, "/v1/jobs", b"not json"), None);
    }

    #[test]
    fn jobs_are_read_from_start_and_follow_up_responses() {
        let p = provider();
        let status = p.route_for(&Method::GET, "/v1/jobs/42");
        assert_eq!(status.job_id("/v1/jobs/42"), Some("42"));
        assert_eq!(status.job_id("/v1/jobs/42/errors"), Some("42"));
        assert_eq!(status.job_id("/v1/jobs/"), None);
        assert_eq!(p.started_job_id(br#"{ "id": "42" }"#), Some("42".into()));
        assert_eq!(p.started_job_id(br#"{ "id": 42 }"#), None);

        let follow = Route::new(Method::GET, "/v1/jobs/", "job_status", None).follows_job();
        let running = br#"{ "status": "running", "usage": { "credits": 3 } }"#;
        let done = br#"{ "status": "done", "usage": { "credits": 9 } }"#;
        assert_eq!(p.final_job_cost(&follow, running), None);
        assert_eq!(p.final_job_cost(&follow, done), Some(9));
        assert_eq!(p.final_job_cost(&follow, br#"{ "status": "done" }"#), None);
    }
}
