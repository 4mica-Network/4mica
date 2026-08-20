use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use rpc::GUARANTEE_CLAIMS_VERSION;
use sdk_4mica::{Address, BLSCert, PaymentGuaranteeClaims, U256};
use serde::Serialize;
use serde_json::{Value, json};
use tower::ServiceExt;

use crate::exact::ExactService;
use crate::issuer::GuaranteeIssuer;
use crate::limits::{SponsorGuard, SponsorLimits};
use crate::verifier::CertificateValidator;
use crypto::bls::KeyMaterial;

use super::handlers::build_router;
use super::model::{
    PaymentRequirements, SettleRequest, SettleResponse, SupportedKind, VerifyRequest,
    VerifyResponse, X402PaymentPayload,
};
use super::state::{AppState, FourMicaHandler, SharedState, SponsorGuards, ValidationError};

#[tokio::test]
async fn verify_endpoint_accepts_valid_payload() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.is_valid);
    assert!(payload.certificate.is_none());
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_accepts_payload_without_top_level_version() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: None,
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.is_valid);
    assert!(payload.certificate.is_none());
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_accepts_duplicate_payloads() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    // First verification performs only preflight validation.
    let response = router
        .clone()
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.is_valid);
    assert!(payload.certificate.is_none());

    // Second verification with the same payload succeeds without calling downstream services.
    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.is_valid);
    assert!(payload.certificate.is_none());
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_endpoint_accepts_v2_payload() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
        payment_requirements: sample_requirements_v2("10"),
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.is_valid);
    assert!(payload.certificate.is_none());
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn settle_endpoint_returns_certificate() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: SettleResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.success);
    assert!(payload.certificate.is_some());
    assert!(payload.tx_hash.is_none());
    assert_eq!(payload.network_id.as_deref(), Some("eip155:11155111"));
    assert_eq!(verifier.verify_calls(), 1);
    assert_eq!(issuer.issue_calls(), 1);
}

#[tokio::test]
async fn settle_accepts_payload_without_top_level_version() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: None,
        payment_payload: payment_payload_v2("10"),
        payment_requirements: sample_requirements_v2("10"),
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: SettleResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.success);
    assert!(payload.certificate.is_some());
    assert!(payload.tx_hash.is_none());
    assert_eq!(payload.network_id.as_deref(), Some("eip155:11155111"));
    assert_eq!(verifier.verify_calls(), 1);
    assert_eq!(issuer.issue_calls(), 1);
}

#[tokio::test]
async fn settle_endpoint_accepts_v2_payload() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
        payment_requirements: sample_requirements_v2("10"),
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: SettleResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.success);
    assert!(payload.certificate.is_some());
    assert!(payload.tx_hash.is_none());
    assert_eq!(payload.network_id.as_deref(), Some("eip155:11155111"));
    assert_eq!(verifier.verify_calls(), 1);
    assert_eq!(issuer.issue_calls(), 1);
}

#[tokio::test]
async fn settle_endpoint_accepts_v2_payload_with_checksum_addresses() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
        payment_requirements: sample_requirements_v2("10"),
    };
    let mut request_json = serde_json::to_value(request_body).unwrap();
    request_json["paymentPayload"]["payload"]["claims"]["user_address"] =
        json!("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB");
    request_json["paymentPayload"]["payload"]["claims"]["recipient_address"] =
        json!("0x1111111111111111111111111111111111111111");
    request_json["paymentPayload"]["payload"]["claims"]["asset_address"] =
        json!("0x2222222222222222222222222222222222222222");

    let response = router
        .oneshot(post_json("/settle", &request_json))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: SettleResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.success);
    assert!(payload.certificate.is_some());
    assert_eq!(verifier.verify_calls(), 1);
    assert_eq!(issuer.issue_calls(), 1);
}

#[tokio::test]
async fn supported_endpoint_returns_configured_kind() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier, issuer);
    let router = build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/supported")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let kinds = payload["kinds"].as_array().expect("kinds array");
    assert!(
        kinds
            .iter()
            .any(|k| k["scheme"] == "4mica-credit" && k["network"] == "eip155:11155111")
    );
}

#[tokio::test]
async fn supported_includes_exact_when_available() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        verifier as Arc<dyn CertificateValidator>,
        issuer as Arc<dyn GuaranteeIssuer>,
        vec![TEST_VALIDATOR.into()],
    );
    let exact = Arc::new(MockExact::new());
    let state = AppState::new(
        vec![handler],
        Some(exact.clone() as Arc<dyn ExactService>),
        Vec::new(),
        Vec::new(),
        default_guards(),
    );
    let router = build_router(Arc::new(state));

    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/supported")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let kinds = payload["kinds"].as_array().expect("kinds array");
    assert_eq!(kinds.len(), 3);
    assert!(kinds.iter().any(|k| k["scheme"] == "4mica-credit"));
    assert!(kinds.iter().any(|k| k["scheme"] == "exact"));
}

#[tokio::test]
async fn supported_includes_v2_kind() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier, issuer);
    let router = build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/supported")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    let kinds = payload["kinds"].as_array().expect("kinds array");
    assert!(kinds.iter().any(|k| {
        k["scheme"] == "4mica-credit" && k["network"] == "eip155:11155111" && k["x402Version"] == 2
    }));
}

#[tokio::test]
async fn health_endpoint_returns_ok() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier, issuer);
    let router = build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["status"], "ok");
}

