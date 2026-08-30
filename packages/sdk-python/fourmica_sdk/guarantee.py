from __future__ import annotations

from typing import Union

from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_utils import remove_0x_prefix

from .errors import VerificationError
from .models import PaymentGuaranteeClaims, PaymentGuaranteeValidationPolicyV2
from .utils import normalize_bytes32_hex, parse_u256

_CLAIMS_TYPES = [
    "bytes32",  # domain
    "uint256",  # tab_id
    "uint256",  # req_id
    "address",  # client
    "address",  # recipient
    "uint256",  # amount
    "uint256",  # total_amount
    "address",  # asset
    "uint64",  # timestamp
    "uint64",  # version
]

_CLAIMS_TYPES_V2 = [
    "bytes32",  # domain
    "uint256",  # tab_id
    "uint256",  # req_id
    "address",  # client
    "address",  # recipient
    "uint256",  # amount
    "uint256",  # total_amount
    "address",  # asset
    "uint64",  # timestamp
    "uint64",  # version
    "address",  # validation_registry_address
    "bytes32",  # validation_request_hash
    "uint64",  # validation_chain_id
    "address",  # validator_address
    "uint256",  # validator_agent_id
    "uint8",  # min_validation_score
    "bytes32",  # validation_subject_hash
    "string",  # required_validation_tag
    "bytes32",  # job_hash
]
_CLAIMS_TYPE_V2_TUPLE = (
    "(bytes32,uint256,uint256,address,address,uint256,uint256,address,"
    "uint64,uint64,address,bytes32,uint64,address,uint256,uint8,bytes32,string,bytes32)"
)

_CLAIMS_ENCODED_BYTES_V1 = 32 * len(_CLAIMS_TYPES)
_MIN_ENVELOPE_BYTES = 32 * 3


def _ensure_domain_bytes(domain: Union[str, bytes]) -> bytes:
    if isinstance(domain, bytes):
        if len(domain) != 32:
            raise VerificationError("domain separator must be 32 bytes")
        return domain
    domain_hex = remove_0x_prefix(str(domain))
    data = bytes.fromhex(domain_hex)
    if len(data) != 32:
        raise VerificationError("domain separator must be 32 bytes")
    return data


def _ensure_bytes32(value: str) -> bytes:
    return bytes.fromhex(normalize_bytes32_hex(value).removeprefix("0x"))


def encode_guarantee_claims(claims: PaymentGuaranteeClaims) -> bytes:
    domain = _ensure_domain_bytes(claims.domain)
    if claims.version == 1:
        if claims.validation_policy is not None:
            raise VerificationError(
                "v1 guarantee claims must not carry validation_policy"
            )
        encoded_claims = abi_encode(
            _CLAIMS_TYPES,
            [
                domain,
                parse_u256(claims.tab_id),
                parse_u256(claims.req_id),
                claims.user_address,
                claims.recipient_address,
                parse_u256(claims.amount),
                parse_u256(claims.total_amount),
                claims.asset_address,
                int(claims.timestamp),
                int(claims.version),
            ],
        )
    elif claims.version == 2:
        policy = claims.validation_policy
        if policy is None:
            raise VerificationError("v2 guarantee claims require validation_policy")
        encoded_claims = abi_encode(
            [_CLAIMS_TYPE_V2_TUPLE],
            [
                (
                    domain,
                    parse_u256(claims.tab_id),
                    parse_u256(claims.req_id),
                    claims.user_address,
                    claims.recipient_address,
                    parse_u256(claims.amount),
                    parse_u256(claims.total_amount),
                    claims.asset_address,
                    int(claims.timestamp),
                    int(claims.version),
                    policy.validation_registry_address,
                    _ensure_bytes32(policy.validation_request_hash),
                    int(policy.validation_chain_id),
                    policy.validator_address,
                    parse_u256(policy.validator_agent_id),
                    int(policy.min_validation_score),
                    _ensure_bytes32(policy.validation_subject_hash),
                    policy.required_validation_tag,
                    _ensure_bytes32(policy.job_hash),
                )
            ],
        )
    else:
        raise VerificationError(
            f"unsupported guarantee claims version: {claims.version}"
        )

    return abi_encode(["uint64", "bytes"], [int(claims.version), encoded_claims])


