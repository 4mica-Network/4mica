//! How the payment client reacts to core's coded refusals, what it caches between payments, and
//! which cycle it checkpoints.
//!
//! Fully offline against a mock core. The refusals are the payer's whole recovery story — each one
//! has to arrive as a typed error carrying what the caller needs to act on, and two of them also
//! settle what the client may keep reusing.

use std::sync::{Arc, Mutex};

use alloy::primitives::{Address, B256, U256, address};
use alloy::signers::local::PrivateKeySigner;
use axum::http::StatusCode;
use axum::{Json, Router, routing::get, routing::post};
use rpc::{
    CLEARING_HOUSE_EIP712_NAME, CLEARING_HOUSE_EIP712_VERSION, CorePublicParameters,
    PAYMENT_PAYLOAD_VERSION,
};
use sdk_4mica::error::PaymentError;
use sdk_4mica::{Asset, Client, ClientBuilder};
use serde_json::{Value, json};
use tokio::net::TcpListener;

const CHAIN_ID: u64 = 1337;
const CONTRACT: Address = address!("00000000000000000000000000000000c04e4a1c");
const CLEARING_HOUSE: Address = address!("00000000000000000000000000000000c1ea4111");
const GUARANTEE_REGISTRY: Address = address!("0000000000000000000000000000000000065e61");
const GUARANTEE_SIGNER: Address = address!("0000000000000000000000000000000000005164");
const RECIPIENT: Address = address!("00000000000000000000000000000000000000be");
const FIRST_CYCLE: B256 = B256::repeat_byte(0x11);
const NEXT_CYCLE: B256 = B256::repeat_byte(0x22);

async fn spawn(router: Router) -> anyhow::Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, router.into_make_service()).await {
            eprintln!("mock server stopped: {err}");
        }
    });
    Ok(format!("http://{addr}"))
}

fn public_params() -> CorePublicParameters {
    CorePublicParameters {
        guarantee_signer: GUARANTEE_SIGNER.to_string(),
        contract_address: CONTRACT.to_string(),
        guarantee_registry_address: GUARANTEE_REGISTRY.to_string(),
        clearing_house_address: CLEARING_HOUSE.to_string(),
        ethereum_http_rpc_url: String::new(),
        eip712_name: CLEARING_HOUSE_EIP712_NAME.into(),
        eip712_version: CLEARING_HOUSE_EIP712_VERSION.into(),
        chain_id: CHAIN_ID,
        supported_payment_payload_versions: vec![PAYMENT_PAYLOAD_VERSION],
        core_domain_separator: String::new(),
        validators: vec![],
    }
}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock after epoch")
        .as_secs()
}

/// A cycle still open for the next day, so only a refusal can expire it.
fn active_cycle(cycle_id: B256) -> Value {
    active_cycle_ending(cycle_id, unix_now() + 86_400)
}

fn active_cycle_ending(cycle_id: B256, period_end: u64) -> Value {
    json!({
        "cycle_id": format!("{cycle_id:#x}"),
        "cycle_id_text": "0x0:1700000000",
        "asset_address": Address::ZERO.to_string(),
        "period_start": 1_700_000_000u64,
        "period_end": period_end,
    })
}

/// How many times the client asked which cycle is open.
#[derive(Default)]
struct CycleReads(usize);

/// A core that always serves a cycle and always refuses issuance with `refusal`.
async fn client_refusing_with(
    refusal: Value,
) -> anyhow::Result<(Client<PrivateKeySigner>, Arc<Mutex<CycleReads>>)> {
    let reads = Arc::new(Mutex::new(CycleReads::default()));
    let cycle_reads = reads.clone();

    let core_url = spawn(
        Router::new()
            .route(
                "/core/public-params",
                get(|| async { Json(public_params()) }),
            )
            .route(
                "/core/cycles/active",
                get(move || {
                    let reads = cycle_reads.clone();
                    async move {
                        let mut reads = reads.lock().unwrap();
                        reads.0 += 1;
                        // The second read reports a different cycle, so a test can tell a
                        // cached answer from a fresh one.
                        Json(active_cycle(if reads.0 == 1 {
                            FIRST_CYCLE
                        } else {
                            NEXT_CYCLE
                        }))
                    }
                }),
            )
            .route(
                "/core/guarantees",
                post(move || {
                    let refusal = refusal.clone();
                    async move { (StatusCode::CONFLICT, Json(refusal)) }
                }),
            ),
    )
    .await?;

    let client = Client::connect(
        ClientBuilder::default()
            .rpc_url(core_url)
            .signer(PrivateKeySigner::random())
            .bearer_token("test-token")
            .contract_address(CONTRACT.to_string())
            .build()?,
    )
    .await?;
    Ok((client, reads))
}

async fn refused(client: &Client<PrivateKeySigner>) -> PaymentError {
    let payload = client
        .payment
        .new_payment(RECIPIENT, U256::from(10u64), Asset::Native)
        .await
        .expect("build payment");
    let request = client
        .payment
        .sign_request(payload)
        .await
        .expect("sign payment");
    client
        .payment
        .issue_guarantee(request)
        .await
        .expect_err("core refuses every issuance here")
}