#[tokio::test]
async fn verify_rejects_mismatched_versions() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: Some(99),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(!payload.is_valid);
    let reason = payload.invalid_reason.expect("reason");
    assert!(reason.contains("does not match paymentPayload x402Version"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_rejects_mismatched_amount() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let mut requirements = sample_requirements();
    requirements.max_amount_required = "11".into();

    let request_body = VerifyRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: requirements,
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(!payload.is_valid);
    let reason = payload.invalid_reason.expect("reason");
    assert!(reason.contains("claim amount"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_rejects_v2_mismatched_amount() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
        payment_requirements: sample_requirements_v2("11"),
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(!payload.is_valid);
    let reason = payload.invalid_reason.expect("reason");
    assert!(reason.contains("claim amount"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}
/// A payer must not be able to hand a resource server a validation-gated guarantee when the
/// server asked for an ungated one — the server would be holding credit that is not payable until
/// some validator it never named approves it.
#[tokio::test]
async fn verify_rejects_validation_the_requirements_did_not_ask_for() {
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(Arc::new(MockVerifier::success()), issuer.clone());

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2_validated("10", TEST_VALIDATOR),
            payment_requirements: sample_requirements_v2("10"),
        },
    )
    .await;

    assert_rejected_because(&response, "requirements ask for no validation");
    assert_eq!(issuer.issue_calls(), 0);
}

/// The mirror case: the server gated the payment, the payer signed an ungated claim.
#[tokio::test]
async fn verify_rejects_missing_validation_the_requirements_asked_for() {
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(Arc::new(MockVerifier::success()), issuer.clone());

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2("10"),
            payment_requirements: requirements_gated_on(json!({
                "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT
            })),
        },
    )
    .await;

    assert_rejected_because(&response, "claims carry none");
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_rejects_mismatched_validator() {
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(Arc::new(MockVerifier::success()), issuer.clone());

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2_validated("10", TEST_VALIDATOR),
            payment_requirements: requirements_gated_on(json!({
                "validator": "https://other-validator.example", "subject": TEST_SUBJECT
            })),
        },
    )
    .await;

    assert_rejected_because(&response, "claim validator");
    assert_eq!(issuer.issue_calls(), 0);
}

/// Core rejects guarantees naming a validator outside its allowlist, so the facilitator declines
/// before spending a round trip on it. Requirement and claim agree here — only core disagrees.
#[tokio::test]
async fn verify_rejects_a_validator_core_has_not_whitelisted() {
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(Arc::new(MockVerifier::success()), issuer.clone());
    let rogue = "https://rogue-validator.example";

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2_validated("10", rogue),
            payment_requirements: requirements_gated_on(
                json!({ "validator": rogue, "subject": TEST_SUBJECT }),
            ),
        },
    )
    .await;

    assert_rejected_because(&response, "not whitelisted by core");
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_accepts_validation_matching_the_requirements() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2_validated("10", TEST_VALIDATOR),
            payment_requirements: requirements_gated_on(json!({
                "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT
            })),
        },
    )
    .await;

    assert!(response.is_valid, "reason: {:?}", response.invalid_reason);
}

/// A malformed `extra.validation` must be an error, never a fall-through to "ungated".
///
/// Every case here is paired with an *ungated* payload, so a parser that swallowed the error
/// would answer `isValid: true` — the silent downgrade this guards against. A server typo would
/// then hand out immediately-payable credit it meant to gate.
#[tokio::test]
async fn verify_rejects_malformed_validation_requirements() {
    let cases = [
        (json!(5), "extra.validation must be an object"),
        (
            json!({ "subject": TEST_SUBJECT }),
            "extra.validation.validator is required",
        ),
        (
            json!({ "validator": TEST_VALIDATOR }),
            "extra.validation.subject is required",
        ),
        (
            json!({ "validator": TEST_VALIDATOR, "subject": "0xdeadbeef" }),
            "subject must be a bytes32",
        ),
        (
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "deadline": "soon" }),
            "deadline must be a unix timestamp",
        ),
        (
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "params": 7 }),
            "params must be a hex string",
        ),
    ];

    for (validation, expected) in cases {
        let issuer = Arc::new(MockIssuer::success());
        let state = test_state(Arc::new(MockVerifier::success()), issuer.clone());

        let response = post_verify(
            state,
            &VerifyRequest {
                x402_version: Some(2),
                payment_payload: payment_payload_v2("10"),
                payment_requirements: requirements_gated_on(validation.clone()),
            },
        )
        .await;

        assert!(
            !response.is_valid,
            "malformed validation {validation} was silently accepted as ungated"
        );
        assert_rejected_because(&response, expected);
        assert_eq!(issuer.issue_calls(), 0);
    }
}

/// An explicit `null` is the one non-object `validation` that means "ungated" rather than
/// "malformed", so a server may null the field out without tripping the check above.
#[tokio::test]
async fn verify_treats_a_null_validation_requirement_as_ungated() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2("10"),
            payment_requirements: requirements_gated_on(Value::Null),
        },
    )
    .await;

    assert!(response.is_valid, "reason: {:?}", response.invalid_reason);
}

/// `deadline` and `params` are as much a part of the gate as the validator is: a payer who signs
/// a later deadline, or acceptance params the server never set, has agreed to different terms.
#[tokio::test]
async fn verify_rejects_a_validation_differing_only_in_deadline_or_params() {
    let cases = [
        (
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "deadline": 1_800_000_000u64 }),
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "deadline": 1_900_000_000u64 }),
            "deadline",
        ),
        (
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "params": "0xabcd" }),
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "params": "0xbeef" }),
            "params do not match",
        ),
        // A signed requirement that simply omits what the server asked for must fail too.
        (
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT, "deadline": 1_800_000_000u64 }),
            json!({ "validator": TEST_VALIDATOR, "subject": TEST_SUBJECT }),
            "deadline",
        ),
    ];

    for (required, signed, expected) in cases {
        let issuer = Arc::new(MockIssuer::success());
        let state = test_state(Arc::new(MockVerifier::success()), issuer.clone());

        let response = post_verify(
            state,
            &VerifyRequest {
                x402_version: Some(2),
                payment_payload: payment_payload_v2_inner("10", Some(signed.clone())),
                payment_requirements: requirements_gated_on(required.clone()),
            },
        )
        .await;

        assert!(
            !response.is_valid,
            "signed {signed} was accepted against required {required}"
        );
        assert_rejected_because(&response, expected);
        assert_eq!(issuer.issue_calls(), 0);
    }
}

