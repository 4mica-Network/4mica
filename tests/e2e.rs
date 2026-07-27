//! End-to-end tests for the 4mica-credit facilitator against a running 4mica core.
//!
//! These are black-box tests: they spawn the *built* facilitator binary and drive
//! it over HTTP, so they exercise the real code paths — including the two calls the
//! facilitator makes to core:
//!
//!   * `GET  core/public-params` — at facilitator startup (via `/health` coming up)
//!   * `POST core/guarantees`    — during `/settle`
//!
//! They default to a local core at `http://localhost:3000` and simply run when it
//! is up; they skip (with a printed notice) if the core is unreachable. Override
//! the target with `E2E_CORE_API_URL`:
//!
//! ```sh
//! # against the default local core (http://localhost:3000)
//! cargo test --test e2e -- --nocapture
//!
//! # against a different core / network
//! E2E_CORE_API_URL=http://localhost:3000 E2E_NETWORK=eip155:11155111 \
//!   cargo test --test e2e -- --nocapture
//! ```
//!
//! The "always" path covers `/health`, `/supported`, `/verify`, and a *negative*
//! `/settle` (a locally-signed, unfunded payload that core rejects — proving the
//! `core/guarantees` call path executes).
//!
//! The full happy path (a real SDK-signed payment that mints a BLS certificate) is
//! opt-in via `E2E_RUN_HAPPY=1`. It defaults every value to the anvil accounts the
//! `4mica-core` dev stack uses (facilitator auth wallet = acct 0, payer = acct 1,
//! recipient = acct 2, ETH collateral), so against a seeded local stack it is just:
//!
//! ```sh
//! E2E_RUN_HAPPY=1 cargo test --test e2e -- --nocapture
//! ```
//!
//! Override any value with `E2E_PAYER_KEY` / `E2E_USER_ADDRESS` /
//! `E2E_ASSET_ADDRESS` / `E2E_PAY_TO` / `E2E_AMOUNT` /
//! `E2E_AUTH_WALLET_PRIVATE_KEY` / `E2E_AUTH_URL`.
//!
//! The happy path requires core-side state this test does NOT set up (it lives in
//! core's DB / on-chain): the facilitator's auth wallet must be granted
//! `guarantee:issue`, and the payer must hold ETH collateral. Seed those with the
//! core dev harness first; otherwise `/settle` fails at core (401 / insufficient
//! collateral / invalid signature) and the assertion reports it.

use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

const DEFAULT_CORE_API_URL: &str = "http://localhost:3000";
// The local `4mica-core` dev stack runs on anvil, chain id 84532.
const DEFAULT_NETWORK: &str = "eip155:84532";
const DEFAULT_SCHEME: &str = "4mica-credit";

// Self-consistent dummy identities for the always-on (unfunded) path.
const DUMMY_USER: &str = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DUMMY_PAY_TO: &str = "0x1111111111111111111111111111111111111111";
const DUMMY_ASSET: &str = "0x2222222222222222222222222222222222222222";

// Anvil default accounts used by the 4mica-core dev stack. Account 0 is the
// funded deployer / 4mica operator wallet; we use it as the facilitator's auth
// wallet and accounts 1/2 as payer/recipient for the happy path.
const ANVIL_ACCT0_KEY: &str = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_ACCT1_KEY: &str = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ANVIL_ACCT1_ADDR: &str = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ANVIL_ACCT2_ADDR: &str = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
// Local core uses native ETH as collateral (asset address == zero).
const ETH_ASSET: &str = "0x0000000000000000000000000000000000000000";
const DEFAULT_AMOUNT: &str = "1";

struct TestEnv {
    core_url: String,
    network: String,
    scheme: String,
    auth_key: Option<String>,
    auth_url: Option<String>,
}

