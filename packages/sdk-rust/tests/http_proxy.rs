use alloy::primitives::{B256, U256};
use axum::{Json, Router, routing::get};
use rpc::{
    CorePublicParameters, Guarantee, GuaranteeReceipt, PaymentRequest, PaymentRequestPayload,
    RpcProxy, ValidationRequirement,
};
use serde_json::json;
use tokio::net::TcpListener;

async fn spawn_router(
    router: Router,
) -> Result<(String, tokio::task::JoinHandle<()>), std::io::Error> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let handle = tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, router.into_make_service()).await {
            eprintln!("test server stopped: {err}");
        }
    });
    Ok((format!("http://{}", addr), handle))
}

#[tokio::test]
#[serial_test::file_serial]
async fn rpc_proxy_get_public_params_round_trip() {
    let params = CorePublicParameters {
        guarantee_signer: "0x0000000000000000000000000000000000005164".into(),
        contract_address: "0x1234567890abcdef1234567890abcdef12345678".into(),
        guarantee_registry_address: "0x0000000000000000000000000000000000065e61".into(),
        clearing_house_address: "0x00000000000000000000000000000000c1ea4111".into(),
        ethereum_http_rpc_url: "http://localhost:8545".into(),
        eip712_name: "4micaClearingHouse".into(),
        eip712_version: "1".into(),
        chain_id: 1337,
        supported_payment_payload_versions: vec![1],
        core_domain_separator: String::new(),
        validators: vec![
            "eip155:84532:0x1111111111111111111111111111111111111111".into(),
            "https://validator.acme.io/checks".into(),
        ],
    };

    let router = Router::new().route(
        "/core/public-params",
        get({
            let params = params.clone();
            move || {
                let params = params.clone();
                async move { Json(params) }
            }
        }),
    );
    let Ok((base, handle)) = spawn_router(router).await else {
        eprintln!("skipping test: failed to bind local port");
        return;
    };

    let proxy = RpcProxy::new(&base).expect("create proxy");
    let got = proxy.get_public_params().await.expect("get params");
    assert_eq!(got.chain_id, 1337);
    assert_eq!(got.contract_address, params.contract_address);
    assert_eq!(got.clearing_house_address, params.clearing_house_address);
    assert_eq!(got.guarantee_signer, params.guarantee_signer);
    assert_eq!(got.supported_payment_payload_versions, vec![1]);
    assert_eq!(got.validators, params.validators);

    handle.abort();
}

#[tokio::test]
#[serial_test::file_serial]
async fn rpc_proxy_surfaces_api_errors() {
    let router = Router::new().route(
        "/core/public-params",
        get(|| async {
            (
                axum::http::StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid request"})),
            )
        }),
    );
    let Ok((base, handle)) = spawn_router(router).await else {
        eprintln!("skipping test: failed to bind local port");
        return;
    };

    let proxy = RpcProxy::new(&base).expect("create proxy");
    let err = proxy
        .get_public_params()
        .await
        .expect_err("expected API error");
    match err {
        rpc::ApiClientError::Api {
            status, message, ..
        } => {
            assert_eq!(status, axum::http::StatusCode::BAD_REQUEST);
            assert!(
                message.contains("invalid request"),
                "unexpected message: {message}"
            );
        }
        other => panic!("unexpected error: {other:?}"),
    }

    handle.abort();
}

#[tokio::test]
#[serial_test::file_serial]
async fn rpc_proxy_returns_decode_error_on_invalid_json() {
    let router = Router::new().route(
        "/core/public-params",
        get(|| async { (axum::http::StatusCode::OK, "not-json") }),
    );
    let Ok((base, handle)) = spawn_router(router).await else {
        eprintln!("skipping test: failed to bind local port");
        return;
    };

    let proxy = RpcProxy::new(&base).expect("create proxy");
    let err = proxy
        .get_public_params()
        .await
        .expect_err("expected decode error");
    assert!(matches!(err, rpc::ApiClientError::Decode(_)));
    assert!(err.status().is_none());

    handle.abort();
}

fn build_validated_request() -> PaymentRequest {
    let payload = PaymentRequestPayload::new(
        "0x1234567890123456789012345678901234567890".to_string(),
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd".to_string(),
        B256::repeat_byte(0xcc),
        U256::from(3u64),
        U256::from(100u64),
        1_736_000_000,
        None,
        B256::repeat_byte(0x55),
    )
    .with_validation(ValidationRequirement {
        validator: "eip155:84532:0x1111111111111111111111111111111111111111".to_string(),
        subject: B256::repeat_byte(0x11),
        deadline: Some(1_736_003_600),
        params: vec![0x0a, 0x0b].into(),
    });

    PaymentRequest::new(payload, "0x1234".to_string())
}

/// The validation requirement and the blinding salt must survive the round trip intact: core
/// rebuilds the payer's commitment from them, and a dropped field would not verify.
#[tokio::test]
#[serial_test::file_serial]
async fn rpc_proxy_issue_guarantee_round_trip_validated_request() {
    let expected = build_validated_request();
    let guarantee =
        Guarantee::from_payment(&expected.payload, U256::from(0xccu64)).expect("valid addresses");
    let receipt = GuaranteeReceipt::new(&guarantee, "0xabcd".to_string());

    let router = Router::new().route(
        "/core/guarantees",
        axum::routing::post({
            let receipt = receipt.clone();
            let expected = expected.clone();
            move |Json(body): Json<PaymentRequest>| {
                let receipt = receipt.clone();
                let expected = expected.clone();
                async move {
                    assert_eq!(body.payload, expected.payload);
                    Json(receipt)
                }
            }
        }),
    );

    let Ok((base, handle)) = spawn_router(router).await else {
        eprintln!("skipping test: failed to bind local port");
        return;
    };

    let proxy = RpcProxy::new(&base).expect("create proxy");
    let got = proxy
        .issue_guarantee(expected.clone())
        .await
        .expect("issue guarantee");
    assert_eq!(got.receipt, receipt.receipt);
    assert_eq!(got.signature, receipt.signature);
    assert_eq!(got.guarantee().expect("decodes"), guarantee);

    handle.abort();
}