/// The positive counterpart to the two tests above: with every optional field populated and
/// matching, verification passes — so those rejections are the comparison working, not the
/// fixture failing to parse.
#[tokio::test]
async fn verify_accepts_a_validation_matching_on_every_optional_field() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let validation = json!({
        "validator": TEST_VALIDATOR,
        "subject": TEST_SUBJECT,
        "deadline": 1_800_000_000u64,
        "params": "0xabcd"
    });

    let response = post_verify(
        state,
        &VerifyRequest {
            x402_version: Some(2),
            payment_payload: payment_payload_v2_inner("10", Some(validation.clone())),
            payment_requirements: requirements_gated_on(validation),
        },
    )
    .await;

    assert!(response.is_valid, "reason: {:?}", response.invalid_reason);
}

#[tokio::test]
async fn settle_propagates_issue_errors() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::failing());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["success"], false);
    assert!(payload["error"].as_str().unwrap().contains("issue failure"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 1);
}

#[tokio::test]
async fn settle_propagates_certificate_errors() {
    let verifier = Arc::new(MockVerifier::failing());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["error"].as_str(), Some("verify failure"));
    assert_eq!(verifier.verify_calls(), 1);
    assert_eq!(issuer.issue_calls(), 1);
}

#[tokio::test]
async fn settle_rejects_mismatched_versions() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(99),
        payment_payload: payment_payload_v1("10"),
        payment_requirements: sample_requirements(),
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["success"], false);
    assert!(
        payload["error"]
            .as_str()
            .unwrap()
            .contains("does not match paymentPayload x402Version")
    );
    assert!(payload["certificate"].is_null());
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

/// x402Version lives in the payload's type (`X402Version<N>`), so a version outside {1, 2} cannot
/// even be deserialized — it is rejected before any handler sees it.
#[tokio::test]
async fn settle_rejects_an_out_of_range_x402_version() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let mut body = serde_json::to_value(SettleRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
        payment_requirements: sample_requirements_v2("10"),
    })
    .expect("serialize settle request");
    body["paymentPayload"]["x402Version"] = json!(3);

    let response = router.oneshot(post_json("/settle", &body)).await.unwrap();

    assert!(
        response.status().is_client_error(),
        "expected a client error, got {}",
        response.status()
    );
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

fn default_guards() -> SponsorGuards {
    SponsorGuards {
        deposit: SponsorGuard::new(SponsorLimits::default()),
        withdraw: SponsorGuard::new(SponsorLimits::default()),
        claim: SponsorGuard::new(SponsorLimits::default()),
        pay: SponsorGuard::new(SponsorLimits::default()),
    }
}

fn test_state(verifier: Arc<MockVerifier>, issuer: Arc<MockIssuer>) -> SharedState {
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        verifier.clone() as Arc<dyn CertificateValidator>,
        issuer.clone() as Arc<dyn GuaranteeIssuer>,
        vec![TEST_VALIDATOR.into()],
    );
    Arc::new(AppState::new(
        vec![handler],
        None,
        Vec::new(),
        Vec::new(),
        default_guards(),
    ))
}

// ── gasless deposit ─────────────────────────────────────────────────────────
//
// These cover the paths that resolve before any chain access. Everything past that point —
// signature recovery, balance, simulation — needs a live node and belongs in the anvil-backed
// e2e suite; `deposit.rs`'s own unit tests cover the digest and recovery arithmetic.

fn deposit_body(asset_transfer_method: Option<&str>) -> Value {
    let mut body = json!({
        "asset": "0x2222222222222222222222222222222222222222",
        "amount": "1000000",
        "authorization": {
            "from": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "validAfter": "0x0",
            "validBefore": "0x77359400",
            "nonce": "0x4242424242424242424242424242424242424242424242424242424242424242",
            "v": 27,
            "r": "0x1111111111111111111111111111111111111111111111111111111111111111",
            "s": "0x2222222222222222222222222222222222222222222222222222222222222222"
        }
    });
    if let Some(method) = asset_transfer_method {
        body["assetTransferMethod"] = json!(method);
    }
    body
}

// ── gasless withdrawal ──────────────────────────────────────────────────────
//
// Same scope as the deposit handler tests: everything up to the first chain access. Signature
// recovery, the nonce check and the simulation need a live node and belong in the e2e suite;
// `withdraw.rs`'s own unit tests cover the window arithmetic and the dedup key.

fn withdraw_request_body() -> Value {
    json!({
        "action": "request",
        "authorization": {
            "user": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "asset": "0x2222222222222222222222222222222222222222",
            "amount": "1000000",
            "validAfter": "0x0",
            "validBefore": "0x77359400",
            "nonce": "0x4242424242424242424242424242424242424242424242424242424242424242",
            "signature": "0x111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b"
        }
    })
}

fn withdraw_finalize_body() -> Value {
    json!({
        "action": "finalize",
        "user": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "asset": "0x2222222222222222222222222222222222222222"
    })
}

