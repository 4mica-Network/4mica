"""BLS envelope codec for guarantee claims.

Wire format is ``abi.encode(uint64 version, bytes claims)``, matching what
``Core4Mica`` decodes (``crates/rpc/src/guarantee/codec.rs``). The version
selects the claims layout; only v1 exists today.
"""

from __future__ import annotations

from typing import List, Union

from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_utils import remove_0x_prefix

from .errors import VerificationError
from .models import GUARANTEE_CLAIMS_VERSION, PaymentGuaranteeClaims
from .utils import normalize_address, parse_u256

SUPPORTED_GUARANTEE_VERSIONS: List[int] = [GUARANTEE_CLAIMS_VERSION]

_CLAIMS_TYPES = [
    "bytes32",  # domain
    "uint256",  # cycle_id
    "uint256",  # req_id
    "address",  # client
    "address",  # recipient
    "uint256",  # amount
    "address",  # asset
    "uint64",  # timestamp
    "uint64",  # version
]

_CLAIMS_ENCODED_BYTES_V1 = 32 * len(_CLAIMS_TYPES)
_MIN_ENVELOPE_BYTES = 32 * 3


def is_supported_guarantee_version(version: int) -> bool:
    return version in SUPPORTED_GUARANTEE_VERSIONS


def _ensure_domain_bytes(domain: Union[str, bytes]) -> bytes:
    if isinstance(domain, bytes):
        if len(domain) != 32:
            raise VerificationError("domain separator must be 32 bytes")
        return domain
    data = bytes.fromhex(remove_0x_prefix(str(domain)))
    if len(data) != 32:
        raise VerificationError("domain separator must be 32 bytes")
    return data


def encode_guarantee_claims(claims: PaymentGuaranteeClaims) -> bytes:
    if claims.version != GUARANTEE_CLAIMS_VERSION:
        raise VerificationError(
            f"unsupported guarantee claims version: {claims.version}"
        )
    encoded_claims = abi_encode(
        _CLAIMS_TYPES,
        [
            _ensure_domain_bytes(claims.domain),
            parse_u256(claims.cycle_id),
            parse_u256(claims.req_id),
            claims.user_address,
            claims.recipient_address,
            parse_u256(claims.amount),
            claims.asset_address,
            int(claims.timestamp),
            int(claims.version),
        ],
    )
    return abi_encode(["uint64", "bytes"], [int(claims.version), encoded_claims])


def decode_guarantee_claims(data: Union[str, bytes]) -> PaymentGuaranteeClaims:
    raw_bytes = (
        bytes.fromhex(remove_0x_prefix(data)) if isinstance(data, str) else bytes(data)
    )
    # Legacy bare layout: claims words with no version envelope.
    if len(raw_bytes) == _CLAIMS_ENCODED_BYTES_V1:
        return _decode_v1_claims(raw_bytes, envelope_version=None)
    if len(raw_bytes) < _MIN_ENVELOPE_BYTES:
        raise VerificationError(
            f"unexpected guarantee claims length: {len(raw_bytes)} bytes"
        )

    version, encoded = abi_decode(["uint64", "bytes"], raw_bytes)
    if not is_supported_guarantee_version(int(version)):
        raise VerificationError(f"unsupported guarantee claims version: {version}")
    if len(encoded) != _CLAIMS_ENCODED_BYTES_V1:
        raise VerificationError(
            f"unexpected V1 claims inner length: {len(encoded)} bytes"
        )
    return _decode_v1_claims(encoded, envelope_version=int(version))


def _decode_v1_claims(
    encoded: bytes, envelope_version: Union[int, None]
) -> PaymentGuaranteeClaims:
    (
        domain,
        cycle_id,
        req_id,
        client,
        recipient,
        amount,
        asset,
        timestamp,
        claims_version,
    ) = abi_decode(_CLAIMS_TYPES, encoded)
    if envelope_version is not None and envelope_version != int(claims_version):
        raise VerificationError(
            f"mismatched embedded version: envelope={envelope_version}, "
            f"embedded={claims_version}"
        )
    if int(claims_version) != GUARANTEE_CLAIMS_VERSION:
        raise VerificationError(
            f"unsupported guarantee claims version: {claims_version}"
        )

    return PaymentGuaranteeClaims(
        domain=domain,
        user_address=normalize_address(client),
        recipient_address=normalize_address(recipient),
        cycle_id=parse_u256(cycle_id),
        req_id=parse_u256(req_id),
        amount=parse_u256(amount),
        asset_address=normalize_address(asset),
        timestamp=int(timestamp),
        version=int(claims_version),
    )