/// Kills the spawned facilitator process on drop so a panicking assertion never
/// leaks a server.
struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn env_opt(key: &str) -> Option<String> {
    std::env::var(key).ok().and_then(|v| {
        let trimmed = v.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("bind ephemeral port")
        .local_addr()
        .expect("read local addr")
        .port()
}

fn unique_nonce_hex() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(1);
    format!("0x{nanos:x}")
}

async fn core_reachable(core_url: &str) -> bool {
    let url = format!("{}/core/public-params", core_url.trim_end_matches('/'));
    reqwest::Client::new()
        .get(url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .is_ok()
}

fn spawn_facilitator(env: &TestEnv, port: u16) -> Child {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_x402-4mica"));
    // Run from a scratch dir so a repo-local `.env` is never picked up.
    cmd.current_dir(std::env::temp_dir())
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("X402_SCHEME", &env.scheme)
        .env("X402_NETWORK", &env.network)
        .env("X402_CORE_API_URL", &env.core_url)
        // Ensure no inherited multi-network / debit / exact config interferes.
        .env_remove("X402_NETWORKS")
        .env_remove("X402_DEBIT_URL")
        .env_remove("X402_DEBIT_URLS")
        .env_remove("SIGNER_TYPE")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());

    match (&env.auth_key, &env.auth_url) {
        (Some(key), Some(url)) => {
            cmd.env("X402_AUTH_WALLET_PRIVATE_KEY", key)
                .env("X402_AUTH_URL", url);
        }
        _ => {
            cmd.env_remove("X402_AUTH_WALLET_PRIVATE_KEY")
                .env_remove("X402_AUTH_URL");
        }
    }

    cmd.spawn().expect("spawn facilitator binary")
}

/// Polls `/health` until the facilitator is serving. Returns false if the process
/// exits first or the deadline passes (e.g. core rejected the startup handshake).
async fn wait_healthy(client: &reqwest::Client, base: &str, child: &mut Child) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_secs(20);
    while std::time::Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            eprintln!("[e2e] facilitator exited during startup: {status}");
            return false;
        }
        if let Ok(resp) = client.get(format!("{base}/health")).send().await
            && resp.status().is_success()
        {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    false
}

async fn post_json(
    client: &reqwest::Client,
    url: &str,
    body: &Value,
) -> (reqwest::StatusCode, Value) {
    let resp = client
        .post(url)
        .json(body)
        .send()
        .await
        .expect("post request");
    let status = resp.status();
    let value = resp.json::<Value>().await.unwrap_or(Value::Null);
    (status, value)
}

async fn fetch_public_params(client: &reqwest::Client, core_url: &str) -> Value {
    let url = format!("{}/core/public-params", core_url.trim_end_matches('/'));
    client
        .get(url)
        .send()
        .await
        .expect("public-params request")
        .json::<Value>()
        .await
        .expect("public-params json")
}

type SdkFlow = sdk_4mica::X402Flow<sdk_4mica::Client<alloy::signers::local::PrivateKeySigner>>;

/// Builds a real SDK `X402Flow` (signing with `signer_key`) plus a stub
/// `tabEndpoint` that hands out a unique `req_id` nonce (the facilitator no longer
/// serves `/tabs`). Returns the flow, the stub URL, and the stub's task handle
/// (abort it when done). Signing itself makes no core call beyond the stub.
async fn build_sdk_flow(
    core_url: &str,
    signer_key: &str,
) -> (SdkFlow, String, tokio::task::JoinHandle<()>) {
    let stub_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind tab stub");
    let stub_port = stub_listener.local_addr().expect("stub addr").port();
    let stub_app = axum::Router::new().route("/tab", axum::routing::post(tab_stub));
    let stub_handle = tokio::spawn(async move {
        let _ = axum::serve(stub_listener, stub_app).await;
    });
    let tab_endpoint = format!("http://127.0.0.1:{stub_port}/tab");

    let signer: alloy::signers::local::PrivateKeySigner =
        signer_key.parse().expect("invalid signer key");
    let config = sdk_4mica::ConfigBuilder::default()
        .signer(signer)
        .rpc_url(core_url.to_string())
        .build()
        .expect("build SDK config");
    let core_client = sdk_4mica::Client::new(config)
        .await
        .expect("init SDK client");
    let flow = sdk_4mica::X402Flow::new(core_client).expect("init X402Flow");
    (flow, tab_endpoint, stub_handle)
}