/// Every action must resolve to the same clear code on a facilitator that sponsors nothing, rather
/// than 404 or a panic.
#[tokio::test]
async fn every_withdraw_action_reports_a_missing_relayer() {
    for body in [
        withdraw_request_body(),
        json!({
            "action": "cancel",
            "authorization": {
                "user": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "asset": "0x2222222222222222222222222222222222222222",
                "validAfter": "0x0",
                "validBefore": "0x77359400",
                "nonce": "0x4343434343434343434343434343434343434343434343434343434343434343",
                "signature": "0x111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222221b"
            }
        }),
        withdraw_finalize_body(),
    ] {
        let router = build_router(test_state(
            Arc::new(MockVerifier::success()),
            Arc::new(MockIssuer::success()),
        ));

        let response = router.oneshot(post_json("/withdraw", &body)).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let payload: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap())
                .unwrap();
        assert_eq!(payload["success"], false, "for {body}");
        assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED", "for {body}");
    }
}

#[tokio::test]
async fn withdraw_verify_reports_a_missing_relayer() {
    let router = build_router(test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    ));

    let response = router
        .oneshot(post_json("/withdraw/verify", &withdraw_request_body()))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["isValid"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

/// An unrecognised `action` must be refused outright rather than silently defaulting to one.
#[tokio::test]
async fn withdraw_rejects_an_unknown_action() {
    let router = build_router(test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    ));

    let response = router
        .oneshot(post_json(
            "/withdraw",
            &json!({ "action": "liquidate", "user": "0x0", "asset": "0x0" }),
        ))
        .await
        .unwrap();

    assert_ne!(response.status(), StatusCode::OK);
}

/// The withdrawal budget is separate from the deposit one, so exhausting deposits must leave
/// withdrawals usable — a burst of one action cannot strand the other.
#[tokio::test]
async fn withdrawals_have_their_own_rate_limit_budget() {
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        Arc::new(MockVerifier::success()) as Arc<dyn CertificateValidator>,
        Arc::new(MockIssuer::success()) as Arc<dyn GuaranteeIssuer>,
        Vec::new(),
    );
    let deposit_guard = SponsorGuard::new(SponsorLimits {
        global_limit: 1,
        ..SponsorLimits::default()
    });
    let state = Arc::new(AppState::new(
        vec![handler],
        None,
        Vec::new(),
        Vec::new(),
        SponsorGuards {
            deposit: deposit_guard,
            ..default_guards()
        },
    ));

    // Exhaust the deposit budget.
    for _ in 0..2 {
        build_router(Arc::clone(&state))
            .oneshot(post_json("/deposit", &deposit_body(None)))
            .await
            .unwrap();
    }

    let response = build_router(Arc::clone(&state))
        .oneshot(post_json("/withdraw", &withdraw_request_body()))
        .await
        .unwrap();
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_ne!(
        payload["errorCode"], "RATE_LIMITED",
        "deposits must not consume the withdrawal budget"
    );
}

/// The counters are reported per action, so an operator can tell which one is being abused.
#[tokio::test]
async fn health_reports_withdrawal_counters_separately() {
    let relayerless = build_router(test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    ));
    let response = relayerless
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();

    // No relayers means neither set of counters is meaningful, so both are omitted rather than
    // reported as zero — the same rule `deposits` already follows.
    assert!(payload.get("deposits").is_none());
    assert!(payload.get("withdrawals").is_none());
    assert!(payload.get("claims").is_none());
}

/// A facilitator with no relayer is a supported deployment, so `/deposit` must answer with a clear
/// code rather than 404 or a panic.
#[tokio::test]
async fn deposit_reports_a_missing_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let router = build_router(state);

    let response = router
        .oneshot(post_json("/deposit", &deposit_body(None)))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

#[tokio::test]
async fn deposit_verify_reports_a_missing_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let router = build_router(state);

    let response = router
        .oneshot(post_json("/deposit/verify", &deposit_body(None)))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["isValid"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

/// The global limit must engage before any relayer or chain work, so it protects a facilitator
/// that has no relayer at all — and, more importantly, protects the RPC quota of one that does.
#[tokio::test]
async fn deposit_is_rate_limited_globally() {
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        Arc::new(MockVerifier::success()) as Arc<dyn CertificateValidator>,
        Arc::new(MockIssuer::success()) as Arc<dyn GuaranteeIssuer>,
        vec![TEST_VALIDATOR.into()],
    );
    let limits = SponsorLimits {
        global_limit: 2,
        ..SponsorLimits::default()
    };
    let state = Arc::new(AppState::new(
        vec![handler],
        None,
        Vec::new(),
        Vec::new(),
        SponsorGuards {
            deposit: SponsorGuard::new(limits),
            ..default_guards()
        },
    ));
    let router = build_router(state);

    let mut codes = Vec::new();
    for _ in 0..3 {
        let response = router
            .clone()
            .oneshot(post_json("/deposit", &deposit_body(None)))
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        codes.push(
            payload["errorCode"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
        );
    }

    // First two get as far as the relayer lookup; the third is turned away by the limiter.
    assert_eq!(codes[0], "NO_RELAYER_CONFIGURED");
    assert_eq!(codes[1], "NO_RELAYER_CONFIGURED");
    assert_eq!(codes[2], "RATE_LIMITED");
}

/// Throttling is transient and a client should retry; a malformed request never becomes valid.
#[tokio::test]
async fn deposit_marks_throttling_as_retryable() {
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        Arc::new(MockVerifier::success()) as Arc<dyn CertificateValidator>,
        Arc::new(MockIssuer::success()) as Arc<dyn GuaranteeIssuer>,
        vec![TEST_VALIDATOR.into()],
    );
    let limits = SponsorLimits {
        global_limit: 1,
        ..SponsorLimits::default()
    };
    let state = Arc::new(AppState::new(
        vec![handler],
        None,
        Vec::new(),
        Vec::new(),
        SponsorGuards {
            deposit: SponsorGuard::new(limits),
            ..default_guards()
        },
    ));
    let router = build_router(state);

    let _first = router
        .clone()
        .oneshot(post_json("/deposit", &deposit_body(None)))
        .await
        .unwrap();
    let response = router
        .oneshot(post_json("/deposit", &deposit_body(None)))
        .await
        .unwrap();

    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["errorCode"], "RATE_LIMITED");
    assert_eq!(payload["retryable"], true);
}

