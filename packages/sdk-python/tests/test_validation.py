import pytest

from fourmica_sdk.models import (
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
)
from fourmica_sdk.signing import CorePublicParameters
from fourmica_sdk.validation import (
    VALIDATION_REQUEST_BINDING_DOMAIN_V1,
    compute_validation_request_hash,
    compute_validation_subject_hash,
)


def _build_v2_claims() -> PaymentGuaranteeRequestClaimsV2:
    base = PaymentGuaranteeRequestClaims.new(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        tab_id=42,
        req_id=2,
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
        required_validation_tag="",
        job_hash="0x" + "11" * 32,
    )
    return PaymentGuaranteeRequestClaimsV2.new(
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


def test_payment_guarantee_request_claims_v2_rejects_min_validation_score_zero():
    with pytest.raises(ValueError, match="min_validation_score"):
        PaymentGuaranteeRequestClaimsV2.new(
            user_address="0x0000000000000000000000000000000000000001",
            recipient_address="0x0000000000000000000000000000000000000002",
            tab_id=1,
            req_id=0,
            amount=1,
            timestamp=1,
            erc20_token=None,
            validation_registry_address="0x0000000000000000000000000000000000000011",
            validation_request_hash="0x" + "00" * 32,
            validation_chain_id=1,
            validator_address="0x0000000000000000000000000000000000000022",
            validator_agent_id=1,
            min_validation_score=0,
            validation_subject_hash="0x" + "00" * 32,
            required_validation_tag="",
            job_hash="0x" + "11" * 32,
        )


def test_compute_validation_subject_hash_is_deterministic():
    claims = PaymentGuaranteeRequestClaims.new(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=3,
        amount=100,
        timestamp=5,
        erc20_token=None,
    )

    h1 = compute_validation_subject_hash(claims)
    h2 = compute_validation_subject_hash(claims)

    assert h1 == h2
    assert h1.startswith("0x")
    assert len(h1) == 66


def test_compute_validation_request_hash_changes_when_policy_changes():
    claims_a = _build_v2_claims()
    claims_b = PaymentGuaranteeRequestClaimsV2.new(
        user_address=claims_a.user_address,
        recipient_address=claims_a.recipient_address,
        tab_id=claims_a.tab_id,
        req_id=claims_a.req_id,
        amount=claims_a.amount,
        timestamp=claims_a.timestamp,
        erc20_token=claims_a.asset_address,
        validation_registry_address=claims_a.validation_registry_address,
        validation_request_hash="0x" + "00" * 32,
        validation_chain_id=claims_a.validation_chain_id,
        validator_address=claims_a.validator_address,
        validator_agent_id=claims_a.validator_agent_id,
        min_validation_score=90,
        validation_subject_hash=claims_a.validation_subject_hash,
        required_validation_tag=claims_a.required_validation_tag,
        job_hash=claims_a.job_hash,
    )

    assert compute_validation_request_hash(claims_a) != compute_validation_request_hash(
        claims_b
    )


def test_core_public_parameters_parses_extended_fields_and_defaults():
    params = CorePublicParameters.from_rpc(
        {
            "publicKey": [1, 2, 3],
            "contractAddress": "0x1234567890abcdef1234567890abcdef12345678",
            "ethereumHttpRpcUrl": "http://localhost:8545",
            "eip712Name": "4mica",
            "eip712Version": "1",
            "chainId": 1337,
            "maxAcceptedGuaranteeVersion": 2,
            "activeGuaranteeDomainSeparator": "0x" + "ab" * 32,
            "trustedValidationRegistries": [
                "0x0000000000000000000000000000000000000011"
            ],
        }
    )

    assert params.max_accepted_guarantee_version == 2
    assert params.accepted_guarantee_versions == []
    assert params.accepted_guarantee_versions_or_default() == [1, 2]
    assert params.active_guarantee_domain_separator == "0x" + "ab" * 32
    assert params.trusted_validation_registries == [
        "0x0000000000000000000000000000000000000011"
    ]
    assert (
        params.validation_hash_canonicalization_version
        == VALIDATION_REQUEST_BINDING_DOMAIN_V1
    )