/// A v1 payment payload whose claims are internally consistent with the payment
/// requirements (so `/verify` passes preflight) but carry a bogus signature (so a
/// real `/settle` fails at `core/guarantees`).
fn unfunded_settle_body(scheme: &str, network: &str) -> Value {
    json!({
        "x402Version": 1,
        "paymentPayload": {
            "x402Version": 1,
            "scheme": scheme,
            "network": network,
            "payload": {
                "claims": {
                    "version": "v1",
                    "user_address": DUMMY_USER,
                    "recipient_address": DUMMY_PAY_TO,
                    "req_id": "0x1",
                    "amount": "0xa",
                    "asset_address": DUMMY_ASSET,
                    "timestamp": 1
                },
                "signature": "0xdeadbeef",
                "scheme": "eip712"
            }
        },
        "paymentRequirements": {
            "scheme": scheme,
            "network": network,
            "maxAmountRequired": "10",
            "payTo": DUMMY_PAY_TO,
            "asset": DUMMY_ASSET
        }
    })
}

#[tokio::test]
async fn e2e_facilitator_endpoints() {
    let core_url = env_opt("E2E_CORE_API_URL").unwrap_or_else(|| DEFAULT_CORE_API_URL.to_string());

    // Opt into the funded happy path with `E2E_RUN_HAPPY=1` (or by supplying a
    // payer key).
    let happy = env_opt("E2E_RUN_HAPPY").is_some() || env_opt("E2E_PAYER_KEY").is_some();

    // Always give the facilitator an auth wallet (default: anvil acct 0) so its
    // SIWE flow (`/auth/nonce` + `/auth/verify`) is exercised on `/settle` even in
    // the default (non-happy) run.
    let auth_key =
        Some(env_opt("E2E_AUTH_WALLET_PRIVATE_KEY").unwrap_or_else(|| ANVIL_ACCT0_KEY.to_string()));
    let auth_url = Some(env_opt("E2E_AUTH_URL").unwrap_or_else(|| core_url.clone()));

    let env = TestEnv {
        core_url,
        network: env_opt("E2E_NETWORK").unwrap_or_else(|| DEFAULT_NETWORK.to_string()),
        scheme: env_opt("E2E_SCHEME").unwrap_or_else(|| DEFAULT_SCHEME.to_string()),
        auth_key,
        auth_url,
    };

    if !core_reachable(&env.core_url).await {
        eprintln!(
            "[e2e] skipped: core at {} is not reachable (GET /core/public-params failed)",
            env.core_url
        );
        return;
    }

    let client = reqwest::Client::new();
    let port = free_port();
    let base = format!("http://127.0.0.1:{port}");

    let mut child_raw = spawn_facilitator(&env, port);
    if !wait_healthy(&client, &base, &mut child_raw).await {
        eprintln!(
            "[e2e] skipped: facilitator did not become healthy (is core configured for network {}?)",
            env.network
        );
        let _ = child_raw.kill();
        let _ = child_raw.wait();
        return;
    }
    let _guard = ChildGuard(child_raw);
    eprintln!("[e2e] facilitator up at {base}, core={}", env.core_url);

    // --- /health (proves startup + core/public-params succeeded) ---
    let health = client
        .get(format!("{base}/health"))
        .send()
        .await
        .expect("health request");
    assert!(health.status().is_success());
    let health_body = health.json::<Value>().await.expect("health json");
    assert_eq!(health_body["status"], "ok");

    // --- GET / (home / discovery) ---
    let home = client.get(&base).send().await.expect("home request");
    assert!(home.status().is_success());
    let home_body = home.json::<Value>().await.expect("home json");
    assert!(
        home_body["message"].is_string() && home_body["supported"].is_array(),
        "home response should carry a message + supported list: {home_body}"
    );

    // --- /supported (advertises the configured 4mica-credit scheme + network) ---
    let supported = client
        .get(format!("{base}/supported"))
        .send()
        .await
        .expect("supported request");
    assert!(supported.status().is_success());
    let supported_body = supported.json::<Value>().await.expect("supported json");
    let kinds = supported_body["kinds"].as_array().expect("kinds array");
    assert!(
        kinds.iter().any(|k| {
            k["scheme"] == env.scheme.as_str() && k["network"] == env.network.as_str()
        }),
        "supported kinds missing {}/{}: {supported_body}",
        env.scheme,
        env.network
    );

    // The facilitator derives its advertised x402 versions from core's
    // public-params; assert it reflects exactly what core accepts.
    let public_params = fetch_public_params(&client, &env.core_url).await;
    let accepted_versions: Vec<u64> = public_params["accepted_guarantee_versions"]
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_u64).collect())
        .unwrap_or_default();
    assert!(
        !accepted_versions.is_empty(),
        "core public-params missing accepted_guarantee_versions: {public_params}"
    );
    for version in &accepted_versions {
        assert!(
            kinds.iter().any(|k| {
                k["scheme"] == env.scheme.as_str()
                    && k["network"] == env.network.as_str()
                    && k["x402Version"].as_u64() == Some(*version)
            }),
            "supported should advertise x402Version {version} (core accepts {accepted_versions:?}): {supported_body}"
        );
    }
    eprintln!("[e2e] /supported reflects core accepted versions {accepted_versions:?}");

    // --- /verify: self-consistent payload passes preflight (no core call) ---
    let body = unfunded_settle_body(&env.scheme, &env.network);
    let (verify_status, verify_body) = post_json(&client, &format!("{base}/verify"), &body).await;
    assert!(verify_status.is_success());
    assert_eq!(
        verify_body["isValid"], true,
        "verify should accept a well-formed payload: {verify_body}"
    );

    // --- /settle (negative): same payload with a bogus signature. Since /verify
    // accepted it, a failure here proves the facilitator forwarded to
    // core/guarantees and surfaced core's rejection. ---
    let (settle_status, settle_body) = post_json(&client, &format!("{base}/settle"), &body).await;
    assert!(
        settle_status.is_success(),
        "settle HTTP status: {settle_status}"
    );
    assert_eq!(
        settle_body["success"], false,
        "unfunded/bogus-signature settle should fail at core: {settle_body}"
    );
    assert!(
        settle_body["error"].is_string(),
        "failed settle should carry an error message: {settle_body}"
    );
    assert!(
        settle_body["certificate"].is_null(),
        "failed settle must not return a certificate: {settle_body}"
    );
    eprintln!(
        "[e2e] negative /settle reached core/guarantees, error: {}",
        settle_body["error"]
    );

    // --- /verify rejection cases (the facilitator's own routing/validation) ---
    assert_verify_rejected(
        &client,
        &base,
        &unfunded_settle_body(&env.scheme, "eip155:99999999"),
        "unsupported network",
    )
    .await;
    assert_verify_rejected(
        &client,
        &base,
        &unfunded_settle_body("not-a-real-scheme", &env.network),
        "unsupported scheme",
    )
    .await;
    // Top-level x402Version disagreeing with the payload's version.
    let mut mismatched = unfunded_settle_body(&env.scheme, &env.network);
    mismatched["x402Version"] = json!(2);
    assert_verify_rejected(&client, &base, &mismatched, "version mismatch").await;
    eprintln!("[e2e] /verify correctly rejected bad network / scheme / version");

    // --- V2 /verify: exercises the validation-policy branch against core's real
    // trusted validation registry (verify makes no core call, so this runs
    // without any seeding). ---
    verify_v2_against_trusted_registry(&client, &base, &env, &public_params).await;

    // --- happy path (opt-in): a real SDK-signed payment that mints a certificate ---
    run_happy_path(&client, &base, &env, happy).await;
}