/// Existing monitoring checks `status == "ok"`, so the enriched payload must stay a superset of
/// the old one. With no relayer there is nothing to report and the extra fields are omitted.
#[tokio::test]
async fn health_stays_backward_compatible_without_a_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let router = build_router(state);

    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["status"], "ok");
    assert!(payload.get("relayers").is_none());
    assert!(payload.get("deposits").is_none());
}

/// Rejections must be counted, and throttling counted twice — once as a rejection, once as
/// throttling. `throttled` rising on its own is what distinguishes abuse from a broken client.
#[tokio::test]
async fn throttled_deposits_are_counted_separately_from_other_rejections() {
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        Arc::new(MockVerifier::success()) as Arc<dyn CertificateValidator>,
        Arc::new(MockIssuer::success()) as Arc<dyn GuaranteeIssuer>,
        vec![TEST_VALIDATOR.into()],
    );
    let guard = SponsorGuard::new(SponsorLimits {
        global_limit: 2,
        ..SponsorLimits::default()
    });
    let state = Arc::new(AppState::new(
        vec![handler],
        None,
        Vec::new(),
        Vec::new(),
        SponsorGuards {
            deposit: Arc::clone(&guard),
            ..default_guards()
        },
    ));
    let router = build_router(state);

    // Two get through the global limit and fail on the missing relayer; the third is throttled.
    for _ in 0..3 {
        let _ = router
            .clone()
            .oneshot(post_json("/deposit", &deposit_body(None)))
            .await
            .unwrap();
    }

    let counters = guard.counters();
    assert_eq!(counters.sponsored, 0);
    assert_eq!(counters.rejected, 3, "every refusal counts as a rejection");
    assert_eq!(
        counters.throttled, 1,
        "only the rate-limited one counts as throttled"
    );
}

/// A missing Permit2 approval must come back with enough structure to act on. The EIP-2612 nonce
/// is the only value a chain-free client cannot derive for itself, so omitting it would force
/// every SDK into an `eth_call` — defeating the point of the facilitator.
#[tokio::test]
async fn permit2_allowance_error_carries_the_fix() {
    use crate::deposit::DepositError;

    let err =
        DepositError::Permit2AllowanceRequired(Box::new(crate::deposit::Permit2AllowanceDetails {
            from: Address::repeat_byte(0xbb),
            asset: Address::repeat_byte(0x22),
            spender: sdk_4mica::contract::PERMIT2_ADDRESS,
            allowance: U256::ZERO,
            required: U256::from(1_000u64),
            eip2612_nonce: Some(U256::from(7u64)),
        }));

    let response = serde_json::to_value(super::model::DepositResponse::failure(&err))
        .expect("serialize failure");
    assert_eq!(response["errorCode"], "PERMIT2_ALLOWANCE_REQUIRED");
    assert_eq!(
        response["permit2Allowance"]["spender"],
        "0x000000000022d473030f116ddee9f6b43ac78ba3"
    );
    assert_eq!(response["permit2Allowance"]["allowance"], "0");
    assert_eq!(response["permit2Allowance"]["required"], "1000");
    assert_eq!(response["permit2Allowance"]["eip2612Nonce"], "7");
}

/// A token without EIP-2612 cannot have its approval sponsored, and the absent nonce is how a
/// client learns that — it must fall back to an on-chain approve rather than signing a permit.
#[tokio::test]
async fn permit2_allowance_error_omits_the_nonce_for_a_non_2612_token() {
    use crate::deposit::DepositError;

    let err =
        DepositError::Permit2AllowanceRequired(Box::new(crate::deposit::Permit2AllowanceDetails {
            from: Address::repeat_byte(0xbb),
            asset: Address::repeat_byte(0x22),
            spender: sdk_4mica::contract::PERMIT2_ADDRESS,
            allowance: U256::ZERO,
            required: U256::from(1_000u64),
            eip2612_nonce: None,
        }));

    let response = serde_json::to_value(super::model::DepositResponse::failure(&err))
        .expect("serialize failure");
    assert!(response["permit2Allowance"].is_object());
    assert!(
        response["permit2Allowance"].get("eip2612Nonce").is_none(),
        "an absent nonce must be omitted, not null: {response}"
    );
}

/// Errors with no structured detail must not grow an empty object.
#[tokio::test]
async fn other_errors_carry_no_permit2_detail() {
    use crate::deposit::DepositError;

    let response = serde_json::to_value(super::model::DepositResponse::failure(
        &DepositError::RateLimited,
    ))
    .expect("serialize failure");
    assert_eq!(response["errorCode"], "RATE_LIMITED");
    assert!(response.get("permit2Allowance").is_none());
}

/// An unparseable `ReceiveAuthorization` must not reach a handler at all — serde rejects it.
#[tokio::test]
async fn deposit_rejects_a_malformed_authorization() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let router = build_router(state);

    let mut body = deposit_body(None);
    body["authorization"]["nonce"] = json!("not-a-bytes32");

    let response = router.oneshot(post_json("/deposit", &body)).await.unwrap();
    assert!(
        response.status().is_client_error(),
        "expected a client error, got {}",
        response.status()
    );
}

