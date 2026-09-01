from fourmica_sdk.models import (
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
)
from fourmica_sdk.validation import (
    compute_validation_request_hash,
    compute_validation_subject_hash,
)


def test_serialize_payment_claims_v1_shape():
    claims = PaymentGuaranteeRequestClaims.new(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        tab_id=42,
        req_id=7,
        amount=123,
        timestamp=999,
        erc20_token=None,
    )

    payload = claims.to_payload()

    assert payload == {
        "version": "v1",
        "user_address": claims.user_address,
        "recipient_address": claims.recipient_address,
        "tab_id": "0x2a",
        "req_id": "0x7",
        "amount": "0x7b",
        "asset_address": claims.asset_address,
        "timestamp": 999,
    }


def test_serialize_payment_claims_v2_shape():
    base = PaymentGuaranteeRequestClaims.new(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        tab_id=42,
        req_id=7,
        amount=123,
        timestamp=999,
        erc20_token=None,
    )
    subject_hash = compute_validation_subject_hash(base)
    partial = PaymentGuaranteeRequestClaimsV2.new(
        user_address=base.user_address,
        recipient_address=base.recipient_address,
        tab_id=base.tab_id,
        req_id=base.req_id,
        amount=base.amount,
        timestamp=base.timestamp,
        erc20_token=base.asset_address,
        validation_registry_address="0x0000000000000000000000000000000000000011",
        validation_request_hash="0x" + "00" * 32,
        validation_chain_id=1,
        validator_address="0x0000000000000000000000000000000000000022",
        validator_agent_id=7,
        min_validation_score=80,
        validation_subject_hash=subject_hash,
        required_validation_tag="hard-finality",
        job_hash="0x" + "11" * 32,
    )
    claims = PaymentGuaranteeRequestClaimsV2.new(
        user_address=partial.user_address,
        recipient_address=partial.recipient_address,
        tab_id=partial.tab_id,
        req_id=partial.req_id,
        amount=partial.amount,
        timestamp=partial.timestamp,
        erc20_token=partial.asset_address,
        validation_registry_address=partial.validation_registry_address,
        validation_request_hash=compute_validation_request_hash(partial),
        validation_chain_id=partial.validation_chain_id,
        validator_address=partial.validator_address,
        validator_agent_id=partial.validator_agent_id,
        min_validation_score=partial.min_validation_score,
        validation_subject_hash=partial.validation_subject_hash,
        required_validation_tag=partial.required_validation_tag,
        job_hash=partial.job_hash,
    )

    payload = claims.to_payload()

    assert payload["version"] == "v2"
    assert payload["tab_id"] == "0x2a"
    assert payload["req_id"] == "0x7"
    assert payload["amount"] == "0x7b"
    assert payload["validation_registry_address"] == claims.validation_registry_address
    assert payload["validation_request_hash"] == claims.validation_request_hash
    assert payload["validation_chain_id"] == 1
    assert payload["validator_address"] == claims.validator_address
    assert payload["validator_agent_id"] == "0x7"
    assert payload["min_validation_score"] == 80
    assert payload["validation_subject_hash"] == claims.validation_subject_hash
    assert payload["required_validation_tag"] == "hard-finality"
    assert payload["job_hash"] == claims.job_hash
