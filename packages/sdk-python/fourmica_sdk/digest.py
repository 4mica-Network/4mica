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
from eth_utils import keccak

from .models import CorePublicParameters, PaymentGuaranteeRequestClaims

#: Permit2's canonical singleton, deployed at one address on every chain.
PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

# Core4Mica's EIP-712 domain, as the contract declares it in
# ``EIP712("Core4Mica", "1")``. Distinct from the operator's request-signing
# domain, which core publishes in its public parameters.
CORE_EIP712_NAME = "Core4Mica"
CORE_EIP712_VERSION = "1"

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


# --- authorization digests (gasless routes) -----------------------------
#
# Canonical EIP-712 ``encodeType`` strings the tokens and contracts hash. If
# field order or types drift from these, the produced signature will not
# verify on-chain — so they are pinned as literals, exactly as in
# ``sdk-rust/src/digest.rs``.

ERC3009_TYPE = (
    "ReceiveWithAuthorization(address from,address to,uint256 value,"
    "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
)
PERMIT2_TRANSFER_TYPE = (
    "PermitTransferFrom(TokenPermissions permitted,address spender,"
    "uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
)
TOKEN_PERMISSIONS_TYPE = "TokenPermissions(address token,uint256 amount)"
EIP2612_PERMIT_TYPE = (
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
)
REQUEST_WITHDRAWAL_TYPE = (
    "RequestWithdrawal(address user,address asset,uint256 amount,"
    "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
)
CANCEL_WITHDRAWAL_TYPE = (
    "CancelWithdrawal(address user,address asset,uint256 validAfter,"
    "uint256 validBefore,bytes32 nonce)"
)


def _bytes32(value) -> bytes:
    if isinstance(value, bytes):
        data = value
    else:
        data = bytes.fromhex(str(value).removeprefix("0x"))
    if len(data) != 32:
        raise ValueError(f"expected 32 bytes, got {len(data)}")
    return data


def eip712_digest(domain_separator, struct_hash: bytes) -> bytes:
    """``keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(message))`` from a
    raw domain separator — read straight off the verifying contract, so the
    signature always matches what it verifies."""
    return keccak(b"\x19\x01" + _bytes32(domain_separator) + _bytes32(struct_hash))


def eip712_domain_separator(
    name: str, version: Optional[str], chain_id: int, verifying_contract: str
) -> bytes:
    """An EIP-712 domain separator built from its parts — the reconstruction
    path used when the separator cannot be read from the contract. ``version``
    is optional because not every domain has one (Permit2's does not)."""
    if version is not None:
        type_hash = keccak(
            text="EIP712Domain(string name,string version,uint256 chainId,"
            "address verifyingContract)"
        )
    else:
        type_hash = keccak(
            text="EIP712Domain(string name,uint256 chainId,address verifyingContract)"
        )

    encoded = type_hash + keccak(text=name)
    if version is not None:
        encoded += keccak(text=version)
    encoded += abi_encode(["uint256", "address"], [int(chain_id), verifying_contract])
    return keccak(encoded)


def permit2_domain_separator(chain_id: int) -> bytes:
    """Permit2's domain separator: one canonical address on every chain, a
    fixed name, and no version — the chain id is the only variable."""
    return eip712_domain_separator("Permit2", None, chain_id, PERMIT2_ADDRESS)


def core_domain_separator(chain_id: int, contract: str) -> bytes:
    """Core4Mica's own domain separator for the deployment at *contract*."""
    return eip712_domain_separator(
        CORE_EIP712_NAME, CORE_EIP712_VERSION, chain_id, contract
    )


def digest_for_receive_authorization(
    domain_separator,
    from_address: str,
    to_address: str,
    value: int,
    valid_after: int,
    valid_before: int,
    nonce,
) -> bytes:
    """Signing hash for an EIP-3009 ``receiveWithAuthorization``.
    *domain_separator* is the token's own ``DOMAIN_SEPARATOR()``."""
    struct_hash = keccak(
        abi_encode(
            [
                "bytes32",
                "address",
                "address",
                "uint256",
                "uint256",
                "uint256",
                "bytes32",
            ],
            [
                keccak(text=ERC3009_TYPE),
                from_address,
                to_address,
                int(value),
                int(valid_after),
                int(valid_before),
                _bytes32(nonce),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_permit2_transfer(
    domain_separator,
    token: str,
    amount: int,
    spender: str,
    nonce: int,
    deadline: int,
) -> bytes:
    """Signing hash for a Permit2 ``PermitTransferFrom``. *spender* is bound
    to the contract that will call ``permitTransferFrom``, so only that
    contract can consume the signature."""
    permitted_hash = keccak(
        abi_encode(
            ["bytes32", "address", "uint256"],
            [keccak(text=TOKEN_PERMISSIONS_TYPE), token, int(amount)],
        )
    )
    struct_hash = keccak(
        abi_encode(
            ["bytes32", "bytes32", "address", "uint256", "uint256"],
            [
                keccak(text=PERMIT2_TRANSFER_TYPE),
                permitted_hash,
                spender,
                int(nonce),
                int(deadline),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_permit(
    domain_separator,
    owner: str,
    spender: str,
    value: int,
    nonce: int,
    deadline: int,
) -> bytes:
    """Signing hash for an EIP-2612 ``permit``. *nonce* must be the owner's
    current one — a client without chain access gets it from the facilitator's
    ``PERMIT2_ALLOWANCE_REQUIRED`` response rather than reading the token."""
    struct_hash = keccak(
        abi_encode(
            ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
            [
                keccak(text=EIP2612_PERMIT_TYPE),
                owner,
                spender,
                int(value),
                int(nonce),
                int(deadline),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_request_withdrawal(
    domain_separator,
    user: str,
    asset: str,
    amount: int,
    valid_after: int,
    valid_before: int,
    nonce,
) -> bytes:
    """Signing hash for a sponsored ``requestWithdrawalWithAuthorization``.
    *domain_separator* is Core4Mica's own ``DOMAIN_SEPARATOR()``."""
    struct_hash = keccak(
        abi_encode(
            [
                "bytes32",
                "address",
                "address",
                "uint256",
                "uint256",
                "uint256",
                "bytes32",
            ],
            [
                keccak(text=REQUEST_WITHDRAWAL_TYPE),
                user,
                asset,
                int(amount),
                int(valid_after),
                int(valid_before),
                _bytes32(nonce),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_cancel_withdrawal(
    domain_separator,
    user: str,
    asset: str,
    valid_after: int,
    valid_before: int,
    nonce,
) -> bytes:
    """Signing hash for a sponsored ``cancelWithdrawalWithAuthorization``."""
    struct_hash = keccak(
        abi_encode(
            ["bytes32", "address", "address", "uint256", "uint256", "bytes32"],
            [
                keccak(text=CANCEL_WITHDRAWAL_TYPE),
                user,
                asset,
                int(valid_after),
                int(valid_before),
                _bytes32(nonce),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)