/// The wire contract accepts a `ReceiveAuthorization` exactly as `sdk-4mica` serializes it, so the
/// SDK can post the struct it signed without an intermediate DTO. Guards against a field-name or
/// hex-encoding drift between the two crates.
#[test]
fn deposit_request_accepts_an_sdk_serialized_authorization() {
    use sdk_4mica::contract::Core4Mica::ReceiveAuthorization;

    let authorization = ReceiveAuthorization {
        from: Address::from_slice(&[0xbb; 20]),
        validAfter: U256::ZERO,
        validBefore: U256::from(2_000_000_000u64),
        nonce: alloy::primitives::B256::repeat_byte(0x42),
        v: 27,
        r: alloy::primitives::B256::repeat_byte(0x11),
        s: alloy::primitives::B256::repeat_byte(0x22),
    };

    let body = json!({
        "asset": "0x2222222222222222222222222222222222222222",
        "amount": "1000000",
        "authorization": serde_json::to_value(&authorization).expect("serialize authorization"),
    });

    let parsed: super::model::DepositRequest =
        serde_json::from_value(body).expect("SDK-serialized authorization must round-trip");
    let parsed_auth = parsed.authorization.expect("eip3009 authorization");
    assert_eq!(parsed_auth.from, authorization.from);
    assert_eq!(parsed_auth.nonce, authorization.nonce);
    assert_eq!(parsed_auth.validBefore, authorization.validBefore);
}

// ── sponsored net-credit claims ─────────────────────────────────────────────
//
// These cover what resolves before core or the chain is consulted. Everything past that —
// resolving terms from core, simulation, broadcast — needs the live stack.

fn claim_body() -> Value {
    json!({
        "cycleId": "eth:1800000000",
        "creditor": "0x000000000000000000000000000000000000c0ed",
    })
}

#[tokio::test]
async fn claim_reports_a_missing_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );

    let response = build_router(state)
        .oneshot(post_json("/clearing/claim", &claim_body()))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

#[tokio::test]
async fn claim_verify_reports_a_missing_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );

    let response = build_router(state)
        .oneshot(post_json("/clearing/claim/verify", &claim_body()))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["isValid"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

/// The request's own identifiers are checked before any relayer or core work, so a bad one gets a
/// precise code even on a facilitator that sponsors nothing.
#[tokio::test]
async fn claim_rejects_a_malformed_creditor() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let mut body = claim_body();
    body["creditor"] = json!("not-an-address");

    let response = build_router(state)
        .oneshot(post_json("/clearing/claim", &body))
        .await
        .unwrap();

    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["errorCode"], "INVALID_REQUEST");
}

#[tokio::test]
async fn claim_rejects_a_cycle_id_that_could_escape_its_url() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let mut body = claim_body();
    body["cycleId"] = json!("../participants/0xdead/clearing-action");

    let response = build_router(state)
        .oneshot(post_json("/clearing/claim", &body))
        .await
        .unwrap();

    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["errorCode"], "INVALID_REQUEST");
}

// ── sponsored net-debit payments ────────────────────────────────────────────
//
// Same coverage boundary as the claim tests: what resolves before core or the chain is consulted.

fn pay_body() -> Value {
    json!({
        "cycleId": "eth:1800000000",
        "authorization": {
            "from": "0x000000000000000000000000000000000000debb",
            "validAfter": "0",
            "validBefore": "2000000000",
            "nonce": format!("0x{}", "aa".repeat(32)),
            "v": 27,
            "r": format!("0x{}", "11".repeat(32)),
            "s": format!("0x{}", "22".repeat(32)),
        },
    })
}

#[tokio::test]
async fn pay_reports_a_missing_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );

    let response = build_router(state)
        .oneshot(post_json("/clearing/pay", &pay_body()))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

#[tokio::test]
async fn pay_verify_reports_a_missing_relayer() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );

    let response = build_router(state)
        .oneshot(post_json("/clearing/pay/verify", &pay_body()))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["isValid"], false);
    assert_eq!(payload["errorCode"], "NO_RELAYER_CONFIGURED");
}

#[tokio::test]
async fn pay_rejects_a_cycle_id_that_could_escape_its_url() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let mut body = pay_body();
    body["cycleId"] = json!("../participants/0xdead/clearing-action");

    let response = build_router(state)
        .oneshot(post_json("/clearing/pay", &body))
        .await
        .unwrap();

    let payload: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["errorCode"], "INVALID_REQUEST");
}