#[tokio::test]
#[serial_test::file_serial]
async fn a_checkpoint_requirement_names_what_is_outstanding() -> anyhow::Result<()> {
    let (client, _) = client_refusing_with(json!({
        "error": "payer must submit a checkpoint before more guarantees are accepted",
        "code": "CHECKPOINT_REQUIRED",
        "details": {
            "cycle_id": format!("{FIRST_CYCLE:#x}"),
            "cycle_id_text": "0x0:1700000000",
            "asset_address": Address::ZERO.to_string(),
            "payer": RECIPIENT.to_string(),
            "uncheckpointed": 64,
            "max_uncheckpointed": 64,
        },
    }))
    .await?;

    match refused(&client).await {
        PaymentError::CheckpointRequired(details) => {
            assert_eq!(details.uncheckpointed, 64);
            assert_eq!(details.max_uncheckpointed, 64);
        }
        other => panic!("expected a checkpoint requirement, got {other:?}"),
    }
    Ok(())
}

/// The cutoff comes back with the refusal, and the client keeps it so the next payment is stamped
/// past it rather than repeating the same mistake.
#[tokio::test]
#[serial_test::file_serial]
async fn a_cutoff_refusal_names_the_cutoff() -> anyhow::Result<()> {
    let (client, _) = client_refusing_with(json!({
        "error": "request timestamp must be past the payer's latest checkpoint cutoff",
        "code": "TIMESTAMP_NOT_PAST_CUTOFF",
        "details": {
            "cycle_id": format!("{FIRST_CYCLE:#x}"),
            "cycle_id_text": "0x0:1700000000",
            "asset_address": Address::ZERO.to_string(),
            "payer": RECIPIENT.to_string(),
            "timestamp": 1_700_000_000u64,
            "timestamp_cutoff": 1_700_000_000u64,
            "cumulative_gross": "500",
            "server_time": 1_700_000_001u64,
        },
    }))
    .await?;

    match refused(&client).await {
        PaymentError::TimestampNotPastCutoff(details) => {
            assert_eq!(details.timestamp_cutoff, 1_700_000_000);
            assert_eq!(details.cumulative_gross, "500");
        }
        other => panic!("expected a cutoff refusal, got {other:?}"),
    }
    Ok(())
}

/// A cycle is held until core rejects a payment signed against it, so the next payment is scoped to
/// the cycle core will actually accept.
#[tokio::test]
#[serial_test::file_serial]
async fn a_cycle_mismatch_is_what_expires_the_cached_cycle() -> anyhow::Result<()> {
    let (client, reads) = client_refusing_with(json!({
        "error": "request was signed for a cycle other than the active settlement cycle",
        "code": "CYCLE_MISMATCH",
        "details": {
            "signed_cycle_id": format!("{FIRST_CYCLE:#x}"),
            "active_cycle_id": format!("{NEXT_CYCLE:#x}"),
            "active_cycle_id_text": "0x0:1700086400",
            "active_period_end": 1_700_172_800u64,
        },
    }))
    .await?;

    let first = client
        .payment
        .new_payment(RECIPIENT, U256::from(10u64), Asset::Native)
        .await?;
    assert_eq!(first.cycle_id(), FIRST_CYCLE);

    // A second payment before any refusal reuses the cycle rather than asking again.
    let second = client
        .payment
        .new_payment(RECIPIENT, U256::from(10u64), Asset::Native)
        .await?;
    assert_eq!(second.cycle_id(), FIRST_CYCLE);
    assert_eq!(reads.lock().unwrap().0, 1, "the cycle must be cached");

    match refused(&client).await {
        PaymentError::CycleMismatch(details) => {
            assert_eq!(details.active_cycle_id, format!("{NEXT_CYCLE:#x}"));
        }
        other => panic!("expected a cycle mismatch, got {other:?}"),
    }

    let after = client
        .payment
        .new_payment(RECIPIENT, U256::from(10u64), Asset::Native)
        .await?;
    assert_eq!(
        after.cycle_id(),
        NEXT_CYCLE,
        "the refusal must have expired the cached cycle"
    );
    Ok(())
}

/// Once a cycle's period ends core opens the next one, so the client stops reusing it.
#[tokio::test]
#[serial_test::file_serial]
async fn a_cycle_is_reread_once_its_period_ends() -> anyhow::Result<()> {
    let reads = Arc::new(Mutex::new(CycleReads::default()));
    let cycle_reads = reads.clone();

    let core_url = spawn(
        Router::new()
            .route(
                "/core/public-params",
                get(|| async { Json(public_params()) }),
            )
            .route(
                "/core/cycles/active",
                get(move || {
                    let reads = cycle_reads.clone();
                    async move {
                        reads.lock().unwrap().0 += 1;
                        Json(active_cycle_ending(FIRST_CYCLE, unix_now() - 1))
                    }
                }),
            ),
    )
    .await?;

    let client = Client::connect(
        ClientBuilder::default()
            .rpc_url(core_url)
            .signer(PrivateKeySigner::random())
            .bearer_token("test-token")
            .contract_address(CONTRACT.to_string())
            .build()?,
    )
    .await?;

    for _ in 0..2 {
        client
            .payment
            .new_payment(RECIPIENT, U256::from(10u64), Asset::Native)
            .await?;
    }
    assert_eq!(reads.lock().unwrap().0, 2, "an ended cycle must be re-read");
    Ok(())
}

