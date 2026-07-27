use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use rpc::{
    PaymentGuaranteeValidationPolicyV2, compute_validation_request_hash,
    compute_validation_subject_hash,
};
use sdk_4mica::{Address, BLSCert, PaymentGuaranteeClaims, U256};
use serde::Serialize;
use serde_json::{Value, json};
use tower::ServiceExt;

use crate::exact::ExactService;
use crate::issuer::GuaranteeIssuer;
use crate::verifier::CertificateValidator;
use crypto::bls::KeyMaterial;

use super::handlers::build_router;
use super::model::{
    PaymentRequirements, SettleRequest, SettleResponse, SupportedKind, VerifyRequest,
    VerifyResponse, X402PaymentPayload,
};
use super::state::{AppState, FourMicaHandler, SharedState, ValidationError};

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
    let verifier = Arc::new(MockVerifier::success_v2());
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
    let verifier = Arc::new(MockVerifier::success_v2());
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
    let verifier = Arc::new(MockVerifier::success_v2());
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
    let verifier = Arc::new(MockVerifier::success_v2());
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
        vec![1, 2],
        vec!["0x3333333333333333333333333333333333333333".into()],
    );
    let exact = Arc::new(MockExact::new());
    let state = AppState::new(vec![handler], Some(exact.clone() as Arc<dyn ExactService>));
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
async fn supported_omits_v2_when_handler_only_accepts_v1() {
    let verifier = Arc::new(MockVerifier::success());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state_with_versions(verifier, issuer, vec![1]);
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
        k["scheme"] == "4mica-credit" && k["network"] == "eip155:11155111" && k["x402Version"] == 1
    }));
    assert!(!kinds.iter().any(|k| {
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
    let verifier = Arc::new(MockVerifier::success_v2());
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

#[tokio::test]
async fn verify_rejects_v2_missing_validation_policy_requirements() {
    let verifier = Arc::new(MockVerifier::success_v2());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let mut requirements = sample_requirements_v2("10");
    requirements.extra = Some(json!({
        "validationRegistryAddress": "0x3333333333333333333333333333333333333333",
        "validatorAddress": "0x4444444444444444444444444444444444444444",
        "validatorAgentId": "0x7",
        "minValidationScore": 80,
        "requiredValidationTag": "hard-finality"
    }));

    let request_body = VerifyRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
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
    assert!(reason.contains("jobHash"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_rejects_v2_mismatched_validator() {
    let verifier = Arc::new(MockVerifier::success_v2());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state(verifier.clone(), issuer.clone());
    let router = build_router(state);

    let mut requirements = sample_requirements_v2("10");
    requirements.extra = Some(json!({
        "validationRegistryAddress": "0x3333333333333333333333333333333333333333",
        "validatorAddress": "0x5555555555555555555555555555555555555555",
        "validatorAgentId": "0x7",
        "minValidationScore": 80,
        "requiredValidationTag": "hard-finality",
        "jobHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }));

    let request_body = VerifyRequest {
        x402_version: Some(2),
        payment_payload: payment_payload_v2("10"),
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
    assert!(reason.contains("validator address"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

#[tokio::test]
async fn verify_rejects_v2_when_handler_only_accepts_v1() {
    let verifier = Arc::new(MockVerifier::success_v2());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state_with_versions(verifier.clone(), issuer.clone(), vec![1]);
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
    assert!(!payload.is_valid);
    assert_eq!(
        payload.invalid_reason.as_deref(),
        Some("unsupported x402Version 2")
    );
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
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

#[tokio::test]
async fn settle_rejects_v2_when_handler_only_accepts_v1() {
    let verifier = Arc::new(MockVerifier::success_v2());
    let issuer = Arc::new(MockIssuer::success());
    let state = test_state_with_versions(verifier.clone(), issuer.clone(), vec![1]);
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
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["success"], false);
    assert_eq!(payload["error"].as_str(), Some("unsupported x402Version 2"));
    assert_eq!(verifier.verify_calls(), 0);
    assert_eq!(issuer.issue_calls(), 0);
}

fn test_state(verifier: Arc<MockVerifier>, issuer: Arc<MockIssuer>) -> SharedState {
    test_state_with_versions(verifier, issuer, vec![1, 2])
}

fn test_state_with_versions(
    verifier: Arc<MockVerifier>,
    issuer: Arc<MockIssuer>,
    versions: Vec<u8>,
) -> SharedState {
    let handler = FourMicaHandler::new(
        "4mica-credit".into(),
        "eip155:11155111".into(),
        verifier.clone() as Arc<dyn CertificateValidator>,
        issuer.clone() as Arc<dyn GuaranteeIssuer>,
        versions,
        vec!["0x3333333333333333333333333333333333333333".into()],
    );
    Arc::new(AppState::new(vec![handler], None))
}

fn exact_state(exact: Arc<MockExact>) -> SharedState {
    let exact_service: Arc<dyn ExactService> = exact;
    Arc::new(AppState::new(Vec::new(), Some(exact_service)))
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
        extra: Some(json!({
            "validationRegistryAddress": "0x3333333333333333333333333333333333333333",
            "validatorAddress": "0x4444444444444444444444444444444444444444",
            "validatorAgentId": "0x7",
            "minValidationScore": 80,
            "requiredValidationTag": "hard-finality",
            "jobHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        })),
    }
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

fn payment_payload_v2(amount: &str) -> X402PaymentPayload {
    let amount_u256 = parse_amount(amount);
    let recipient = format!("{:#x}", recipient_address());
    let asset = format!("{:#x}", asset_address());
    let user = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let subject_hash =
        compute_validation_subject_hash(user, &recipient, U256::ZERO, amount_u256, &asset, 1)
            .expect("subject hash");
    let request_hash = compute_validation_request_hash(&PaymentGuaranteeValidationPolicyV2 {
        validation_registry_address: Address::from_slice(&[0x33; 20]),
        validation_request_hash: alloy::primitives::B256::ZERO,
        validation_chain_id: 11155111,
        validator_address: Address::from_slice(&[0x44; 20]),
        validator_agent_id: U256::from(7u8),
        min_validation_score: 80,
        validation_subject_hash: alloy::primitives::B256::from(subject_hash),
        required_validation_tag: "hard-finality".into(),
        job_hash: alloy::primitives::B256::repeat_byte(0xAA),
    })
    .expect("request hash");
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
            "claims": {
                "version": "v2",
                "user_address": user,
                "recipient_address": recipient,
                "req_id": "0x0",
                "amount": amount,
                "asset_address": asset,
                "timestamp": 1,
                "validation_registry_address": "0x3333333333333333333333333333333333333333",
                "validation_request_hash": format!("0x{}", hex::encode(request_hash)),
                "validation_chain_id": 11155111,
                "validator_address": "0x4444444444444444444444444444444444444444",
                "validator_agent_id": "0x7",
                "min_validation_score": 80,
                "validation_subject_hash": format!("0x{}", hex::encode(subject_hash)),
                "required_validation_tag": "hard-finality",
                "job_hash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            },
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
        version: 1,
        validation_policy: None,
    }
}

fn sample_claims_v2() -> PaymentGuaranteeClaims {
    let recipient = format!("{:#x}", recipient_address());
    let asset = format!("{:#x}", asset_address());
    let user = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let subject_hash =
        compute_validation_subject_hash(user, &recipient, U256::ZERO, U256::from(10u8), &asset, 1)
            .expect("subject hash");
    let mut policy = PaymentGuaranteeValidationPolicyV2 {
        validation_registry_address: Address::from_slice(&[0x33; 20]),
        validation_request_hash: alloy::primitives::B256::ZERO,
        validation_chain_id: 11155111,
        validator_address: Address::from_slice(&[0x44; 20]),
        validator_agent_id: U256::from(7u8),
        min_validation_score: 80,
        validation_subject_hash: alloy::primitives::B256::from(subject_hash),
        required_validation_tag: "hard-finality".into(),
        job_hash: alloy::primitives::B256::repeat_byte(0xAA),
    };
    policy.validation_request_hash = alloy::primitives::B256::from(
        compute_validation_request_hash(&policy).expect("request hash"),
    );

    PaymentGuaranteeClaims {
        domain: [0u8; 32],
        user_address: user.into(),
        recipient_address: recipient,
        cycle_id: U256::from(1u8),
        req_id: U256::ZERO,
        amount: U256::from(10u8),
        asset_address: asset,
        timestamp: 1,
        version: 2,
        validation_policy: Some(policy),
    }
}

fn parse_amount(amount: &str) -> U256 {
    if let Some(hex) = amount.strip_prefix("0x") {
        U256::from_str_radix(hex, 16).expect("hex amount")
    } else {
        U256::from_str_radix(amount, 10).expect("decimal amount")
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

    fn success_v2() -> Self {
        Self::with_claims(sample_claims_v2())
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
    let key = KeyMaterial::from_bytes(&[1u8; 32]).expect("secret key");
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