/// The debtor is `authorization.from` — a request with no authorization at all cannot name one, so
/// it is refused by deserialization rather than defaulted.
#[tokio::test]
async fn pay_requires_an_authorization() {
    let state = test_state(
        Arc::new(MockVerifier::success()),
        Arc::new(MockIssuer::success()),
    );
    let body = json!({ "cycleId": "eth:1800000000" });

    let response = build_router(state)
        .oneshot(post_json("/clearing/pay", &body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

/// POSTs a `/verify` request against a fresh router and decodes the response.
///
/// `/verify` answers `200 OK` with `isValid: false` for business-rule rejections, so almost every
/// test here asserts on the body rather than the status. Collapsing that into one helper keeps the
/// interesting part of a test — the fixture and the expected reason — on screen.
async fn post_verify(state: SharedState, request: &VerifyRequest) -> VerifyResponse {
    let response = build_router(state)
        .oneshot(post_json("/verify", request))
        .await
        .expect("router response");
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read body");
    serde_json::from_slice(&body).expect("decode VerifyResponse")
}

/// Asserts `/verify` rejected the request, and that the reason names the actual cause rather than
/// some unrelated earlier check firing first.
#[track_caller]
fn assert_rejected_because(response: &VerifyResponse, expected: &str) {
    assert!(
        !response.is_valid,
        "expected a rejection mentioning {expected:?}, but the request was accepted"
    );
    let reason = response
        .invalid_reason
        .as_deref()
        .expect("a rejection must carry a reason");
    assert!(
        reason.contains(expected),
        "expected reason to contain {expected:?}, got: {reason}"
    );
}

fn exact_state(exact: Arc<MockExact>) -> SharedState {
    let exact_service: Arc<dyn ExactService> = exact;
    Arc::new(AppState::new(
        Vec::new(),
        Some(exact_service),
        Vec::new(),
        Vec::new(),
        default_guards(),
    ))
}

fn sample_requirements() -> PaymentRequirements {
    PaymentRequirements {
        scheme: "4mica-credit".into(),
        network: "eip155:11155111".into(),
        max_amount_required: "10".into(),
        amount: None,
        resource: None,
        description: None,
        mime_type: None,
        output_schema: None,
        pay_to: format!("{:#x}", recipient_address()),
        max_timeout_seconds: None,
        asset: format!("{:#x}", asset_address()),
        extra: Some(json!({
            "tabId": "0x1",
            "userAddress": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        })),
    }
}

/// x402 v2 requirements with no validation gate.
///
/// `extra` deliberately carries an unrelated key: "extra is present but has no `validation`" must
/// read as ungated, not as malformed. Resource servers really do put other things here.
fn sample_requirements_v2(amount: &str) -> PaymentRequirements {
    PaymentRequirements {
        scheme: "4mica-credit".into(),
        network: "eip155:11155111".into(),
        max_amount_required: "".into(),
        amount: Some(amount.into()),
        resource: None,
        description: None,
        mime_type: None,
        output_schema: None,
        pay_to: format!("{:#x}", recipient_address()),
        max_timeout_seconds: None,
        asset: format!("{:#x}", asset_address()),
        extra: Some(json!({ "tabEndpoint": "https://core.example/tab" })),
    }
}

/// [`sample_requirements_v2`] for 10 units, gated on `validation` — which may be any JSON, so the
/// malformed cases share this fixture with the well-formed ones.
fn requirements_gated_on(validation: Value) -> PaymentRequirements {
    let mut reqs = sample_requirements_v2("10");
    reqs.extra = Some(json!({
        "tabEndpoint": "https://core.example/tab",
        "validation": validation,
    }));
    reqs
}

fn payment_payload_v1(amount: &str) -> X402PaymentPayload {
    payment_payload_v1_with_scheme("4mica-credit", "eip155:11155111", amount)
}

fn payment_payload_v1_with_scheme(scheme: &str, network: &str, amount: &str) -> X402PaymentPayload {
    let recipient = format!("{:#x}", recipient_address());
    let asset = format!("{:#x}", asset_address());
    let value = json!({
        "x402Version": 1,
        "scheme": scheme,
        "network": network,
        "payload": {
            "claims": {
                "version": "v1",
                "user_address": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "recipient_address": recipient,
                "req_id": "0x0",
                "amount": amount,
                "asset_address": asset,
                "timestamp": 1
            },
            "signature": "0x1111",
            "scheme": "eip712"
        }
    });

    serde_json::from_value(value).expect("failed to deserialize payment payload v1")
}

/// Validator identity used across the validation-gated fixtures. A URL rather than an address —
/// core whitelists validators by identity string, not by contract address.
const TEST_VALIDATOR: &str = "https://validator.example";
const TEST_SUBJECT: &str = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

fn payment_payload_v2(amount: &str) -> X402PaymentPayload {
    payment_payload_v2_inner(amount, None)
}

/// x402 v2 envelope whose claims are gated on a validation requirement.
fn payment_payload_v2_validated(amount: &str, validator: &str) -> X402PaymentPayload {
    payment_payload_v2_inner(
        amount,
        Some(json!({ "validator": validator, "subject": TEST_SUBJECT })),
    )
}

/// The x402 version lives in the envelope; the claims inside are always at the current guarantee
/// claims version, with validation an optional field rather than a separate claims variant.
fn payment_payload_v2_inner(amount: &str, validation: Option<Value>) -> X402PaymentPayload {
    let recipient = format!("{:#x}", recipient_address());
    let asset = format!("{:#x}", asset_address());
    let user = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    let mut claims = json!({
        "version": "v1",
        "user_address": user,
        "recipient_address": recipient,
        "req_id": "0x0",
        "amount": amount,
        "asset_address": asset,
        "timestamp": 1
    });
    if let Some(validation) = validation {
        claims["validation"] = validation;
    }

    let value = json!({
        "x402Version": 2,
        "accepted": {
            "scheme": "4mica-credit",
            "network": "eip155:11155111",
            "amount": amount,
            "payTo": recipient,
            "asset": asset
        },
        "payload": {
            "claims": claims,
            "signature": "0x1111",
            "scheme": "eip712"
        }
    });

    serde_json::from_value(value).expect("failed to deserialize payment payload v2")
}

fn post_json<T: Serialize>(uri: &str, payload: &T) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(payload).unwrap()))
        .unwrap()
}

fn recipient_address() -> Address {
    Address::from_slice(&[0x11; 20])
}

fn asset_address() -> Address {
    Address::from_slice(&[0x22; 20])
}

fn sample_claims() -> PaymentGuaranteeClaims {
    PaymentGuaranteeClaims {
        domain: [0u8; 32],
        user_address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into(),
        recipient_address: format!("{:#x}", recipient_address()),
        cycle_id: U256::from(1),
        req_id: U256::ZERO,
        amount: U256::from(10),
        asset_address: format!("{:#x}", asset_address()),
        timestamp: 1,
        version: GUARANTEE_CLAIMS_VERSION,
    }
}

