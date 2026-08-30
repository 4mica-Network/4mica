from __future__ import annotations

from typing import Union

from eth_abi import encode as abi_encode
from eth_utils import keccak

from .models import (
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    PaymentGuaranteeValidationPolicyV2,
)
from .utils import normalize_bytes32_hex

VALIDATION_SUBJECT_BINDING_DOMAIN_V1 = "4MICA_VALIDATION_SUBJECT_V1"
VALIDATION_REQUEST_BINDING_DOMAIN_V2 = "4MICA_VALIDATION_REQUEST_V2"
VALIDATION_REQUEST_BINDING_DOMAIN_V1 = VALIDATION_REQUEST_BINDING_DOMAIN_V2


def _keccak_hex(data: bytes) -> str:
    return "0x" + keccak(data).hex()


def compute_validation_subject_hash(claims: PaymentGuaranteeRequestClaims) -> str:
    binding_domain = keccak(text=VALIDATION_SUBJECT_BINDING_DOMAIN_V1)
    payload = abi_encode(
        [
            "bytes32",
            "uint256",
            "uint256",
            "address",
            "address",
            "uint256",
            "address",
            "uint64",
        ],
        [
            binding_domain,
            int(claims.tab_id),
            int(claims.req_id),
            claims.user_address,
            claims.recipient_address,
            int(claims.amount),
            claims.asset_address,
            int(claims.timestamp),
        ],
    )
    return _keccak_hex(payload)


def compute_validation_request_hash(
    claims_or_policy: Union[
        PaymentGuaranteeRequestClaimsV2, PaymentGuaranteeValidationPolicyV2
    ],
) -> str:
    if isinstance(claims_or_policy, PaymentGuaranteeRequestClaimsV2):
        policy = claims_or_policy.validation_policy
    else:
        policy = claims_or_policy

    binding_domain = keccak(text=VALIDATION_REQUEST_BINDING_DOMAIN_V1)
    tag_hash = keccak(text=policy.required_validation_tag)
    payload = abi_encode(
        [
            "bytes32",
            "uint256",
            "address",
            "address",
            "uint256",
            "bytes32",
            "uint8",
            "bytes32",
            "bytes32",
        ],
        [
            binding_domain,
            int(policy.validation_chain_id),
            policy.validation_registry_address,
            policy.validator_address,
            int(policy.validator_agent_id),
            bytes.fromhex(
                normalize_bytes32_hex(policy.validation_subject_hash).removeprefix("0x")
            ),
            int(policy.min_validation_score),
            tag_hash,
            bytes.fromhex(normalize_bytes32_hex(policy.job_hash).removeprefix("0x")),
        ],
    )
    return _keccak_hex(payload)


__all__ = [
    "VALIDATION_REQUEST_BINDING_DOMAIN_V1",
    "VALIDATION_REQUEST_BINDING_DOMAIN_V2",
    "VALIDATION_SUBJECT_BINDING_DOMAIN_V1",
    "compute_validation_request_hash",
    "compute_validation_subject_hash",
]