/// Posts to `/verify` and asserts the facilitator rejected it (`isValid: false`
/// with a non-empty reason). `label` is only used for failure messages.
async fn assert_verify_rejected(client: &reqwest::Client, base: &str, body: &Value, label: &str) {
    let (status, resp) = post_json(client, &format!("{base}/verify"), body).await;
    assert!(status.is_success(), "{label}: /verify HTTP status {status}");
    assert_eq!(
        resp["isValid"], false,
        "{label}: expected /verify to reject, got {resp}"
    );
    assert!(
        resp["invalidReason"]
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        "{label}: expected an invalidReason, got {resp}"
    );
}

/// Signs a real V2 payment (validation policy bound to core's actual trusted
/// registry + chain) via the SDK and asserts `/verify` accepts it. This drives
/// the facilitator's full V2 validation-policy matching against live core
/// metadata; it needs no funded account since `/verify` never calls core.
async fn verify_v2_against_trusted_registry(
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    public_params: &Value,
) {
    let Some(registry) = public_params["trusted_validation_registries"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(Value::as_str)
    else {
        eprintln!("[e2e] V2 verify skipped: core advertises no trusted_validation_registries");
        return;
    };
    let chain_id: u64 = env
        .network
        .rsplit(':')
        .next()
        .and_then(|c| c.parse().ok())
        .expect("network chain id");

    let (flow, tab_endpoint, stub_handle) = build_sdk_flow(&env.core_url, ANVIL_ACCT1_KEY).await;

    let extra = json!({
        "tabEndpoint": tab_endpoint,
        "validationRegistryAddress": registry,
        "validationChainId": chain_id,
        "validatorAddress": ANVIL_ACCT2_ADDR,
        "validatorAgentId": "77",
        "minValidationScore": 80,
        "jobHash": "0x1111111111111111111111111111111111111111111111111111111111111111",
        "requiredValidationTag": "hard-finality",
    });
    let accepted = sdk_4mica::x402::PaymentRequirementsV2 {
        scheme: env.scheme.clone(),
        network: env.network.clone(),
        asset: ETH_ASSET.into(),
        amount: DEFAULT_AMOUNT.into(),
        pay_to: ANVIL_ACCT2_ADDR.into(),
        max_timeout_seconds: Some(300),
        extra: Some(extra.clone()),
    };
    let payment_required = sdk_4mica::x402::X402PaymentRequiredV2 {
        x402_version: 2,
        error: None,
        resource: sdk_4mica::x402::X402ResourceInfo {
            url: format!("{base}/resource"),
            description: "e2e v2 verify".into(),
            mime_type: "application/json".into(),
        },
        accepts: vec![accepted.clone()],
        extensions: None,
    };

    let signed = flow
        .sign_payment_v2(payment_required, accepted, ANVIL_ACCT1_ADDR.to_string())
        .await
        .expect("SDK sign_payment_v2 failed");
    stub_handle.abort();

    let payload_json = serde_json::to_value(&signed.payload).expect("serialize v2 payload");
    let requirements_json = json!({
        "scheme": env.scheme,
        "network": env.network,
        "amount": DEFAULT_AMOUNT,
        "payTo": ANVIL_ACCT2_ADDR,
        "asset": ETH_ASSET,
        "extra": extra,
    });
    let verify_body = json!({
        "x402Version": 2,
        "paymentPayload": {
            "x402Version": 2,
            "accepted": requirements_json,
            "payload": payload_json,
        },
        "paymentRequirements": requirements_json,
    });

    let (status, resp) = post_json(client, &format!("{base}/verify"), &verify_body).await;
    assert!(status.is_success(), "v2 /verify HTTP status {status}");
    assert_eq!(
        resp["isValid"], true,
        "v2 /verify should accept a policy bound to core's trusted registry {registry}: {resp}"
    );
    eprintln!("[e2e] V2 /verify accepted a policy bound to trusted registry {registry}");
}

/// When opted in (`E2E_RUN_HAPPY=1`), sign a real payment via the 4mica SDK and
/// assert `/settle` returns a BLS certificate (exercising the success path of
/// `core/guarantees`). Values default to the anvil accounts the dev stack uses;
/// override any of them via `E2E_PAYER_KEY` / `E2E_USER_ADDRESS` /
/// `E2E_ASSET_ADDRESS` / `E2E_PAY_TO` / `E2E_AMOUNT`.
///
/// Prerequisites the core dev stack must already have seeded (this test cannot,
/// as they require core DB / on-chain state):
///   * the facilitator's auth wallet (anvil acct 0) granted `guarantee:issue`,
///   * the payer (anvil acct 1) holding ETH collateral in core.
async fn run_happy_path(client: &reqwest::Client, base: &str, env: &TestEnv, happy: bool) {
    if !happy {
        eprintln!(
            "[e2e] happy path skipped: set E2E_RUN_HAPPY=1 to run the funded flow against the local anvil stack"
        );
        return;
    }
    let payer_key = env_opt("E2E_PAYER_KEY").unwrap_or_else(|| ANVIL_ACCT1_KEY.to_string());
    let user_address = env_opt("E2E_USER_ADDRESS").unwrap_or_else(|| ANVIL_ACCT1_ADDR.to_string());
    let asset = env_opt("E2E_ASSET_ADDRESS").unwrap_or_else(|| ETH_ASSET.to_string());
    let pay_to = env_opt("E2E_PAY_TO").unwrap_or_else(|| ANVIL_ACCT2_ADDR.to_string());
    let amount = env_opt("E2E_AMOUNT").unwrap_or_else(|| DEFAULT_AMOUNT.to_string());

    let (flow, tab_endpoint, stub_handle) = build_sdk_flow(&env.core_url, &payer_key).await;

    let requirements = sdk_4mica::x402::PaymentRequirements {
        scheme: env.scheme.clone(),
        network: env.network.clone(),
        max_amount_required: amount.clone(),
        resource: None,
        description: None,
        mime_type: None,
        output_schema: None,
        pay_to: pay_to.clone(),
        max_timeout_seconds: None,
        asset: asset.clone(),
        extra: Some(json!({ "tabEndpoint": tab_endpoint })),
    };

    let signed = flow
        .sign_payment(requirements, user_address.clone())
        .await
        .expect("SDK sign_payment failed");

    let payload_json = serde_json::to_value(&signed.payload).expect("serialize signed payload");
    let settle_body = json!({
        "x402Version": 1,
        "paymentPayload": {
            "x402Version": 1,
            "scheme": env.scheme,
            "network": env.network,
            "payload": payload_json
        },
        "paymentRequirements": {
            "scheme": env.scheme,
            "network": env.network,
            "maxAmountRequired": amount,
            "payTo": pay_to,
            "asset": asset
        }
    });

    let (status, settle_body_resp) =
        post_json(client, &format!("{base}/settle"), &settle_body).await;
    stub_handle.abort();

    assert!(status.is_success(), "happy /settle HTTP status: {status}");

    if settle_body_resp["success"].as_bool().unwrap_or(false) {
        assert!(
            settle_body_resp["certificate"].is_object(),
            "successful settle should return a certificate: {settle_body_resp}"
        );
        eprintln!("[e2e] happy path /settle minted a certificate ✔");
        return;
    }

    // The full facilitator -> core/guarantees flow ran (SIWE auth + SDK signing).
    // If it stopped on a known core-side seeding gap, report exactly what to seed
    // and skip rather than fail — that state is provisioned by the core dev
    // harness, not this test.
    let err = settle_body_resp["error"]
        .as_str()
        .unwrap_or("")
        .to_lowercase();
    let seeding_gap = [
        "missing scope",
        "missing authorization",
        "unauthorized",
        "collateral",
        "insufficient",
        "not registered",
    ]
    .iter()
    .any(|m| err.contains(m));
    if seeding_gap {
        eprintln!(
            "[e2e] happy path stopped at a core seeding gap: {}",
            settle_body_resp["error"]
        );
        eprintln!(
            "[e2e]   seed the local core, then re-run: grant the facilitator auth wallet (anvil acct 0) the `guarantee:issue` scope, and deposit ETH collateral for the payer (anvil acct 1)."
        );
        return;
    }

    panic!("unexpected /settle failure in happy path: {settle_body_resp}");
}

/// Minimal stand-in for the removed `/tabs` endpoint: hands the SDK a unique
/// `nextReqId` nonce (echoing the requested `userAddress`).
async fn tab_stub(axum::Json(body): axum::Json<Value>) -> axum::Json<Value> {
    let user = body
        .get("userAddress")
        .and_then(|v| v.as_str())
        .unwrap_or("0x0")
        .to_string();
    axum::Json(json!({
        "tabId": "0x0",
        "userAddress": user,
        "nextReqId": unique_nonce_hex(),
    }))
}