struct MockExact {
    verify_calls: AtomicUsize,
    settle_calls: AtomicUsize,
}

impl MockExact {
    fn new() -> Self {
        Self {
            verify_calls: AtomicUsize::new(0),
            settle_calls: AtomicUsize::new(0),
        }
    }

    fn verify_calls(&self) -> usize {
        self.verify_calls.load(Ordering::SeqCst)
    }

    fn settle_calls(&self) -> usize {
        self.settle_calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl ExactService for MockExact {
    async fn verify(&self, _: &VerifyRequest) -> Result<VerifyResponse, ValidationError> {
        self.verify_calls.fetch_add(1, Ordering::SeqCst);
        Ok(VerifyResponse {
            is_valid: true,
            invalid_reason: None,
            certificate: None,
        })
    }

    async fn settle(&self, _: &SettleRequest) -> Result<SettleResponse, ValidationError> {
        self.settle_calls.fetch_add(1, Ordering::SeqCst);
        Ok(SettleResponse::from_exact(
            true,
            None,
            Some("0xdeadbeef".into()),
            "base".into(),
        ))
    }

    async fn supported(&self) -> Result<Vec<SupportedKind>, ValidationError> {
        Ok(vec![SupportedKind {
            scheme: "exact".into(),
            network: "base".into(),
            x402_version: Some(1),
            extra: None,
        }])
    }
}

#[tokio::test]
async fn verify_routes_to_exact_service() {
    let exact = Arc::new(MockExact::new());
    let state = exact_state(exact.clone());
    let router = build_router(state);

    let request_body = VerifyRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1_with_scheme("exact", "base", "10"),
        payment_requirements: PaymentRequirements {
            scheme: "exact".into(),
            network: "base".into(),
            max_amount_required: "1000".into(),
            amount: None,
            resource: None,
            description: None,
            mime_type: None,
            output_schema: None,
            pay_to: "0x8288d9C5d18FFB9f78C1B9Ce3F96F8C75d2a29f8".into(),
            max_timeout_seconds: Some(30),
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".into(),
            extra: None,
        },
    };

    let response = router
        .oneshot(post_json("/verify", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: VerifyResponse = serde_json::from_slice(&body).unwrap();
    assert!(payload.is_valid);
    assert!(payload.certificate.is_none());
    assert_eq!(exact.verify_calls(), 1);
}

#[tokio::test]
async fn settle_routes_to_exact_service() {
    let exact = Arc::new(MockExact::new());
    let state = exact_state(exact.clone());
    let router = build_router(state);

    let request_body = SettleRequest {
        x402_version: Some(1),
        payment_payload: payment_payload_v1_with_scheme("exact", "base", "10"),
        payment_requirements: PaymentRequirements {
            scheme: "exact".into(),
            network: "base".into(),
            max_amount_required: "1000".into(),
            amount: None,
            resource: None,
            description: None,
            mime_type: None,
            output_schema: None,
            pay_to: "0x8288d9C5d18FFB9f78C1B9Ce3F96F8C75d2a29f8".into(),
            max_timeout_seconds: Some(30),
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".into(),
            extra: None,
        },
    };

    let response = router
        .oneshot(post_json("/settle", &request_body))
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["success"], true);
    assert_eq!(payload["txHash"], "0xdeadbeef");
    assert!(payload["certificate"].is_null());
    assert_eq!(exact.settle_calls(), 1);
}

struct MockVerifier {
    claims: PaymentGuaranteeClaims,
    fail: bool,
    verify_calls: AtomicUsize,
}

impl MockVerifier {
    fn success() -> Self {
        Self::with_claims(sample_claims())
    }

    fn with_claims(claims: PaymentGuaranteeClaims) -> Self {
        Self {
            claims,
            fail: false,
            verify_calls: AtomicUsize::new(0),
        }
    }

    fn failing() -> Self {
        Self {
            claims: sample_claims(),
            fail: true,
            verify_calls: AtomicUsize::new(0),
        }
    }

    fn verify_calls(&self) -> usize {
        self.verify_calls.load(Ordering::SeqCst)
    }
}

impl CertificateValidator for MockVerifier {
    fn verify_certificate(&self, _cert: &BLSCert) -> Result<PaymentGuaranteeClaims, String> {
        self.verify_calls.fetch_add(1, Ordering::SeqCst);
        if self.fail {
            Err("verify failure".into())
        } else {
            Ok(self.claims.clone())
        }
    }
}

struct MockIssuer {
    certificate: BLSCert,
    fail: bool,
    issue_calls: AtomicUsize,
}

fn dummy_cert() -> BLSCert {
    let key =
        KeyMaterial::from_bytes(crypto::bls::Zeroizing::new(vec![1u8; 32])).expect("secret key");
    BLSCert::sign(&key, vec![0u8].into()).expect("sign cert")
}

impl MockIssuer {
    fn success() -> Self {
        Self {
            certificate: dummy_cert(),
            fail: false,
            issue_calls: AtomicUsize::new(0),
        }
    }

    fn failing() -> Self {
        Self {
            certificate: dummy_cert(),
            fail: true,
            issue_calls: AtomicUsize::new(0),
        }
    }

    fn issue_calls(&self) -> usize {
        self.issue_calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl GuaranteeIssuer for MockIssuer {
    async fn issue(
        &self,
        _claims: rpc::PaymentGuaranteeRequestClaims,
        _signature: String,
        _scheme: sdk_4mica::SigningScheme,
    ) -> Result<BLSCert, String> {
        self.issue_calls.fetch_add(1, Ordering::SeqCst);
        if self.fail {
            Err("issue failure".into())
        } else {
            Ok(self.certificate.clone())
        }
    }
}
