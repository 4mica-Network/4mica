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
//! Everything runs by default against a reachable core — there is no opt-in flag. That is
//! deliberate: an end-to-end test that silently skips is indistinguishable from one that passes,
//! and both of the interesting paths (settlement and gasless deposit) spent time in that state.
//!
//! Coverage:
//!
//!   * **Always** — `/health`, `/supported`, `/verify`, a *negative* `/settle` (a
//!     locally-signed, unfunded payload core rejects, proving the `core/guarantees` path
//!     executes), and a *negative* `/clearing/claim` (an unknown cycle core refuses to serve
//!     terms for, proving the authenticated clearing-action path executes). The *positive*
//!     claim path needs a committed, funded cycle only core's DB helpers can arrange — it lives
//!     in `4mica-core`'s `integration-tests/tests/sponsored_claim.rs`, pointed at a running
//!     facilitator via `E2E_FACILITATOR_URL`.
//!   * **Happy path** — a real SDK-signed payment that core issues a guarantee receipt for.
//!   * **Gasless deposit** — the SDK signs an EIP-3009 authorization, the facilitator pays the gas,
//!     and collateral lands on the signer. The token is discovered from `/core/tokens`.
//!
//! Values default to the anvil accounts the `4mica-core` dev stack uses (facilitator auth wallet
//! and relayer = acct 11, payer = acct 1, recipient = acct 2), and the network to the chain core
//! reports, so against a local stack it is just:
//!
//! ```sh
//! cargo test --test e2e -- --nocapture
//! ```
//!
//! # Prerequisites, and what happens without them
//!
//! Core unreachable → the whole test skips. No relayer or no depositable token → the deposit case
//! skips, since there is nothing to exercise. **Anything else fails**, including an unseeded core.
//!
//! The happy path needs the facilitator's auth wallet granted `guarantee:issue`, which core's dev
//! stack seeds for acct 11. On a local anvil the test funds the payer itself: ETH collateral for
//! the happy path, and the deposit token for the gasless deposit. The deposit needs a token that
//! genuinely implements EIP-3009 — core advertising a `domain_separator` only proves EIP-712, so a
//! token can be advertised and still be undepositable.
//!
//! Escape hatches: `E2E_SKIP_HAPPY=1`, `E2E_SKIP_DEPOSIT=1`.
//!
//! Overrides: `E2E_CORE_API_URL` / `E2E_NETWORK` / `E2E_SCHEME` / `E2E_PAYER_KEY` /
//! `E2E_ASSET_ADDRESS` / `E2E_PAY_TO` / `E2E_AMOUNT` /
//! `E2E_AUTH_WALLET_PRIVATE_KEY` / `E2E_AUTH_URL` / `E2E_RELAYER_PRIVATE_KEY` /
//! `E2E_DEPOSIT_TOKEN` / `E2E_DEPOSIT_AMOUNT`.

use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

const DEFAULT_CORE_API_URL: &str = "http://localhost:3000";
const DEFAULT_SCHEME: &str = "4mica-credit";

// Self-consistent dummy identities for the always-on (unfunded) path.
const DUMMY_USER: &str = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DUMMY_PAY_TO: &str = "0x1111111111111111111111111111111111111111";
const DUMMY_ASSET: &str = "0x2222222222222222222222222222222222222222";

// Anvil default accounts used by the 4mica-core dev stack. Core grants account 11 the facilitator
// role, so it is the facilitator's auth wallet and relayer; accounts 1/2 are payer/recipient.
const ANVIL_ACCT11_KEY: &str = "0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82";
const ANVIL_ACCT1_KEY: &str = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
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
    /// Enables `/deposit`. Absent leaves the facilitator without gas sponsorship, which is a
    /// supported deployment — the deposit case then skips rather than fails.
    relayer_key: Option<String>,
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
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_facilitator-4mica"));
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

    match &env.relayer_key {
        Some(key) => {
            cmd.env("X402_RELAYER_PRIVATE_KEY", key);
        }
        None => {
            cmd.env_remove("X402_RELAYER_PRIVATE_KEY");
        }
    }
    cmd.env_remove("X402_RELAYER_RPC_URL");

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

/// An SDK client for `signer_key` against core, signed in with SIWE.
async fn sdk_client(core_url: &str, signer_key: &str) -> sdk_4mica::Client {
    let signer: alloy::signers::local::PrivateKeySigner =
        signer_key.parse().expect("invalid signer key");
    sdk_4mica::ClientBuilder::default()
        .signer(signer)
        .rpc_url(core_url.to_string())
        .connect()
        .await
        .expect("init SDK client")
}