def decode_guarantee_claims(data: Union[str, bytes]) -> PaymentGuaranteeClaims:
    raw_bytes = (
        bytes.fromhex(remove_0x_prefix(data)) if isinstance(data, str) else bytes(data)
    )
    if len(raw_bytes) == _CLAIMS_ENCODED_BYTES_V1:
        return _decode_v1_claims(raw_bytes)
    if len(raw_bytes) < _MIN_ENVELOPE_BYTES:
        raise VerificationError(
            f"unexpected guarantee claims length: {len(raw_bytes)} bytes"
        )

    version, encoded = abi_decode(["uint64", "bytes"], raw_bytes)

    if version == 1:
        if len(encoded) != _CLAIMS_ENCODED_BYTES_V1:
            raise VerificationError(
                f"unexpected V1 claims inner length: {len(encoded)} bytes"
            )
        return _decode_v1_claims(encoded)
    if version == 2:
        return _decode_v2_claims(encoded)

    raise VerificationError(f"unsupported guarantee claims version: {version}")


def _decode_v1_claims(encoded: bytes) -> PaymentGuaranteeClaims:
    (
        domain,
        tab_id,
        req_id,
        client,
        recipient,
        amount,
        total_amount,
        asset,
        timestamp,
        claims_version,
    ) = abi_decode(_CLAIMS_TYPES, encoded)
    if int(claims_version) != 1:
        raise VerificationError(
            f"unsupported guarantee claims version: {claims_version}"
        )

    return PaymentGuaranteeClaims(
        domain=domain,
        user_address=client,
        recipient_address=recipient,
        tab_id=parse_u256(tab_id),
        req_id=parse_u256(req_id),
        amount=parse_u256(amount),
        total_amount=parse_u256(total_amount),
        asset_address=asset,
        timestamp=int(timestamp),
        version=int(claims_version),
    )


def _decode_v2_claims(encoded: bytes) -> PaymentGuaranteeClaims:
    try:
        (decoded,) = abi_decode([_CLAIMS_TYPE_V2_TUPLE], encoded)
        return _build_decoded_v2_claims(decoded)
    except Exception as tuple_exc:
        try:
            decoded = abi_decode(_CLAIMS_TYPES_V2, encoded)
            return _build_decoded_v2_claims(decoded)
        except Exception as flat_exc:
            raise VerificationError(
                "failed to decode V2 guarantee claims: "
                f"{tuple_exc}; fallback decode failed: {flat_exc}"
            ) from flat_exc


def _build_decoded_v2_claims(decoded) -> PaymentGuaranteeClaims:
    (
        domain,
        tab_id,
        req_id,
        client,
        recipient,
        amount,
        total_amount,
        asset,
        timestamp,
        claims_version,
        validation_registry_address,
        validation_request_hash,
        validation_chain_id,
        validator_address,
        validator_agent_id,
        min_validation_score,
        validation_subject_hash,
        required_validation_tag,
        job_hash,
    ) = decoded
    if int(claims_version) != 2:
        raise VerificationError(
            f"unsupported guarantee claims version: {claims_version}"
        )

    return PaymentGuaranteeClaims(
        domain=domain,
        user_address=client,
        recipient_address=recipient,
        tab_id=parse_u256(tab_id),
        req_id=parse_u256(req_id),
        amount=parse_u256(amount),
        total_amount=parse_u256(total_amount),
        asset_address=asset,
        timestamp=int(timestamp),
        version=int(claims_version),
        validation_policy=PaymentGuaranteeValidationPolicyV2(
            validation_registry_address=validation_registry_address,
            validation_request_hash="0x" + bytes(validation_request_hash).hex(),
            validation_chain_id=int(validation_chain_id),
            validator_address=validator_address,
            validator_agent_id=parse_u256(validator_agent_id),
            min_validation_score=int(min_validation_score),
            validation_subject_hash="0x" + bytes(validation_subject_hash).hex(),
            required_validation_tag=required_validation_tag,
            job_hash="0x" + bytes(job_hash).hex(),
        ),
    )
