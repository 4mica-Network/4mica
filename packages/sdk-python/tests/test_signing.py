import pytest
from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data

from fourmica_sdk.errors import SigningError
from fourmica_sdk.models import (
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    SigningScheme,
)
from fourmica_sdk.signing import (
    CorePublicParameters,
    PaymentSigner,
    _build_typed_message,
    _encode_eip191,
)
from fourmica_sdk.validation import (
    compute_validation_request_hash,
    compute_validation_subject_hash,
)

PRIVATE_KEY = "0x59c6995e998f97a5a0044976f7be35d5ad91c0cfa55b5cfb20b07a1c60f4c5bc"
EXPECTED_TS_V1_EIP712_SIGNATURE = (
    "0x436a65c06129741426a074ff472f773dca9cd049964b916ab9b56c5b7a4b629"
    "64db7030eb297cbac8afb244b1e8b6fce1d891549021a4a1ccc87aec3a6c5bbed1b"
)
EXPECTED_TS_V2_EIP712_SIGNATURE = (
    "0x048ab57adedc8463265f6d18b22187ca521e7153ab99e0382518abfbe757e2c"
    "61787b9c3040cd74829a0a5db8745a2e02f8081234d61640b6b930746126e53b61b"
)


def build_params() -> CorePublicParameters:
    return CorePublicParameters(
        public_key=b"",
        contract_address="0x0000000000000000000000000000000000000000",
        ethereum_http_rpc_url="https://example.com",
        eip712_name="4Mica",
        eip712_version="1",
        chain_id=1,
    )