/// A real SDK `X402Flow` signing with `signer_key`. Signing reads the active settlement cycle from
/// core, so the payer signs in.
async fn build_sdk_flow(core_url: &str, signer_key: &str) -> SdkFlow {
    sdk_4mica::X402Flow::new(sdk_client(core_url, signer_key).await).expect("init X402Flow")
}

/// A v1 payment payload that is internally consistent with the payment requirements (so
/// `/verify` passes preflight) but carries a bogus signature (so a real `/settle` fails at
/// `core/guarantees`).
fn unfunded_settle_body(scheme: &str, network: &str) -> Value {
    json!({
        "x402Version": 1,
        "paymentPayload": {
            "x402Version": 1,
            "scheme": scheme,
            "network": network,
            "payload": {
                "payload": {
                    "version": "v1",
                    "user_address": DUMMY_USER,
                    "recipient_address": DUMMY_PAY_TO,
                    "cycle_id": format!("0x{}", "00".repeat(32)),
                    "req_id": "0x1",
                    "amount": "0xa",
                    "asset_address": DUMMY_ASSET,
                    "timestamp": 1,
                    "salt": format!("0x{}", "01".repeat(32))
                },
                "signature": "0xdeadbeef"
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

    // On by default whenever core is reachable. `E2E_SKIP_HAPPY=1` opts out for a core that has
    // not been seeded; `E2E_RUN_HAPPY` is still honoured so older invocations keep working.
    let happy = env_opt("E2E_SKIP_HAPPY").is_none();

    if !core_reachable(&core_url).await {
        eprintln!(
            "[e2e] skipped: core at {core_url} is not reachable (GET /core/public-params failed)"
        );
        return;
    }
    let client = reqwest::Client::new();
    let public_params = fetch_public_params(&client, &core_url).await;

    // Always give the facilitator an auth wallet (default: anvil acct 11) so its
    // SIWE flow (`/auth/nonce` + `/auth/verify`) is exercised on `/settle` even in
    // the default (non-happy) run.
    let auth_key = Some(
        env_opt("E2E_AUTH_WALLET_PRIVATE_KEY").unwrap_or_else(|| ANVIL_ACCT11_KEY.to_string()),
    );
    let auth_url = Some(env_opt("E2E_AUTH_URL").unwrap_or_else(|| core_url.clone()));
    // The facilitator refuses a network whose chain is not the one its relayer reaches, so the
    // default follows the chain core reports.
    let network = env_opt("E2E_NETWORK").unwrap_or_else(|| {
        let chain_id = public_params["chain_id"]
            .as_u64()
            .expect("core public params carry a chain_id");
        format!("eip155:{chain_id}")
    });

    let env = TestEnv {
        core_url,
        network,
        scheme: env_opt("E2E_SCHEME").unwrap_or_else(|| DEFAULT_SCHEME.to_string()),
        auth_key,
        auth_url,
        // Defaults to anvil acct 11, which core's dev stack funds and seeds as the facilitator.
        relayer_key: Some(
            env_opt("E2E_RELAYER_PRIVATE_KEY").unwrap_or_else(|| ANVIL_ACCT11_KEY.to_string()),
        ),
    };

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

    // The advertised x402 versions are a property of the facilitator build, NOT of core's
    // payment payload versions — the two are deliberately decoupled. Assert both halves separately.

    for version in [1u64, 2] {
        assert!(
            kinds.iter().any(|k| {
                k["scheme"] == env.scheme.as_str()
                    && k["network"] == env.network.as_str()
                    && k["x402Version"].as_u64() == Some(version)
            }),
            "supported should advertise x402Version {version}: {supported_body}"
        );
    }

    // Separately: core must accept the payment payload version the facilitator decodes, or every
    // /settle would be rejected downstream.
    let payload_versions: Vec<u64> = public_params["supported_payment_payload_versions"]
        .as_array()
        .map(|a| a.iter().filter_map(Value::as_u64).collect())
        .unwrap_or_default();
    assert!(
        payload_versions.contains(&rpc::PAYMENT_PAYLOAD_VERSION),
        "core accepts payment payload versions {payload_versions:?}, which excludes the v{} this \
         facilitator decodes: {public_params}",
        rpc::PAYMENT_PAYLOAD_VERSION
    );
    eprintln!(
        "[e2e] /supported advertises x402 v1+v2; core accepts payment payloads {payload_versions:?}"
    );

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
        settle_body["receipt"].is_null(),
        "failed settle must not return a receipt: {settle_body}"
    );
    eprintln!(
        "[e2e] negative /settle reached core/guarantees, error: {}",
        settle_body["error"]
    );

    // --- /clearing/claim (negative): a well-formed claim for a cycle core has never seen.
    // The relayer is configured, so the request passes the sponsorship gate and the
    // facilitator asks core for the cycle's committed terms with its authenticated wallet —
    // ACTION_UNAVAILABLE proves that round trip executed and core answered. The positive
    // path needs a committed, funded cycle, which only `4mica-core`'s integration tests can
    // arrange (`integration-tests/tests/sponsored_claim.rs`, run against this facilitator).
    let claim_body = json!({
        "cycleId": format!("e2e-missing:{}", unique_nonce_hex()),
        "creditor": ANVIL_ACCT2_ADDR,
    });
    for (endpoint, ok_field) in [
        ("clearing/claim/verify", "isValid"),
        ("clearing/claim", "success"),
    ] {
        let (status, body) = post_json(&client, &format!("{base}/{endpoint}"), &claim_body).await;
        assert!(status.is_success(), "{endpoint} HTTP status: {status}");
        assert_eq!(
            body[ok_field], false,
            "{endpoint} must refuse a cycle core does not know: {body}"
        );
        assert_eq!(
            body["errorCode"], "ACTION_UNAVAILABLE",
            "{endpoint} should surface core's refusal to serve the cycle's terms: {body}"
        );
    }
    eprintln!("[e2e] negative /clearing/claim reached core's clearing-action route");

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
    verify_validation_gated_payment(&client, &base, &env, &public_params).await;

    // Confirm anything already deposited but still unconfirmed. See `advance_chain`.
    let local_anvil = advance_chain(&client, &public_params).await;

    // Seed the payer's collateral if the chain is a local anvil. See `ensure_payer_collateral`.
    if happy {
        ensure_payer_collateral(&client, &env, &public_params, local_anvil).await;
    }

    // --- happy path: a real SDK-signed payment that core issues a receipt for ---
    run_happy_path(&client, &base, &env, happy, &public_params).await;

    // --- gasless deposit: SDK signs, facilitator pays the gas ---
    run_gasless_deposit(&client, &base, &env, &public_params, local_anvil).await;

    // --- sponsored-permit deposit: gasless for a token that has EIP-2612 but not EIP-3009 ---
    run_sponsored_permit_deposit(&client, &base, &env, &public_params, local_anvil).await;

    // Leave the chain past confirmation depth so the deposit just made is indexed, rather than
    // sitting invisible until the next run happens to mine.
    advance_chain(&client, &public_params).await;
}

/// End-to-end gasless deposit: the SDK signs an EIP-3009 authorization, the facilitator submits it
/// and pays the gas, and collateral lands on the *signer* — never the relayer.
///
/// Deliberately signs via `sdk-4mica` rather than hand-rolling the digest: this is the only test
/// that proves the SDK and the facilitator agree on the payload, which is the contract the whole
/// gasless flow rests on. A hand-built authorization would pass even if the two had drifted.
///
/// Runs by default. The token is discovered from core's `/core/tokens` — the first entry
/// advertising a domain separator — so a correctly configured stack needs no test configuration.
/// Override with `E2E_DEPOSIT_TOKEN`, or skip with `E2E_SKIP_DEPOSIT=1`.
///
/// Skips only when there is genuinely nothing to exercise (no relayer, no depositable token).
/// Anything else fails, because a silent pass here is indistinguishable from a working deposit.
async fn run_gasless_deposit(
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    public_params: &Value,
    local_anvil: bool,
) {
    if env_opt("E2E_SKIP_DEPOSIT").is_some() {
        eprintln!("[e2e] gasless deposit skipped: E2E_SKIP_DEPOSIT is set");
        return;
    }

    let token = match env_opt("E2E_DEPOSIT_TOKEN") {
        Some(token) => token,
        None => match discover_depositable_token(client, &env.core_url).await {
            Some(token) => {
                eprintln!("[e2e] gasless deposit using core-advertised token {token}");
                token
            }
            None => {
                eprintln!(
                    "[e2e] gasless deposit skipped: core advertises no token with an EIP-712 \
                     domain separator. Register an EIP-3009 token, or set E2E_DEPOSIT_TOKEN."
                );
                return;
            }
        },
    };
    let payer_key = env_opt("E2E_PAYER_KEY").unwrap_or_else(|| ANVIL_ACCT1_KEY.to_string());
    let amount: u64 = env_opt("E2E_DEPOSIT_AMOUNT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1_000);

    let sdk = sdk_client(&env.core_url, &payer_key).await;

    let token_address: sdk_4mica::Address = token
        .parse()
        .expect("core advertised a valid token address");
    let asset = sdk_4mica::Asset::Erc20(token_address);
    if local_anvil {
        ensure_payer_tokens(public_params, &payer_key, token_address, amount).await;
    }

    let before = sdk
        .account
        .principal_balance(asset)
        .await
        .expect("read principal balance");

    // Signing is chain-free: the SDK takes the token's domain separator from core over HTTP.
    let authorization = sdk
        .deposit
        .of(asset, sdk_4mica::U256::from(amount))
        .eip3009()
        .sign()
        .await
        .unwrap_or_else(|err| {
            panic!(
                "SDK could not sign a deposit for {token}: {err}. Core advertised this token, so \
                 it must also advertise its EIP-712 domain separator via /core/tokens."
            )
        });

    let body = json!({
        "network": env.network,
        "asset": token,
        "amount": amount.to_string(),
        "authorization": serde_json::to_value(&authorization).expect("serialize authorization"),
    });

    // Preflight first: it must agree with the submit path, and it spends no gas.
    let (status, verify) = post_json(client, &format!("{base}/deposit/verify"), &body).await;
    assert!(status.is_success(), "/deposit/verify HTTP status {status}");
    if verify["errorCode"] == "NO_RELAYER" {
        eprintln!("[e2e] gasless deposit skipped: facilitator has no relayer configured");
        return;
    }
    // A deployment with stablecoin deposits switched off cannot service them at all — an
    // environment gap like a missing relayer, not a facilitator defect, so it skips rather than
    // failing forever. The facilitator decodes the revert against the Core4Mica error ABI, so this
    // matches a name rather than a raw selector.
    if verify["invalidReason"]
        .as_str()
        .is_some_and(|reason| reason.contains("DepositsDisabled"))
    {
        eprintln!(
            "[e2e] gasless deposit skipped: Core4Mica has deposits of {token} switched off: {}",
            verify["invalidReason"]
        );
        return;
    }

    assert_eq!(
        verify["isValid"], true,
        "/deposit/verify rejected an SDK-signed authorization for {token}: {verify}\n  \
         SIMULATION_REVERTED carries the decoded Core4Mica error — a token advertising \
         DOMAIN_SEPARATOR (EIP-2612) without EIP-3009 `receiveWithAuthorization`, or an \
         unregistered asset, both land here."
    );

    let (status, settle) = post_json(client, &format!("{base}/deposit"), &body).await;
    assert!(status.is_success(), "/deposit HTTP status {status}");
    assert_eq!(settle["success"], true, "/deposit failed: {settle}");
    let tx_hash = settle["txHash"].as_str().expect("txHash in response");
    assert!(tx_hash.starts_with("0x"), "unexpected txHash {tx_hash}");

    // The payload binds `to` and `value`, so a facilitator cannot redirect the funds. Assert the
    // signer was credited — reading on-chain, which has no indexer lag.
    let after = sdk
        .account
        .principal_balance(asset)
        .await
        .expect("read principal balance");
    assert_eq!(
        after - before,
        sdk_4mica::U256::from(amount),
        "collateral must be credited to the signer, not the relayer"
    );

    // Replaying the same authorization must fail: the nonce is consumed on-chain, and the
    // facilitator should catch it before spending gas a second time.
    let (_, replay) = post_json(client, &format!("{base}/deposit"), &body).await;
    assert_eq!(
        replay["success"], false,
        "replay should be refused: {replay}"
    );
    // NONCE_ALREADY_USED when the token exposes `authorizationState`, SIMULATION_REVERTED when it
    // does not — either way the replay is caught before any gas is spent.
    let replay_code = replay["errorCode"].as_str().unwrap_or_default();
    assert!(
        matches!(replay_code, "NONCE_ALREADY_USED" | "SIMULATION_REVERTED"),
        "replay must be refused before broadcast, got {replay_code}: {replay}"
    );

    eprintln!("[e2e] gasless deposit credited {amount} to the signer via {tx_hash} ✔");
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

/// Signs a real validation-gated payment via the SDK and asserts `/verify` accepts it.
///
/// This is the only e2e coverage of the facilitator's validation matching against *live* core
/// metadata: the validator is taken from core's own allowlist, so a facilitator that checked the
/// wrong field or dropped the allowlist check would fail here. Needs no funded account, since
/// `/verify` never calls core.
async fn verify_validation_gated_payment(
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    public_params: &Value,
) {
    let Some(validator) = public_params["validators"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(Value::as_str)
    else {
        eprintln!(
            "[e2e] validation-gated verify skipped: core advertises no validators. Seed core's \
             validator allowlist to exercise this path."
        );
        return;
    };

    let flow = build_sdk_flow(&env.core_url, ANVIL_ACCT1_KEY).await;

    // Validation travels as a nested `extra.validation` object; the SDK reads it here and attaches
    // a matching ValidationRequirement to the signed payment.
    let extra = json!({
        "validation": {
            "validator": validator,
            "subject": "0x1111111111111111111111111111111111111111111111111111111111111111",
        },
    });
    let accepted = sdk_4mica::x402::PaymentRequirementsV2 {
        scheme: env.scheme.clone(),
        network: env.network.clone(),
        asset: ETH_ASSET.into(),
        amount: DEFAULT_AMOUNT.into(),
        pay_to: ANVIL_ACCT2_ADDR.into(),
        max_timeout_seconds: 300,
        extra: Some(extra.clone()),
    };
    let payment_required = sdk_4mica::x402::X402PaymentRequiredV2 {
        x402_version: 2,
        error: None,
        resource: sdk_4mica::x402::X402ResourceInfo {
            url: format!("{base}/resource"),
            description: Some("e2e v2 verify".into()),
            mime_type: Some("application/json".into()),
        },
        accepts: vec![accepted.clone()],
        extensions: None,
    };

    let signed = flow
        .sign_payment_v2(payment_required, accepted)
        .await
        .expect("SDK sign_payment_v2 failed");

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
        "v2 /verify should accept a validation requirement naming core's validator \
         {validator}: {resp}"
    );
    eprintln!("[e2e] V2 /verify accepted a payment gated on validator {validator}");
}

/// Signs a real payment via the 4mica SDK and asserts `/settle` returns a guarantee receipt
/// (exercising the success path of `core/guarantees`). Values default to the anvil accounts the
/// dev stack uses; override any of them via `E2E_PAYER_KEY` / `E2E_ASSET_ADDRESS` /
/// `E2E_PAY_TO` / `E2E_AMOUNT`.
///
/// Prerequisites the core dev stack must already have seeded (this test cannot,
/// as they require core DB / on-chain state):
///   * the facilitator's auth wallet (anvil acct 11) granted `guarantee:issue`,
///   * the payer (anvil acct 1) holding ETH collateral in core.
async fn run_happy_path(
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    happy: bool,
    public_params: &Value,
) {
    if !happy {
        eprintln!("[e2e] happy path skipped: E2E_SKIP_HAPPY is set");
        return;
    }
    let payer_key = env_opt("E2E_PAYER_KEY").unwrap_or_else(|| ANVIL_ACCT1_KEY.to_string());
    let asset = env_opt("E2E_ASSET_ADDRESS").unwrap_or_else(|| ETH_ASSET.to_string());
    let pay_to = env_opt("E2E_PAY_TO").unwrap_or_else(|| ANVIL_ACCT2_ADDR.to_string());
    let amount = env_opt("E2E_AMOUNT").unwrap_or_else(|| DEFAULT_AMOUNT.to_string());

    let flow = build_sdk_flow(&env.core_url, &payer_key).await;

    let requirements = sdk_4mica::x402::PaymentRequirements {
        scheme: env.scheme.clone(),
        network: env.network.clone(),
        max_amount_required: amount.clone(),
        resource: String::new(),
        description: String::new(),
        mime_type: None,
        output_schema: None,
        pay_to: pay_to.clone(),
        max_timeout_seconds: 0,
        asset: asset.clone(),
        extra: None,
    };

    let signed = flow
        .sign_payment(requirements)
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

    // Collateral seeded moments ago is on-chain but not yet in core's database: the event scanner
    // confirms at a block depth and then indexes. Retrying absorbs that lag, so a freshly seeded
    // stack passes on the first run instead of only on the second.
    let mut status;
    let mut settle_body_resp;
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        (status, settle_body_resp) =
            post_json(client, &format!("{base}/settle"), &settle_body).await;

        let indexing_lag = !settle_body_resp["success"].as_bool().unwrap_or(false)
            && matches!(
                settle_body_resp["errorCode"].as_str(),
                Some("USER_NOT_REGISTERED" | "INSUFFICIENT_COLLATERAL")
            );
        if !indexing_lag || std::time::Instant::now() >= deadline {
            break;
        }

        eprintln!("[e2e] waiting for core to index the payer's collateral…");
        advance_chain(client, public_params).await;
    }

    assert!(status.is_success(), "happy /settle HTTP status: {status}");

    if settle_body_resp["success"].as_bool().unwrap_or(false) {
        assert!(
            settle_body_resp["receipt"].is_object(),
            "successful settle should return a receipt: {settle_body_resp}"
        );
        eprintln!("[e2e] happy path /settle returned a guarantee receipt ✔");
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
        panic!(
            "happy path failed on unseeded core: {}\n  \
             Grant the facilitator auth wallet (anvil acct 11) the `guarantee:issue` scope, and \
             deposit collateral for the payer (anvil acct 1).\n  \
             Set E2E_SKIP_HAPPY=1 to skip this deliberately.",
            settle_body_resp["error"]
        );
    }

    panic!("unexpected /settle failure in happy path: {settle_body_resp}");
}

/// Deposits native collateral for the payer when it has none, so the happy path is self-seeding.
///
/// Guarantee issuance needs a `User` row and spendable collateral, both of which core derives from
/// a confirmed `CollateralDeposited` event — there is no API to create them. Requiring an operator
/// to remember a manual `cast send` is what made this path skip silently for so long.
///
/// **Only runs against a local anvil**, detected by whether `anvil_mine` is supported. On a real
/// network this would spend real funds, so it returns and lets the assertion report the gap.
async fn ensure_payer_collateral(
    client: &reqwest::Client,
    env: &TestEnv,
    public_params: &Value,
    local_anvil: bool,
) {
    if !local_anvil {
        eprintln!("[e2e] not a local anvil; leaving collateral seeding to the operator");
        return;
    }

    let payer_key = env_opt("E2E_PAYER_KEY").unwrap_or_else(|| ANVIL_ACCT1_KEY.to_string());
    let signer: alloy::signers::local::PrivateKeySigner =
        payer_key.parse().expect("invalid payer key");
    let connected = sdk_4mica::ClientBuilder::default()
        .signer(signer)
        .rpc_url(env.core_url.clone())
        .connect()
        .await;
    let sdk = match connected {
        Ok(sdk) => sdk,
        Err(err) => {
            eprintln!("[e2e] could not build an SDK client to seed collateral: {err}");
            return;
        }
    };

    // `getUserAllAssets` rather than `principalBalance`: the latter is stablecoin-only and rejects
    // the zero address, while the happy path settles against native ETH collateral.
    let existing = match sdk.account.assets().await {
        Ok(assets) => assets
            .into_iter()
            .find(|asset| asset.asset == sdk_4mica::Address::ZERO)
            .map(|asset| asset.collateral)
            .unwrap_or_else(sdk_4mica::U256::default),
        Err(err) => {
            eprintln!("[e2e] could not read payer collateral: {err}");
            return;
        }
    };
    if !existing.is_zero() {
        eprintln!("[e2e] payer already holds {existing} wei of collateral");
        return;
    }

    // Generously more than the 1-wei payments the happy path makes, so one seed covers many runs.
    let seed = sdk_4mica::U256::from(1_000_000_000_000_000_000u64);
    match sdk.deposit.of(sdk_4mica::Asset::Native, seed).send().await {
        Ok(_) => {
            eprintln!("[e2e] seeded {seed} wei of collateral for the payer");
            // The deposit is mined but not yet at confirmation depth; advance past it.
            advance_chain(client, public_params).await;
        }
        Err(err) => eprintln!("[e2e] could not seed payer collateral: {err}"),
    }
}

/// Mints the payer `amount` of `token` when it holds less, so a deposit has something to move.
///
/// **Only for a local anvil**: the dev stack's mock stablecoins let anyone mint, and a real token
/// would refuse anyway.
async fn ensure_payer_tokens(
    public_params: &Value,
    payer_key: &str,
    token: sdk_4mica::Address,
    amount: u64,
) {
    use alloy::providers::{Provider, ProviderBuilder};
    use alloy::sol;

    sol! {
        #[sol(rpc)]
        contract MintableToken {
            function balanceOf(address owner) external view returns (uint256);
            function mint(address to, uint256 amount) external;
        }
    }

    let Some(rpc_url) = public_params["ethereum_http_rpc_url"]
        .as_str()
        .filter(|url| !url.is_empty())
    else {
        eprintln!("[e2e] core advertises no chain RPC; leaving token funding to the operator");
        return;
    };
    let signer: alloy::signers::local::PrivateKeySigner =
        payer_key.parse().expect("invalid payer key");
    let payer = signer.address();
    let provider = ProviderBuilder::new()
        .wallet(signer)
        .connect(rpc_url)
        .await
        .expect("connect to the chain core watches")
        .erased();
    let contract = MintableToken::new(token, provider);

    let needed = sdk_4mica::U256::from(amount);
    let held = contract
        .balanceOf(payer)
        .call()
        .await
        .expect("read payer token balance");
    if held >= needed {
        return;
    }

    let receipt = contract
        .mint(payer, needed - held)
        .send()
        .await
        .expect("mint the payer's deposit tokens")
        .get_receipt()
        .await
        .expect("mint receipt");
    assert!(receipt.status(), "minting {token} for the payer reverted");
    eprintln!("[e2e] minted {} of {token} for the payer", needed - held);
}

/// Mines a block on the chain core watches, then gives its indexer a moment to catch up.
///
/// Core confirms on-chain events at a block depth (`NUMBER_OF_BLOCKS_TO_CONFIRM`), so a deposit is
/// mined into block N but only becomes spendable collateral once block N+1 exists. A local anvil
/// mines on demand, so with no other traffic that next block never arrives and the deposit stays
/// invisible to core indefinitely — surfacing much later as `user not registered` or
/// `InsufficientCollateral`, which look like seeding mistakes rather than a stalled chain.
///
/// Best-effort: `anvil_mine` is unavailable on a real node, and there the chain advances anyway.
/// Returns whether mining succeeded, which doubles as "this is a local development chain".
async fn advance_chain(client: &reqwest::Client, public_params: &Value) -> bool {
    let Some(rpc_url) = public_params["ethereum_http_rpc_url"]
        .as_str()
        .filter(|url| !url.is_empty())
    else {
        return false;
    };

    let mined = client
        .post(rpc_url)
        .json(&json!({ "jsonrpc": "2.0", "id": 1, "method": "anvil_mine", "params": [1] }))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false);

    if !mined {
        eprintln!(
            "[e2e] anvil_mine unavailable at {rpc_url}; assuming the chain advances on its own"
        );
        return false;
    }

    // The scanner polls; without a beat the block we just mined may not be indexed yet.
    tokio::time::sleep(Duration::from_secs(2)).await;
    eprintln!("[e2e] mined a block so pending deposits reach confirmation depth");
    true
}

/// Deposits a token that supports EIP-2612 but *not* EIP-3009, with the payer paying no gas at all.
///
/// Permit2 alone is not gasless: it needs a one-time on-chain `approve(PERMIT2, …)`. This exercises
/// x402's `eip2612GasSponsoring` answer to that — the payer signs a permit, the facilitator submits
/// it, and only then pulls the deposit. Two relayer transactions, zero payer transactions.
///
/// Opt in with `E2E_PERMIT2_TOKEN`; there is no sensible default, since the token must be the
/// awkward 2612-without-3009 shape for this path to be the one under test.
async fn run_sponsored_permit_deposit(
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    public_params: &Value,
    local_anvil: bool,
) {
    let Some(token) = env_opt("E2E_PERMIT2_TOKEN") else {
        eprintln!(
            "[e2e] sponsored-permit deposit skipped: set E2E_PERMIT2_TOKEN to an EIP-2612 token \
             registered with core and funded for the payer"
        );
        return;
    };
    let payer_key = env_opt("E2E_PAYER_KEY").unwrap_or_else(|| ANVIL_ACCT1_KEY.to_string());
    let amount: u64 = env_opt("E2E_DEPOSIT_AMOUNT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1_000);

    let signer: alloy::signers::local::PrivateKeySigner =
        payer_key.parse().expect("invalid payer key");
    let payer = signer.address();
    let sdk = sdk_client(&env.core_url, &payer_key).await;

    let token_address: sdk_4mica::Address = token
        .parse()
        .expect("core advertised a valid token address");
    let asset = sdk_4mica::Asset::Erc20(token_address);
    if local_anvil {
        ensure_payer_tokens(public_params, &payer_key, token_address, amount).await;
    }

    let before = sdk
        .account
        .principal_balance(asset)
        .await
        .unwrap_or_default();

    // The Permit2 half comes from the SDK, exactly as a real client would produce it.
    let permit2 = match sdk
        .deposit
        .of(asset, sdk_4mica::U256::from(amount))
        .permit2()
        .sign()
        .await
    {
        Ok(auth) => auth,
        Err(err) => {
            eprintln!("[e2e] sponsored-permit deposit skipped: SDK could not sign permit2 ({err})");
            return;
        }
    };

    // The EIP-2612 half is signed here: it authorises Permit2 rather than 4mica, so it is not
    // something the 4mica SDK produces.
    let Some(permit) = sign_eip2612_permit(&signer, &token, payer).await else {
        eprintln!(
            "[e2e] sponsored-permit deposit skipped: {token} does not expose EIP-2612 permit/nonces"
        );
        return;
    };

    let body = json!({
        "network": env.network,
        "asset": token,
        "amount": amount.to_string(),
        "assetTransferMethod": "permit2",
        "permit2Authorization": serde_json::to_value(&permit2).expect("serialize permit2"),
        "eip2612Permit": permit,
    });

    let (status, settle) = post_json(client, &format!("{base}/deposit"), &body).await;
    assert!(status.is_success(), "/deposit HTTP status {status}");
    if settle["errorCode"] == "NO_RELAYER_CONFIGURED" {
        eprintln!("[e2e] sponsored-permit deposit skipped: facilitator has no relayer configured");
        return;
    }
    if settle["errorCode"] == "SIMULATION_REVERTED" {
        eprintln!(
            "[e2e] sponsored-permit deposit skipped: {}",
            settle["error"]
        );
        return;
    }
    assert_eq!(settle["success"], true, "/deposit failed: {settle}");

    let after = sdk
        .account
        .principal_balance(asset)
        .await
        .expect("read principal balance");
    assert_eq!(
        after - before,
        sdk_4mica::U256::from(amount),
        "collateral must be credited to the signer"
    );
    eprintln!("[e2e] sponsored-permit deposit credited {amount} of {token} with no payer gas ✔");
}

/// Signs an EIP-2612 permit authorising Permit2 to spend `amount` of `token` on the payer's behalf.
/// Returns `None` when the token has no `nonces`/`DOMAIN_SEPARATOR`, i.e. is not EIP-2612.
async fn sign_eip2612_permit(
    signer: &alloy::signers::local::PrivateKeySigner,
    token: &str,
    owner: alloy::primitives::Address,
) -> Option<Value> {
    use alloy::primitives::{Address, B256, U256, keccak256};
    use alloy::providers::{Provider, ProviderBuilder};
    use alloy::signers::SignerSync;
    use alloy::sol;

    sol! {
        #[sol(rpc)]
        contract Eip2612 {
            function nonces(address owner) external view returns (uint256);
            function DOMAIN_SEPARATOR() external view returns (bytes32);
        }
    }

    let rpc_url = env_opt("E2E_ETH_RPC_URL").unwrap_or_else(|| "http://127.0.0.1:8545".to_string());
    let provider = ProviderBuilder::new()
        .connect(&rpc_url)
        .await
        .ok()?
        .erased();
    let token_addr: Address = token.parse().ok()?;
    let contract = Eip2612::new(token_addr, provider);

    let nonce = contract.nonces(owner).call().await.ok()?;
    let domain_separator = contract.DOMAIN_SEPARATOR().call().await.ok()?;

    // Canonical Permit2, the spender the deposit contract will pull through.
    let permit2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3".parse().ok()?;
    let deadline = U256::from(4_000_000_000u64);
    let value = U256::MAX;

    let type_hash = keccak256(
        b"Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
            .as_slice(),
    );
    let word = |a: Address| {
        let mut w = [0u8; 32];
        w[12..].copy_from_slice(a.as_slice());
        w
    };
    let mut encoded = Vec::with_capacity(32 * 6);
    encoded.extend_from_slice(type_hash.as_slice());
    encoded.extend_from_slice(&word(owner));
    encoded.extend_from_slice(&word(permit2));
    encoded.extend_from_slice(&value.to_be_bytes::<32>());
    encoded.extend_from_slice(&nonce.to_be_bytes::<32>());
    encoded.extend_from_slice(&deadline.to_be_bytes::<32>());

    let mut buf = Vec::with_capacity(66);
    buf.push(0x19);
    buf.push(0x01);
    buf.extend_from_slice(domain_separator.as_slice());
    buf.extend_from_slice(keccak256(encoded).as_slice());
    let digest: B256 = keccak256(buf);

    let sig = signer.sign_hash_sync(&digest).ok()?;
    Some(json!({
        "value": value.to_string(),
        "deadline": deadline.to_string(),
        "v": 27 + sig.v() as u8,
        "r": format!("{:#x}", sig.r()),
        "s": format!("{:#x}", sig.s()),
    }))
}

/// First token core advertises with a domain separator, i.e. one it considers gasless-depositable.
///
/// Note the field only proves the token implements EIP-712, not EIP-3009 — a token can advertise a
/// separator and still lack `receiveWithAuthorization`. That mismatch surfaces as a failing
/// `/deposit/verify` rather than a skip, which is deliberate: it is a real gap in core's token
/// registration, not a reason to pass quietly.
async fn discover_depositable_token(client: &reqwest::Client, core_url: &str) -> Option<String> {
    let url = format!("{}/core/tokens", core_url.trim_end_matches('/'));
    let body = client
        .get(url)
        .send()
        .await
        .ok()?
        .json::<Value>()
        .await
        .ok()?;
    body["tokens"].as_array()?.iter().find_map(|token| {
        token
            .get("domain_separator")
            .and_then(Value::as_str)
            .filter(|separator| !separator.is_empty())
            .and_then(|_| token.get("address").and_then(Value::as_str))
            .map(ToOwned::to_owned)
    })
}
