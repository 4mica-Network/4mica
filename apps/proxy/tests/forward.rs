use std::time::Duration;

use axum::Json;
use axum::http::header::RETRY_AFTER;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::routing::post;
use sea_orm::ActiveValue::Set;
use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Database, EntityTrait, QueryFilter, QueryOrder, QuerySelect,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;

use entities::account::{Limits, Rate};
use entities::invocation::InvocationStatus;
use entities::{account, credential, invocation, seller};
use migration::{Migrator, MigratorTrait};
use proxy_4mica::capacity::Capacity;
use proxy_4mica::providers::{Auth, Provider, Route};
use proxy_4mica::{App, router};

fn fake(base_url: String) -> Provider {
    Provider {
        id: "fake",
        base_url,
        auth: Auth::Bearer,
        timeout: Duration::from_secs(5),
        cost_field: Some("/creditsUsed"),
        routes: vec![Route::new(Method::POST, "/v1/", "echo", Some("slot"))],
    }
}

async fn serve(router: axum::Router) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    url
}

#[tokio::test]
#[ignore = "needs Postgres and Valkey: set TEST_DATABASE_URL and TEST_VALKEY_URL"]
async fn forwards_and_enforces_capacity() {
    let db = Database::connect(std::env::var("TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    Migrator::up(&db, None).await.unwrap();
    let capacity = Capacity::connect(&std::env::var("TEST_VALKEY_URL").unwrap())
        .await
        .unwrap();

    let upstream = serve(
        axum::Router::new()
            .route(
                "/v1/echo",
                post(|headers: HeaderMap, body: String| async move {
                    Json(
                        json!({ "auth": headers["authorization"].to_str().unwrap(), "body": body, "creditsUsed": 1 }),
                    )
                }),
            )
            .route(
                "/v1/busy",
                post(|| async {
                    (
                        StatusCode::TOO_MANY_REQUESTS,
                        [(RETRY_AFTER, "30")],
                        "slow down",
                    )
                }),
            ),
    )
    .await;

    let run = chrono::Utc::now().timestamp_micros().to_string();
    let token = format!("token-{run}");
    seller::ActiveModel {
        name: Set(format!("seller-{run}")),
        token_hash: Set(hex::encode(Sha256::digest(token.as_bytes()))),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();
    account::Entity::update_many()
        .col_expr(account::Column::Enabled, Expr::value(false))
        .filter(account::Column::Provider.eq("fake"))
        .exec(&db)
        .await
        .unwrap();
    let account = account::ActiveModel {
        provider: Set("fake".into()),
        name: Set(format!("account-{run}")),
        limits: Set(Limits {
            rates: [(
                "echo".into(),
                Rate {
                    max: 3,
                    per_secs: 60,
                },
            )]
            .into(),
            concurrency: [("slot".into(), 5)].into(),
            monthly_quota: Some(100),
        }),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap()
    .id;
    credential::ActiveModel {
        account_id: Set(account),
        key_env: Set("PROXY_TEST_KEY".into()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();
    // SAFETY: set before the proxy starts; no other thread reads the environment yet.
    unsafe { std::env::set_var("PROXY_TEST_KEY", "secret") };

    let proxy = serve(router(App {
        db: db.clone(),
        capacity: capacity.clone(),
        providers: [("fake", fake(upstream))].into(),
        http: reqwest::Client::new(),
        payer_rate_per_minute: 60,
    }))
    .await;

    let http = reqwest::Client::new();
    let call = |path: &str, id: &str| {
        http.post(format!("{proxy}/fake{path}"))
            .bearer_auth(&token)
            .header("x-invocation-id", format!("{id}-{run}"))
            .header("x-payer", format!("payer-{run}"))
            .header("x-max-cost", "2")
            .body("hello")
            .send()
    };

    let unauthenticated = http
        .post(format!("{proxy}/fake/v1/echo"))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

    let ok = call("/v1/echo", "a").await.unwrap();
    assert_eq!(ok.status(), StatusCode::OK);
    assert_eq!(ok.headers()["x-proxy-cost"], "1");
    assert!(ok.headers().contains_key("x-proxy-credential"));
    assert_eq!(
        serde_json::from_str::<Value>(&ok.text().await.unwrap()).unwrap(),
        json!({ "auth": "Bearer secret", "body": "hello", "creditsUsed": 1 })
    );

    let uncapped = http
        .post(format!("{proxy}/fake/v1/echo"))
        .bearer_auth(&token)
        .header("x-invocation-id", format!("u-{run}"))
        .header("x-payer", format!("payer-{run}"))
        .send()
        .await
        .unwrap();
    assert_eq!(uncapped.status(), StatusCode::BAD_REQUEST);

    assert_eq!(
        call("/v1/echo", "a").await.unwrap().status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        call("/v1/nope", "x").await.unwrap().status(),
        StatusCode::NOT_FOUND
    );

    let busy = call("/v1/busy", "b").await.unwrap();
    assert_eq!(busy.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(busy.headers()["x-proxy-cost"], "0");
    assert_eq!(busy.text().await.unwrap(), "slow down");

    let cooling = call("/v1/echo", "c").await.unwrap();
    assert_eq!(cooling.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(!cooling.headers().contains_key("x-proxy-cost"));
    assert_eq!(
        serde_json::from_str::<Value>(&cooling.text().await.unwrap()).unwrap()["code"],
        "capacity_exhausted"
    );

    let statuses: Vec<(InvocationStatus, Option<i64>)> = invocation::Entity::find()
        .select_only()
        .columns([invocation::Column::Status, invocation::Column::Cost])
        .filter(invocation::Column::Id.is_in(["a", "b", "c"].map(|id| format!("{id}-{run}"))))
        .order_by_asc(invocation::Column::Id)
        .into_tuple()
        .all(&db)
        .await
        .unwrap();
    assert_eq!(
        statuses,
        vec![
            (InvocationStatus::Succeeded, Some(1)),
            (InvocationStatus::Rejected, Some(0)),
            (InvocationStatus::Rejected, None)
        ]
    );

    let quota_key = format!(
        "proxy:quota:{account}:{}",
        chrono::Utc::now().format("%Y-%m")
    );
    let mut conn = redis::Client::open(std::env::var("TEST_VALKEY_URL").unwrap())
        .unwrap()
        .get_multiplexed_async_connection()
        .await
        .unwrap();
    let used: u64 = redis::cmd("GET")
        .arg(quota_key)
        .query_async(&mut conn)
        .await
        .unwrap();
    assert_eq!(used, 1);
}
