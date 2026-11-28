use std::sync::{Arc, Mutex};

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::Request,
    http::StatusCode,
    response::Response,
};
use sdk_4mica::{
    AppClient, AppError, ApprovalStatus, AuthorizeSpend, ConsumeSpend, CreateApproval, Network,
    SpendAuthorizationStatus,
};
use serde_json::{Value, json};
use tokio::net::TcpListener;

const PAYER: &str = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const SELLER: &str = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

#[derive(Debug, Clone)]
struct Call {
    method: String,
    path: String,
    authorization: Option<String>,
    sdk: Option<String>,
    body: Option<Value>,
}

type Calls = Arc<Mutex<Vec<Call>>>;

fn authorization(status: &str) -> Value {
    json!({
        "id": "auth/1",
        "status": status,
        "deniedReason": null,
        "policyId": null,
        "approvalRequestId": null,
        "expiresAt": "2026-11-27T00:10:00.000Z",
        "amount": "0.01",
        "network": "BASE_SEPOLIA",
        "assetAddress": null,
    })
}

async fn serve(answer: fn(&str, &str) -> (StatusCode, String)) -> (String, Calls) {
    let calls: Calls = Arc::default();
    let recorded = calls.clone();
    let router = Router::new().fallback(move |request: Request| {
        let recorded = recorded.clone();
        async move {
            let method = request.method().to_string();
            let path = request.uri().path().to_string();
            let (parts, body) = request.into_parts();
            let header = |name: &str| {
                parts
                    .headers
                    .get(name)
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string)
            };
            let authorization = header("authorization");
            let sdk = header("x-4mica-sdk");
            let bytes = to_bytes(body, usize::MAX).await.unwrap();
            let body = (!bytes.is_empty()).then(|| serde_json::from_slice(&bytes).unwrap());
            let (status, text) = answer(&method, &path);
            recorded.lock().unwrap().push(Call {
                method,
                path,
                authorization,
                sdk,
                body,
            });
            Response::builder()
                .status(status)
                .body(Body::from(text))
                .unwrap()
        }
    });
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    (format!("http://{addr}"), calls)
}

fn client(base_url: &str) -> AppClient {
    AppClient::new(" 4mica_sk_test ")
        .unwrap()
        .with_base_url(base_url)
        .unwrap()
}

fn spend() -> AuthorizeSpend {
    AuthorizeSpend {
        network: Network::BaseSepolia,
        asset_address: None,
        amount: "0.01".into(),
        payer_address: PAYER.into(),
        recipient_address: SELLER.into(),
        req_id: None,
        agent_id: Some("agent_1".into()),
    }
}

#[tokio::test]
async fn authorizes_a_spend_in_the_apis_own_names() {
    let (url, calls) = serve(|_, _| (StatusCode::OK, authorization("RESERVED").to_string())).await;

    let granted = client(&url).authorize_spend(&spend()).await.unwrap();

    assert_eq!(granted.id, "auth/1");
    assert_eq!(granted.status, SpendAuthorizationStatus::Reserved);
    let calls = calls.lock().unwrap();
    assert_eq!(calls[0].method, "POST");
    assert_eq!(calls[0].path, "/v1/spend/authorize");
    assert_eq!(
        calls[0].authorization.as_deref(),
        Some("Bearer 4mica_sk_test")
    );
    assert!(
        calls[0]
            .sdk
            .as_deref()
            .unwrap()
            .starts_with("rust-sdk-4mica/")
    );
    assert_eq!(
        calls[0].body,
        Some(json!({
            "network": "BASE_SEPOLIA",
            "assetAddress": null,
            "amount": "0.01",
            "payerAddress": PAYER,
            "recipientAddress": SELLER,
            "agentId": "agent_1",
        }))
    );
}

#[tokio::test]
async fn polls_consumes_and_releases_by_an_escaped_id() {
    let (url, calls) = serve(|_, path| {
        let status = if path.ends_with("/consume") {
            "CONSUMED"
        } else if path.ends_with("/release") {
            "RELEASED"
        } else {
            "PENDING_APPROVAL"
        };
        (StatusCode::OK, authorization(status).to_string())
    })
    .await;
    let app = client(&format!("{url}/"));

    let polled = app.get_spend_authorization("auth/1").await.unwrap();
    let consumed = app
        .consume_spend_authorization(
            "auth/1",
            &ConsumeSpend {
                req_id: Some("0x7".into()),
                tx_hash: None,
            },
        )
        .await
        .unwrap();
    let released = app.release_spend_authorization("auth/1").await.unwrap();

    assert_eq!(polled.status, SpendAuthorizationStatus::PendingApproval);
    assert_eq!(consumed.status, SpendAuthorizationStatus::Consumed);
    assert_eq!(released.status, SpendAuthorizationStatus::Released);
    let calls = calls.lock().unwrap();
    let seen: Vec<_> = calls
        .iter()
        .map(|call| (call.method.as_str(), call.path.as_str(), call.body.clone()))
        .collect();
    assert_eq!(
        seen,
        vec![
            ("GET", "/v1/spend/authorizations/auth%2F1", None),
            (
                "POST",
                "/v1/spend/authorizations/auth%2F1/consume",
                Some(json!({ "reqId": "0x7" })),
            ),
            (
                "POST",
                "/v1/spend/authorizations/auth%2F1/release",
                Some(json!({})),
            ),
        ]
    );
}

