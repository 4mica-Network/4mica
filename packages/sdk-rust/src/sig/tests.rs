//! The payer-signing path, pinned against the vectors the ClearingHouse verifies in its own
//! cross-boundary suite. A drift in the layout, the domain or the encoding breaks these.

use alloy::primitives::{B256, U256, address, b256};
use alloy::signers::local::PrivateKeySigner;
use alloy::sol_types::Eip712Domain;
use rpc::{CheckpointPayload, PaymentRequestPayload, ValidationRequirement, clearing_house_domain};

use super::PayerSigner;
use crate::error::PaymentError;

const CHAIN_ID: u64 = 31337;
const CLEARING_HOUSE: &str = "0x00000000000000000000000000000000000c1ea7";
const RECIPIENT: &str = "0x00000000000000000000000000000000000000Be";
const ASSET: &str = "0x0000000000000000000000000000000000000000";
const PAYER: &str = "0x17c5185167401eD00cF5F5b2fc97D9BBfDb7D025";

/// The deterministic key behind every pinned signature below.
fn signer() -> PrivateKeySigner {
    PrivateKeySigner::from_bytes(&B256::repeat_byte(0x42)).expect("valid secret key")
}

fn domain() -> Eip712Domain {
    clearing_house_domain(CHAIN_ID, CLEARING_HOUSE.parse().unwrap())
}

fn payment() -> PaymentRequestPayload {
    PaymentRequestPayload::new(
        PAYER.to_string(),
        RECIPIENT.to_string(),
        B256::repeat_byte(0x11),
        U256::from(7u64),
        U256::from(1_000u64),
        1_700_000_000,
        Some(ASSET.to_string()),
        B256::repeat_byte(0x22),
    )
}

fn validated_payment() -> PaymentRequestPayload {
    PaymentRequestPayload::new(
        PAYER.to_string(),
        RECIPIENT.to_string(),
        B256::repeat_byte(0x11),
        U256::from(8u64),
        U256::from(500u64),
        1_700_000_001,
        Some(ASSET.to_string()),
        B256::repeat_byte(0x33),
    )
    .with_validation(ValidationRequirement {
        validator: "eip155:31337:0x1111111111111111111111111111111111111111".to_string(),
        subject: B256::repeat_byte(0x44),
        deadline: Some(1_700_003_600),
        params: vec![1, 2, 3].into(),
    })
}

fn checkpoint() -> CheckpointPayload {
    CheckpointPayload {
        payer: PAYER.to_string(),
        cycle_id: B256::repeat_byte(0x11),
        asset_address: ASSET.to_string(),
        cumulative_gross: U256::from(120u64),
        timestamp_cutoff: 1_699_999_999,
    }
}

#[tokio::test]
async fn payment_matches_the_pinned_vector() {
    let signed = signer()
        .sign_payment_request(&domain(), payment())
        .await
        .expect("sign");

    assert_eq!(
        signed.payload.signing_digest(&domain()).unwrap(),
        b256!("97f0126b97a6a2a9f4ce09e474d72abea197410eed667264638ecabab4f1fb3e")
    );
    assert_eq!(
        signed.signature,
        "0x331f23e7ae374539f2ad61db1f56cc228f949b2a0f9d1ce42c1fbb77c8bccc2f6d0000887cf4dfa959f9946b9d04cf71c4f882f3bed1913aecf941f11b7a98081c"
    );
}

#[tokio::test]
async fn validated_payment_matches_the_pinned_vector() {
    let signed = signer()
        .sign_payment_request(&domain(), validated_payment())
        .await
        .expect("sign");

    assert_eq!(
        signed.payload.signing_digest(&domain()).unwrap(),
        b256!("70a4189470368efc2dcd0240135bd8aff7ac5404693765dcbb25bb19fe5cd862")
    );
    assert_eq!(
        signed.signature,
        "0x31aba4912d29728c9796a595b627fd5a7551b9b19d67f0556df39389cf5b275e2d2cfbbcc673409ad3e240a268e9bb7f6158b0c71837f6394622e449416bde751b"
    );
}

#[tokio::test]
async fn checkpoint_matches_the_pinned_vector() {
    let signed = signer()
        .sign_checkpoint(&domain(), checkpoint())
        .await
        .expect("sign");

    assert_eq!(
        signed.payload.signing_digest(&domain()).unwrap(),
        b256!("8722487336bd11c543e8d40234bac4c2b79c90391bea866d58e108dd0fb23c02")
    );
    assert_eq!(
        signed.signature,
        "0xd6d53ffa1388646ff580f8a6dacd5673758daddb06a383b4a22ab3c7ff2062c5799e592b9a949945d98eb031af97c6416ac9b39006836e3b3c5defbc45b8887b1c"
    );
}

/// A validation requirement is inside the commitment the payer signs, so attaching one after the
/// fact cannot reuse the plain signature.
#[tokio::test]
async fn validation_is_covered_by_the_payment_signature() {
    let plain = payment().signing_digest(&domain()).unwrap();
    let validated = payment()
        .with_validation(ValidationRequirement {
            validator: "eip155:31337:0x1111111111111111111111111111111111111111".to_string(),
            subject: B256::repeat_byte(0x44),
            deadline: None,
            params: Default::default(),
        })
        .signing_digest(&domain())
        .unwrap();

    assert_ne!(plain, validated);
}

/// The recipient is bound by a salted commitment, so two payments that differ only in salt are
/// still distinct signatures.
#[tokio::test]
async fn the_salt_changes_the_payment_digest() {
    let mut other = payment();
    let PaymentRequestPayload::V1(inner) = &mut other;
    inner.salt = B256::repeat_byte(0x99);

    assert_ne!(
        payment().signing_digest(&domain()).unwrap(),
        other.signing_digest(&domain()).unwrap()
    );
}

#[tokio::test]
async fn a_payment_is_only_valid_in_its_own_domain() {
    let elsewhere = clearing_house_domain(
        CHAIN_ID,
        address!("00000000000000000000000000000000000c1ea8"),
    );

    assert_ne!(
        payment().signing_digest(&domain()).unwrap(),
        payment().signing_digest(&elsewhere).unwrap()
    );
}

#[tokio::test]
async fn signing_for_another_payer_is_refused() {
    let err = PrivateKeySigner::random()
        .sign_payment_request(&domain(), payment())
        .await
        .expect_err("a signer must not sign for someone else");

    assert!(
        matches!(err, PaymentError::AddressMismatch { .. }),
        "{err:?}"
    );
}

#[tokio::test]
async fn checkpointing_for_another_payer_is_refused() {
    let err = PrivateKeySigner::random()
        .sign_checkpoint(&domain(), checkpoint())
        .await
        .expect_err("a signer must not checkpoint for someone else");

    assert!(
        matches!(err, PaymentError::AddressMismatch { .. }),
        "{err:?}"
    );
}
