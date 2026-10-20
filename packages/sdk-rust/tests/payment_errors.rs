//! How the payment client reacts to core's coded refusals, what it caches between payments, and
//! which cycle it checkpoints.
//!
//! Fully offline against a mock core. The refusals are the payer's whole recovery story — each one
//! has to arrive as a typed error carrying what the caller needs to act on, and two of them also
//! settle what the client may keep reusing.

use std::sync::{Arc, Mutex};

use alloy::primitives::{Address, B256, U256, address};
use alloy::signers::SignerSync;
use alloy::signers::local::PrivateKeySigner;
use axum::http::StatusCode;
use axum::{Json, Router, routing::get, routing::post};
use rpc::{
    CLEARING_HOUSE_EIP712_NAME, CLEARING_HOUSE_EIP712_VERSION, CorePublicParameters,
    PAYMENT_PAYLOAD_VERSION, PaymentRequest, PaymentRequestPayload, SignedCheckpoint,
    clearing_house_domain,
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

/// A payment `payer` signed in the first cycle, as core lists it in a checkpoint batch.
fn signed_payment(payer: &PrivateKeySigner, amount: u64, timestamp: u64) -> PaymentRequest {
    let payload = PaymentRequestPayload::new(
        payer.address().to_string(),
        RECIPIENT.to_string(),
        FIRST_CYCLE,
        U256::from(timestamp),
        U256::from(amount),
        timestamp,
        None,
        B256::repeat_byte(0x33),
    );
    let digest = payload
        .signing_digest(&clearing_house_domain(CHAIN_ID, CLEARING_HOUSE))
        .expect("valid addresses");
    let signature = payer.sign_hash_sync(&digest).expect("sign");
    PaymentRequest::new(payload, alloy::hex::encode_prefixed(signature.as_bytes()))
}

/// What the mock core saw of a checkpoint exchange.
#[derive(Default)]
struct CheckpointTraffic {
    batch_reads: usize,
    submitted: Vec<SignedCheckpoint>,
}

/// A core where a second payment lands right after the payer first reads its batch, and which
/// refuses the first `refusals` checkpoints as no longer matching.
async fn client_racing_a_payment(
    refusals: usize,
) -> anyhow::Result<(Client<PrivateKeySigner>, Arc<Mutex<CheckpointTraffic>>)> {
    let payer = PrivateKeySigner::random();
    let first = signed_payment(&payer, 10, 1_700_000_100);
    let late = signed_payment(&payer, 7, 1_700_000_200);

    let traffic = Arc::new(Mutex::new(CheckpointTraffic::default()));
    let batch_traffic = traffic.clone();
    let submit_traffic = traffic.clone();
    let payer_address = payer.address();

    let core_url = spawn(
        Router::new()
            .route(
                "/core/public-params",
                get(|| async { Json(public_params()) }),
            )
            .route(
                "/core/payers/{payer}/checkpoint-batch",
                get(move || {
                    let traffic = batch_traffic.clone();
                    let (first, late) = (first.clone(), late.clone());
                    async move {
                        let mut traffic = traffic.lock().unwrap();
                        traffic.batch_reads += 1;
                        let authorizations = if traffic.batch_reads == 1 {
                            vec![first]
                        } else {
                            vec![first, late]
                        };
                        Json(json!({
                            "cycle_id": format!("{FIRST_CYCLE:#x}"),
                            "cycle_id_text": "0x0:1700000000",
                            "asset_address": Address::ZERO.to_string(),
                            "payer": payer_address.to_string(),
                            "previous": null,
                            "authorizations": authorizations,
                            "max_uncheckpointed": 64,
                        }))
                    }
                }),
            )
            .route(
                "/core/checkpoints",
                post(move |Json(signed): Json<SignedCheckpoint>| {
                    let traffic = submit_traffic.clone();
                    async move {
                        let mut traffic = traffic.lock().unwrap();
                        traffic.submitted.push(signed.clone());
                        let checkpoint = signed.payload;
                        if traffic.submitted.len() <= refusals {
                            return (
                                StatusCode::BAD_REQUEST,
                                Json(json!({
                                    "error": "checkpoint cumulative gross does not match the covered authorizations",
                                    "code": "CHECKPOINT_MISMATCH",
                                    "details": {
                                        "cycle_id": format!("{FIRST_CYCLE:#x}"),
                                        "cycle_id_text": "0x0:1700000000",
                                        "asset_address": checkpoint.asset_address,
                                        "payer": checkpoint.payer,
                                    },
                                })),
                            );
                        }
                        (
                            StatusCode::OK,
                            Json(json!({
                                "cycle_id": format!("{FIRST_CYCLE:#x}"),
                                "cycle_id_text": "0x0:1700000000",
                                "asset_address": checkpoint.asset_address,
                                "payer": checkpoint.payer,
                                "cumulative_gross": checkpoint.cumulative_gross.to_string(),
                                "timestamp_cutoff": checkpoint.timestamp_cutoff,
                                "covered": 2,
                            })),
                        )
                    }
                }),
            ),
    )
    .await?;

    let client = Client::connect(
        ClientBuilder::default()
            .rpc_url(core_url)
            .signer(payer)
            .bearer_token("test-token")
            .contract_address(CONTRACT.to_string())
            .build()?,
    )
    .await?;
    Ok((client, traffic))
}

/// A payment landing mid-checkpoint makes the first one stale; the retry re-reads the batch and
/// covers the late payment too.
#[tokio::test]
#[serial_test::file_serial]
async fn a_checkpoint_overtaken_by_a_payment_is_signed_again() -> anyhow::Result<()> {
    let (client, traffic) = client_racing_a_payment(1).await?;

    let accepted = client
        .payment
        .checkpoint_cycle(Asset::Native, FIRST_CYCLE)
        .await?
        .expect("the batch has payments to cover");
    assert_eq!(accepted.cumulative_gross, "17");
    assert_eq!(accepted.timestamp_cutoff, 1_700_000_200);

    let traffic = traffic.lock().unwrap();
    assert_eq!(traffic.batch_reads, 2, "the retry must re-read the batch");
    assert_eq!(traffic.submitted.len(), 2);
    assert_eq!(
        traffic.submitted[0].payload.cumulative_gross,
        U256::from(10u64)
    );
    Ok(())
}

/// A payer paid faster than it can checkpoint gets the refusal back rather than an endless retry.
#[tokio::test]
#[serial_test::file_serial]
async fn a_checkpoint_refused_twice_reports_the_mismatch() -> anyhow::Result<()> {
    let (client, traffic) = client_racing_a_payment(usize::MAX).await?;

    let err = client
        .payment
        .checkpoint_cycle(Asset::Native, FIRST_CYCLE)
        .await
        .expect_err("core refuses every checkpoint here");
    match err {
        PaymentError::CheckpointMismatch { details, reason } => {
            assert_eq!(details.cycle_id, format!("{FIRST_CYCLE:#x}"));
            assert!(reason.contains("cumulative gross"), "{reason}");
        }
        other => panic!("expected a checkpoint mismatch, got {other:?}"),
    }
    assert_eq!(traffic.lock().unwrap().submitted.len(), 2);
    Ok(())
}

/// A core that serves `cycle` as the active one and nothing else.
async fn client_with_active_cycle(cycle: Value) -> anyhow::Result<Client<PrivateKeySigner>> {
    let core_url = spawn(
        Router::new()
            .route(
                "/core/public-params",
                get(|| async { Json(public_params()) }),
            )
            .route(
                "/core/cycles/active",
                get(move || {
                    let cycle = cycle.clone();
                    async move { Json(cycle) }
                }),
            ),
    )
    .await?;

    Ok(Client::connect(
        ClientBuilder::default()
            .rpc_url(core_url)
            .signer(PrivateKeySigner::random())
            .bearer_token("test-token")
            .contract_address(CONTRACT.to_string())
            .build()?,
    )
    .await?)
}

/// The active cycle as a core whose clock reads `server_time` reports it.
fn active_cycle_at(server_time: u64, period_start: u64) -> Value {
    json!({
        "cycle_id": format!("{FIRST_CYCLE:#x}"),
        "cycle_id_text": "0x0:1700000000",
        "asset_address": Address::ZERO.to_string(),
        "period_start": period_start,
        "period_end": server_time + 86_400,
        "server_time": server_time,
    })
}

async fn stamped(client: &Client<PrivateKeySigner>) -> u64 {
    client
        .payment
        .new_payment(RECIPIENT, U256::from(10u64), Asset::Native)
        .await
        .expect("build payment")
        .timestamp()
}

/// Core refuses a payment stamped past its own clock, so a payer whose clock runs ahead must stamp
/// by core's, and one whose clock lags must not fall behind the cycle it signs for.
#[tokio::test]
#[serial_test::file_serial]
async fn payments_are_stamped_by_cores_clock() -> anyhow::Result<()> {
    for skew in [3_600i64, -3_600] {
        let core_time = (unix_now() as i64 + skew) as u64;
        let client = client_with_active_cycle(active_cycle_at(core_time, 1_700_000_000)).await?;

        let timestamp = stamped(&client).await;
        let core_now = (unix_now() as i64 + skew) as u64;
        assert!(
            timestamp <= core_now,
            "core is {skew}s off; stamped {timestamp}, core reads {core_now}"
        );
        assert!(
            timestamp + 2 >= core_time,
            "core is {skew}s off; stamped {timestamp}, core read {core_time}"
        );
    }
    Ok(())
}

/// Erring behind core's clock must not push a payment before the cycle it is signed for.
#[tokio::test]
#[serial_test::file_serial]
async fn a_payment_in_a_cycle_that_just_opened_is_stamped_inside_it() -> anyhow::Result<()> {
    let opened = unix_now();
    let client = client_with_active_cycle(active_cycle_at(opened, opened)).await?;

    assert!(stamped(&client).await >= opened);
    Ok(())
}

#[tokio::test]
#[serial_test::file_serial]
async fn a_future_timestamp_reports_cores_clock_and_resets_ours() -> anyhow::Result<()> {
    let core_time = unix_now() - 3_600;
    let (client, _) = client_refusing_with(json!({
        "error": "request timestamp is later than the server clock",
        "code": "FUTURE_TIMESTAMP",
        "details": { "timestamp": unix_now(), "server_time": core_time },
    }))
    .await?;

    match refused(&client).await {
        PaymentError::FutureTimestamp(details) => assert_eq!(details.server_time, core_time),
        other => panic!("expected a future timestamp, got {other:?}"),
    }
    assert!(
        stamped(&client).await <= core_time + 1,
        "the next payment must be stamped by the clock core reported"
    );
    Ok(())
}

#[tokio::test]
#[serial_test::file_serial]
async fn a_stale_timestamp_names_the_cycle_it_missed() -> anyhow::Result<()> {
    let (client, _) = client_refusing_with(json!({
        "error": "request timestamp is before the active cycle started",
        "code": "STALE_TIMESTAMP",
        "details": {
            "cycle_id": format!("{FIRST_CYCLE:#x}"),
            "cycle_id_text": "0x0:1700000000",
            "timestamp": 1_699_999_999u64,
            "period_start": 1_700_000_000u64,
            "period_end": 1_700_086_400u64,
            "server_time": unix_now(),
        },
    }))
    .await?;

    match refused(&client).await {
        PaymentError::StaleTimestamp(details) => {
            assert_eq!(details.period_start, 1_700_000_000);
            assert_eq!(details.cycle_id, format!("{FIRST_CYCLE:#x}"));
        }
        other => panic!("expected a stale timestamp, got {other:?}"),
    }
    Ok(())
}