#[tokio::test]
async fn creates_and_reads_an_approval() {
    let (url, calls) = serve(|method, _| {
        let body = if method == "POST" {
            json!({ "id": "apr_1", "status": "PENDING", "expiresAt": "2026-11-28T00:00:00.000Z" })
        } else {
            json!({
                "id": "apr_1",
                "status": "APPROVED",
                "expiresAt": "2026-11-28T00:00:00.000Z",
                "decidedAt": "2026-11-27T01:00:00.000Z",
            })
        };
        (StatusCode::OK, body.to_string())
    })
    .await;
    let app = client(&url);

    let created = app
        .create_approval(&CreateApproval {
            customer_id: None,
            payer_address: PAYER.into(),
            network: Network::Base,
            asset_address: Some("0xusdc".into()),
            amount: "250".into(),
            resource: None,
            reason: Some("above the threshold".into()),
        })
        .await
        .unwrap();
    let state = app.get_approval(&created.id).await.unwrap();

    assert_eq!(created.status, ApprovalStatus::Pending);
    assert_eq!(state.status, ApprovalStatus::Approved);
    assert_eq!(
        state.decided_at.as_deref(),
        Some("2026-11-27T01:00:00.000Z")
    );
    let calls = calls.lock().unwrap();
    assert_eq!(calls[0].path, "/v1/approvals");
    assert_eq!(
        calls[0].body,
        Some(json!({
            "payerAddress": PAYER,
            "network": "BASE",
            "assetAddress": "0xusdc",
            "amount": "250",
            "reason": "above the threshold",
        }))
    );
    assert_eq!(calls[1].path, "/v1/approvals/apr_1");
}

#[tokio::test]
async fn reads_an_unknown_status_without_failing() {
    let (url, _) = serve(|_, _| (StatusCode::OK, authorization("SOMETHING_NEW").to_string())).await;

    let polled = client(&url).get_spend_authorization("a").await.unwrap();

    assert_eq!(polled.status, SpendAuthorizationStatus::Unknown);
}

#[tokio::test]
async fn a_refusal_carries_the_apis_code_and_is_not_transient() {
    let (url, _) = serve(|_, _| {
        (
            StatusCode::FORBIDDEN,
            json!({ "error": "payer_not_owned", "message": "not your wallet" }).to_string(),
        )
    })
    .await;

    let error = client(&url).authorize_spend(&spend()).await.unwrap_err();

    assert_eq!(error.status(), Some(403));
    assert_eq!(error.code(), Some("payer_not_owned"));
    assert_eq!(error.to_string(), "not your wallet");
    assert!(!error.is_transient());
}

#[tokio::test]
async fn server_errors_and_rate_limits_are_transient() {
    let (url, _) = serve(|_, path| {
        if path.ends_with("/consume") {
            (StatusCode::SERVICE_UNAVAILABLE, String::new())
        } else {
            (StatusCode::TOO_MANY_REQUESTS, "{}".into())
        }
    })
    .await;
    let app = client(&url);

    let unavailable = app
        .consume_spend_authorization("a", &ConsumeSpend::default())
        .await
        .unwrap_err();
    let limited = app.release_spend_authorization("a").await.unwrap_err();

    assert!(unavailable.is_transient());
    assert!(
        unavailable
            .to_string()
            .contains("failed with 503 Service Unavailable")
    );
    assert!(limited.is_transient());
    assert_eq!(limited.code(), None);
}

#[tokio::test]
async fn an_answer_that_is_not_json_is_a_decode_error() {
    let (url, _) = serve(|_, _| (StatusCode::OK, "<html>".into())).await;

    let error = client(&url).get_approval("apr_1").await.unwrap_err();

    assert!(matches!(error, AppError::Decode { status: 200, .. }));
    assert!(!error.is_transient());
}

#[tokio::test]
async fn an_unreachable_api_is_a_transient_transport_error() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    drop(listener);

    let error = client(&format!("http://{addr}"))
        .release_spend_authorization("a")
        .await
        .unwrap_err();

    assert!(matches!(error, AppError::Transport { .. }));
    assert!(error.is_transient());
    assert_eq!(error.status(), None);
}

#[test]
fn an_api_key_and_a_base_url_are_required() {
    assert!(matches!(AppClient::new("  "), Err(AppError::Config(_))));
    assert!(matches!(
        AppClient::new("k").unwrap().with_base_url("not a url"),
        Err(AppError::Config(_))
    ));
    assert!(matches!(
        AppClient::new("k")
            .unwrap()
            .with_base_url("mailto:ops@example.com"),
        Err(AppError::Config(_))
    ));
}