def build_v2_claims(user_address: str) -> PaymentGuaranteeRequestClaimsV2:
    base = PaymentGuaranteeRequestClaims.new(
        user_address,
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
        required_validation_tag="hard-finality",
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


@pytest.mark.asyncio
async def test_sign_request_rejects_address_mismatch():
    signer = PaymentSigner("11" * 32)
    claims = PaymentGuaranteeRequestClaims.new(
        "0x0000000000000000000000000000000000000011",
        "0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=1,
        amount=5,
        timestamp=1234,
        erc20_token=None,
    )
    with pytest.raises(SigningError):
        await signer.sign_request(build_params(), claims, SigningScheme.EIP712)


@pytest.mark.asyncio
async def test_sign_request_eip712_produces_signature():
    account = Account.from_key(PRIVATE_KEY)
    signer = PaymentSigner(PRIVATE_KEY)
    claims = PaymentGuaranteeRequestClaims.new(
        account.address,
        "0x0000000000000000000000000000000000000002",
        tab_id=42,
        req_id=2,
        amount=123,
        timestamp=999,
        erc20_token=None,
    )

    signature = await signer.sign_request(build_params(), claims, SigningScheme.EIP712)
    assert signature.scheme == SigningScheme.EIP712
    # 65-byte signature expressed as 0x-prefixed hex (132 chars).
    assert signature.signature.startswith("0x")
    assert len(signature.signature) == 132
    assert signature.signature == EXPECTED_TS_V1_EIP712_SIGNATURE
    recovered = Account.recover_message(
        encode_typed_data(full_message=_build_typed_message(build_params(), claims)),
        signature=signature.signature,
    )
    assert recovered == account.address


@pytest.mark.asyncio
async def test_sign_request_eip191_produces_signature():
    account = Account.from_key(PRIVATE_KEY)
    signer = PaymentSigner(PRIVATE_KEY)
    claims = PaymentGuaranteeRequestClaims.new(
        account.address,
        "0x0000000000000000000000000000000000000002",
        tab_id=42,
        req_id=7,
        amount=123,
        timestamp=999,
        erc20_token=None,
    )

    signature = await signer.sign_request(build_params(), claims, SigningScheme.EIP191)
    assert signature.scheme == SigningScheme.EIP191
    assert signature.signature.startswith("0x")
    assert len(signature.signature) == 132
    recovered = Account.recover_message(
        encode_defunct(primitive=_encode_eip191(claims)),
        signature=signature.signature,
    )
    assert recovered == account.address


@pytest.mark.asyncio
async def test_sign_request_v2_eip712_produces_signature():
    account = Account.from_key(PRIVATE_KEY)
    signer = PaymentSigner(PRIVATE_KEY)
    claims = build_v2_claims(account.address)

    signature = await signer.sign_request(build_params(), claims, SigningScheme.EIP712)
    assert signature.scheme == SigningScheme.EIP712
    assert signature.signature.startswith("0x")
    assert len(signature.signature) == 132
    assert signature.signature == EXPECTED_TS_V2_EIP712_SIGNATURE
    recovered = Account.recover_message(
        encode_typed_data(full_message=_build_typed_message(build_params(), claims)),
        signature=signature.signature,
    )
    assert recovered == account.address


@pytest.mark.asyncio
async def test_sign_request_v2_eip191_produces_signature():
    account = Account.from_key(PRIVATE_KEY)
    signer = PaymentSigner(PRIVATE_KEY)
    claims = build_v2_claims(account.address)

    signature = await signer.sign_request(build_params(), claims, SigningScheme.EIP191)
    assert signature.scheme == SigningScheme.EIP191
    assert signature.signature.startswith("0x")
    assert len(signature.signature) == 132
    recovered = Account.recover_message(
        encode_defunct(primitive=_encode_eip191(claims)),
        signature=signature.signature,
    )
    assert recovered == account.address


def test_v2_eip712_field_order_matches_ts_and_core():
    account = Account.from_key(PRIVATE_KEY)
    claims = build_v2_claims(account.address)

    typed = _build_typed_message(build_params(), claims)

    assert [item["name"] for item in typed["types"]["SolGuaranteeRequestClaimsV2"]] == [
        "user",
        "recipient",
        "tabId",
        "reqId",
        "amount",
        "asset",
        "timestamp",
        "validationRegistryAddress",
        "validationRequestHash",
        "validationChainId",
        "validatorAddress",
        "validatorAgentId",
        "minValidationScore",
        "validationSubjectHash",
        "jobHash",
        "requiredValidationTag",
    ]
    assert list(typed["message"])[-3:] == [
        "validationSubjectHash",
        "jobHash",
        "requiredValidationTag",
    ]


def test_claims_v2_rejects_min_validation_score_over_100():
    account = Account.from_key(PRIVATE_KEY)
    with pytest.raises(ValueError, match="min_validation_score"):
        PaymentGuaranteeRequestClaimsV2.new(
            user_address=account.address,
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
            min_validation_score=101,
            validation_subject_hash="0x" + "00" * 32,
            required_validation_tag="",
            job_hash="0x" + "11" * 32,
        )


@pytest.mark.asyncio
async def test_sign_request_rejects_unsupported_scheme():
    """Passing a non-enum scheme falls through to the else branch and raises SigningError."""
    account = Account.from_key(PRIVATE_KEY)
    signer = PaymentSigner(PRIVATE_KEY)
    claims = PaymentGuaranteeRequestClaims.new(
        account.address,
        "0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=1,
        amount=5,
        timestamp=1234,
        erc20_token=None,
    )
    with pytest.raises(SigningError, match="unsupported signing scheme"):
        await signer.sign_request(build_params(), claims, "not_a_scheme")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_v1_signature_unchanged_by_v2_addition():
    """V1 EIP-712 signing produces the same result regardless of V2 support."""
    account = Account.from_key(PRIVATE_KEY)
    signer = PaymentSigner(PRIVATE_KEY)
    claims = PaymentGuaranteeRequestClaims.new(
        account.address,
        "0x0000000000000000000000000000000000000002",
        tab_id=42,
        req_id=2,
        amount=123,
        timestamp=999,
        erc20_token=None,
    )
    signature = await signer.sign_request(build_params(), claims, SigningScheme.EIP712)
    assert signature.signature == EXPECTED_TS_V1_EIP712_SIGNATURE


def test_v2_eip191_encoding_order_matches_ts_and_core():
    account = Account.from_key(PRIVATE_KEY)
    claims = build_v2_claims(account.address)

    expected = abi_encode(
        [
            "address",
            "address",
            "uint256",
            "uint256",
            "uint256",
            "address",
            "uint64",
            "address",
            "bytes32",
            "uint256",
            "address",
            "uint256",
            "uint8",
            "bytes32",
            "bytes32",
            "string",
        ],
        [
            claims.user_address,
            claims.recipient_address,
            claims.tab_id,
            claims.req_id,
            claims.amount,
            claims.asset_address,
            claims.timestamp,
            claims.validation_registry_address,
            bytes.fromhex(claims.validation_request_hash.removeprefix("0x")),
            claims.validation_chain_id,
            claims.validator_address,
            claims.validator_agent_id,
            claims.min_validation_score,
            bytes.fromhex(claims.validation_subject_hash.removeprefix("0x")),
            bytes.fromhex(claims.job_hash.removeprefix("0x")),
            claims.required_validation_tag,
        ],
    )
    assert _encode_eip191(claims) == expected
