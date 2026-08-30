"""EIP-712 / EIP-191 payloads for guarantee requests.

Ports ``sdk-rust/src/digest.rs``. The signed structs are declared in
``crates/rpc/src/guarantee/signing.rs`` — renaming a struct or reordering a
field changes the EIP-712 type hash and invalidates existing signatures, so
the type definitions here are pinned by tests against the canonical
``encodeType`` strings.

The request-signing domain includes ``verifyingContract`` (the Core4Mica
deployment) alongside name/version/chainId, all taken from core's public
parameters.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from eth_abi import encode as abi_encode

from .models import CorePublicParameters, PaymentGuaranteeRequestClaims

_EIP712_DOMAIN_TYPE = [
    {"name": "name", "type": "string"},
    {"name": "version", "type": "string"},
    {"name": "chainId", "type": "uint256"},
    {"name": "verifyingContract", "type": "address"},
]

_CLAIMS_V1_TYPE = [
    {"name": "user", "type": "address"},
    {"name": "recipient", "type": "address"},
    {"name": "reqId", "type": "uint256"},
    {"name": "amount", "type": "uint256"},
    {"name": "asset", "type": "address"},
    {"name": "timestamp", "type": "uint64"},
]

_VALIDATION_TYPE = [
    {"name": "validator", "type": "string"},
    {"name": "subject", "type": "bytes32"},
    {"name": "deadline", "type": "uint64"},
    {"name": "params", "type": "bytes"},
]

_VALIDATED_CLAIMS_V1_TYPE = _CLAIMS_V1_TYPE + [
    {"name": "validation", "type": "SolValidation"},
]


def _domain(params: CorePublicParameters) -> Dict[str, Any]:
    return {
        "name": params.eip712_name,
        "version": params.eip712_version,
        "chainId": params.chain_id,
        "verifyingContract": params.contract_address,
    }


def _claims_message(claims: PaymentGuaranteeRequestClaims) -> Dict[str, Any]:
    return {
        "user": claims.user_address,
        "recipient": claims.recipient_address,
        "reqId": int(claims.req_id),
        "amount": int(claims.amount),
        "asset": claims.asset_address,
        "timestamp": int(claims.timestamp),
    }


def eip712_message_for_claims(
    params: CorePublicParameters, claims: PaymentGuaranteeRequestClaims
) -> Dict[str, Any]:
    """The full EIP-712 message for a guarantee request, as
    ``eth_account.messages.encode_typed_data`` consumes it."""
    if claims.validation is None:
        return {
            "types": {
                "EIP712Domain": _EIP712_DOMAIN_TYPE,
                "SolGuaranteeRequestClaimsV1": _CLAIMS_V1_TYPE,
            },
            "primaryType": "SolGuaranteeRequestClaimsV1",
            "domain": _domain(params),
            "message": _claims_message(claims),
        }

    message = _claims_message(claims)
    message["validation"] = {
        "validator": claims.validation.validator,
        "subject": claims.validation.subject,
        "deadline": int(claims.validation.deadline or 0),
        "params": claims.validation.params,
    }
    return {
        "types": {
            "EIP712Domain": _EIP712_DOMAIN_TYPE,
            "SolValidatedGuaranteeRequestClaimsV1": _VALIDATED_CLAIMS_V1_TYPE,
            "SolValidation": _VALIDATION_TYPE,
        },
        "primaryType": "SolValidatedGuaranteeRequestClaimsV1",
        "domain": _domain(params),
        "message": message,
    }


def eip191_payload_for_claims(claims: PaymentGuaranteeRequestClaims) -> bytes:
    """The ABI payload the EIP-191 scheme prefixes and hashes: ``abi.encode``
    of the same struct EIP-712 signs, matching ``eip191_digest_for_claims``."""
    if claims.validation is None:
        return abi_encode(
            ["address", "address", "uint256", "uint256", "address", "uint64"],
            [
                claims.user_address,
                claims.recipient_address,
                int(claims.req_id),
                int(claims.amount),
                claims.asset_address,
                int(claims.timestamp),
            ],
        )

    validation = claims.validation
    # A dynamic struct abi.encodes with an offset head, which encoding a
    # one-tuple sequence reproduces.
    return abi_encode(
        [
            "(address,address,uint256,uint256,address,uint64,"
            "(string,bytes32,uint64,bytes))"
        ],
        [
            (
                claims.user_address,
                claims.recipient_address,
                int(claims.req_id),
                int(claims.amount),
                claims.asset_address,
                int(claims.timestamp),
                (
                    validation.validator,
                    bytes.fromhex(validation.subject.removeprefix("0x")),
                    int(validation.deadline or 0),
                    bytes.fromhex(validation.params.removeprefix("0x")),
                ),
            )
        ],
    )


def encode_type_string(primary: str, types: Optional[Dict[str, Any]] = None) -> str:
    """The canonical EIP-712 ``encodeType`` string for one of this module's
    structs — what the type hash is keccak'd from. Exposed for tests that pin
    field order against the contract."""
    all_types = types or {
        "SolGuaranteeRequestClaimsV1": _CLAIMS_V1_TYPE,
        "SolValidatedGuaranteeRequestClaimsV1": _VALIDATED_CLAIMS_V1_TYPE,
        "SolValidation": _VALIDATION_TYPE,
    }

    def render(name: str) -> str:
        fields = ",".join(f"{f['type']} {f['name']}" for f in all_types[name])
        return f"{name}({fields})"

    referenced = sorted(
        {
            f["type"]
            for f in all_types[primary]
            if f["type"] in all_types and f["type"] != primary
        }
    )
    return render(primary) + "".join(render(name) for name in referenced)