/// Issuance is the recipient's call, so a cutoff refusal usually names a payer this client is not.
/// Taking that cutoff as its own would hold back its next payment for someone else's schedule.
#[tokio::test]
#[serial_test::file_serial]
async fn another_payers_cutoff_does_not_hold_this_client_back() -> anyhow::Result<()> {
    let far_future = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs()
        + 3_600;
    let (client, _) = client_refusing_with(json!({
        "error": "request timestamp must be past the payer's latest checkpoint cutoff",
        "code": "TIMESTAMP_NOT_PAST_CUTOFF",
        "details": {
            "cycle_id": format!("{FIRST_CYCLE:#x}"),
            "cycle_id_text": "0x0:1700000000",
            "asset_address": Address::ZERO.to_string(),
            // Someone else entirely.
            "payer": address!("00000000000000000000000000000000000000aa").to_string(),
            "timestamp": far_future - 1,
            "timestamp_cutoff": far_future,
            "cumulative_gross": "500",
            "server_time": far_future - 1,
        },
    }))
    .await?;

    assert!(matches!(
        refused(&client).await,
        PaymentError::TimestampNotPastCutoff(_)
    ));

    // Building the next payment must not wait out an hour that was never this client's to serve.
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        client
            .payment
            .new_payment(RECIPIENT, U256::from(10u64), Asset::Native),
    )
    .await
    .expect("the next payment must not be held back by another payer's cutoff")?;
    Ok(())
}

/// A refusal core does not code stays an RPC error rather than being forced into a typed variant.
#[tokio::test]
#[serial_test::file_serial]
async fn an_uncoded_refusal_is_not_reinterpreted() -> anyhow::Result<()> {
    let (client, _) = client_refusing_with(json!({
        "error": "another guarantee with req_id 7 already exists",
    }))
    .await?;

    match refused(&client).await {
        PaymentError::Rpc(err) => {
            assert!(err.to_string().contains("already exists"), "{err:?}");
        }
        other => panic!("expected a plain RPC error, got {other:?}"),
    }
    Ok(())
}

/// Each checkpoint asks core for exactly the cycle it covers: the active one, or the one named.
#[tokio::test]
#[serial_test::file_serial]
async fn each_checkpoint_names_the_cycle_it_covers() -> anyhow::Result<()> {
    let asked_for = Arc::new(Mutex::new(Vec::<String>::new()));
    let batch_cycles = asked_for.clone();

    let core_url = spawn(
        Router::new()
            .route(
                "/core/public-params",
                get(|| async { Json(public_params()) }),
            )
            .route(
                "/core/cycles/active",
                get(|| async { Json(active_cycle(NEXT_CYCLE)) }),
            )
            .route(
                "/core/payers/{payer}/checkpoint-batch",
                get(
                    move |axum::extract::RawQuery(query): axum::extract::RawQuery| {
                        let asked = batch_cycles.clone();
                        async move {
                            asked.lock().unwrap().push(query.unwrap_or_default());
                            Json(json!({
                                "cycle_id": format!("{FIRST_CYCLE:#x}"),
                                "cycle_id_text": "0x0:1700000000",
                                "asset_address": Address::ZERO.to_string(),
                                "payer": Address::ZERO.to_string(),
                                "previous": null,
                                "authorizations": [],
                                "max_uncheckpointed": 64,
                            }))
                        }
                    },
                ),
            ),
    )
    .await?;

    let client = Client::connect(
        ClientBuilder::default()
            .rpc_url(core_url)
            .signer(PrivateKeySigner::random())
            .bearer_token("test-token")
            .contract_address(CONTRACT.to_string())
            .build()?,
    )
    .await?;

    assert!(
        client
            .payment
            .checkpoint_active_cycle(Asset::Native)
            .await?
            .is_none()
    );
    assert!(
        client
            .payment
            .checkpoint_cycle(Asset::Native, FIRST_CYCLE)
            .await?
            .is_none()
    );

    let asked = asked_for.lock().unwrap().clone();
    assert_eq!(asked.len(), 2);
    assert!(
        asked[0].contains(&format!("cycle_id={NEXT_CYCLE:#x}")),
        "the active-cycle checkpoint must name the active cycle, asked: {}",
        asked[0]
    );
    assert!(
        asked[1].contains(&format!("cycle_id={FIRST_CYCLE:#x}")),
        "a named checkpoint must name that cycle, asked: {}",
        asked[1]
    );
    Ok(())
}
