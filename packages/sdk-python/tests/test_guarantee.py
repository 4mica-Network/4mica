from types import SimpleNamespace

import pytest
from eth_abi import encode as abi_encode

from fourmica_sdk.client import RecipientClient
from fourmica_sdk.errors import VerificationError, VerifyGuaranteeError
from fourmica_sdk.guarantee import (
    _CLAIMS_ENCODED_BYTES_V1,
    _CLAIMS_TYPES,
    decode_guarantee_claims,
    encode_guarantee_claims,
)
from fourmica_sdk.models import (
    BLSCert,
    PaymentGuaranteeClaims,
    PaymentGuaranteeValidationPolicyV2,
)


def test_encode_decode_guarantee_round_trip():
    claims = PaymentGuaranteeClaims(
        domain=b"\x00" * 32,
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=2,
        amount=3,
        total_amount=4,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234,
        version=1,
    )
    encoded = encode_guarantee_claims(claims)
    decoded = decode_guarantee_claims(encoded)
    assert decoded.tab_id == claims.tab_id
    assert decoded.req_id == claims.req_id
    assert decoded.amount == claims.amount
    assert decoded.total_amount == claims.total_amount


def test_encode_guarantee_v1_rejects_validation_policy():
    claims = PaymentGuaranteeClaims(
        domain=b"\x00" * 32,
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=2,
        amount=3,
        total_amount=4,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234,
        version=1,
        validation_policy=PaymentGuaranteeValidationPolicyV2(
            validation_registry_address="0x0000000000000000000000000000000000000011",
            validation_request_hash="0x" + "ab" * 32,
            validation_chain_id=1,
            validator_address="0x0000000000000000000000000000000000000022",
            validator_agent_id=7,
            min_validation_score=80,
            validation_subject_hash="0x" + "cd" * 32,
            required_validation_tag="hard-finality",
            job_hash="0x" + "11" * 32,
        ),
    )

    with pytest.raises(VerificationError, match="must not carry validation_policy"):
        encode_guarantee_claims(claims)


def test_encode_decode_guarantee_v2_round_trip():
    claims = PaymentGuaranteeClaims(
        domain=b"\x00" * 32,
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=2,
        amount=3,
        total_amount=4,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234,
        version=2,
        validation_policy=PaymentGuaranteeValidationPolicyV2(
            validation_registry_address="0x0000000000000000000000000000000000000011",
            validation_request_hash="0x" + "ab" * 32,
            validation_chain_id=1,
            validator_address="0x0000000000000000000000000000000000000022",
            validator_agent_id=7,
            min_validation_score=80,
            validation_subject_hash="0x" + "cd" * 32,
            required_validation_tag="hard-finality",
            job_hash="0x" + "11" * 32,
        ),
    )
    encoded = encode_guarantee_claims(claims)
    decoded = decode_guarantee_claims(encoded)
    assert decoded.version == 2
    assert decoded.validation_policy is not None
    assert (
        decoded.validation_policy.validation_request_hash
        == claims.validation_policy.validation_request_hash
    )
    assert (
        decoded.validation_policy.validation_subject_hash
        == claims.validation_policy.validation_subject_hash
    )
    assert (
        decoded.validation_policy.required_validation_tag
        == claims.validation_policy.required_validation_tag
    )


def test_decode_guarantee_v2_tuple_encoded_inner_payload():
    inner = abi_encode(
        [
            "(bytes32,uint256,uint256,address,address,uint256,uint256,address,"
            "uint64,uint64,address,bytes32,uint64,address,uint256,uint8,bytes32,string,bytes32)"
        ],
        [
            (
                b"\x00" * 32,
                1,
                2,
                "0x0000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000002",
                3,
                4,
                "0x0000000000000000000000000000000000000000",
                1234,
                2,
                "0x0000000000000000000000000000000000000011",
                b"\xab" * 32,
                1,
                "0x0000000000000000000000000000000000000022",
                7,
                80,
                b"\xcd" * 32,
                "hard-finality",
                b"\x11" * 32,
            )
        ],
    )
    encoded = abi_encode(["uint64", "bytes"], [2, inner])

    decoded = decode_guarantee_claims(encoded)

    assert decoded.version == 2
    assert decoded.validation_policy is not None
    assert decoded.validation_policy.validation_chain_id == 1
    assert decoded.validation_policy.validator_agent_id == 7
    assert decoded.validation_policy.required_validation_tag == "hard-finality"


def test_encode_guarantee_v2_requires_validation_policy():
    claims = PaymentGuaranteeClaims(
        domain=b"\x00" * 32,
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=2,
        amount=3,
        total_amount=4,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234,
        version=2,
    )

    with pytest.raises(VerificationError, match="require validation_policy"):
        encode_guarantee_claims(claims)


def test_decode_guarantee_rejects_unsupported_envelope_version():
    encoded = abi_encode(["uint64", "bytes"], [3, b""])

    with pytest.raises(VerificationError, match="unsupported guarantee claims version"):
        decode_guarantee_claims(encoded)


def test_verify_guarantee_rejects_domain_mismatch():
    pytest.importorskip("py_ecc")
    from py_ecc.bls import G2Basic

    good_domain = b"\x01" * 32
    wrong_domain = b"\x02" * 32
    claims = PaymentGuaranteeClaims(
        domain=wrong_domain,
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=1,
        amount=1,
        total_amount=1,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234,
        version=1,
    )
    claims_bytes = encode_guarantee_claims(claims)
    sk = 1
    pk = G2Basic.SkToPk(sk)
    signature = G2Basic.Sign(sk, claims_bytes)
    cert = BLSCert(
        claims="0x" + claims_bytes.hex(),
        signature="0x" + signature.hex(),
    )

    fake_client = SimpleNamespace(
        guarantee_domain=good_domain,
        guarantee_domains={1: good_domain},
        gateway=SimpleNamespace(
            account=SimpleNamespace(
                address="0x0000000000000000000000000000000000000002"
            )
        ),
        rpc=None,
        params=SimpleNamespace(public_key=pk),
    )
    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    with pytest.raises(VerificationError, match="guarantee domain mismatch"):
        recipient.verify_payment_guarantee(cert)


def test_verify_v2_guarantee_uses_version_specific_domain():
    pytest.importorskip("py_ecc")
    from py_ecc.bls import G2Basic

    v2_domain = b"\x03" * 32
    claims = PaymentGuaranteeClaims(
        domain=v2_domain,
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        tab_id=1,
        req_id=1,
        amount=1,
        total_amount=1,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234,
        version=2,
        validation_policy=PaymentGuaranteeValidationPolicyV2(
            validation_registry_address="0x0000000000000000000000000000000000000011",
            validation_request_hash="0x" + "ab" * 32,
            validation_chain_id=1,
            validator_address="0x0000000000000000000000000000000000000022",
            validator_agent_id=7,
            min_validation_score=80,
            validation_subject_hash="0x" + "cd" * 32,
            required_validation_tag="hard-finality",
            job_hash="0x" + "11" * 32,
        ),
    )
    claims_bytes = encode_guarantee_claims(claims)
    sk = 1
    pk = G2Basic.SkToPk(sk)
    signature = G2Basic.Sign(sk, claims_bytes)
    cert = BLSCert(
        claims="0x" + claims_bytes.hex(),
        signature="0x" + signature.hex(),
    )

    fake_client = SimpleNamespace(
        guarantee_domain=b"\x01" * 32,
        guarantee_domains={1: b"\x01" * 32, 2: v2_domain},
        gateway=SimpleNamespace(
            account=SimpleNamespace(
                address="0x0000000000000000000000000000000000000002"
            )
        ),
        rpc=None,
        params=SimpleNamespace(public_key=pk),
    )
    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    decoded = recipient.verify_payment_guarantee(cert)
    assert decoded.version == 2


@pytest.mark.asyncio
async def test_create_tab_includes_guarantee_version():
    class DummyRpc:
        def __init__(self) -> None:
            self.body = None

        async def create_payment_tab(self, body):
            self.body = body
            return {
                "id": "0x2",
                "erc20_token": "0x0000000000000000000000000000000000000003",
                "next_req_id": "1",
            }

    rpc = DummyRpc()
    fake_client = SimpleNamespace(
        rpc=rpc,
        _signer=SimpleNamespace(address="0x0000000000000000000000000000000000000002"),
        guarantee_domain=b"\x00" * 32,
        guarantee_domains={1: b"\x00" * 32},
        params=SimpleNamespace(public_key=b"\x11" * 48),
        gateway=None,
    )

    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    tab_id, asset_address, next_req_id = await recipient.create_tab(
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        erc20_token="0x0000000000000000000000000000000000000003",
        ttl=60,
        guarantee_version=2,
    )

    assert tab_id == 2
    assert asset_address == "0x0000000000000000000000000000000000000003"
    assert next_req_id == 1
    assert rpc.body == {
        "user_address": "0x0000000000000000000000000000000000000001",
        "recipient_address": "0x0000000000000000000000000000000000000002",
        "erc20_token": "0x0000000000000000000000000000000000000003",
        "ttl": 60,
        "guarantee_version": 2,
    }


@pytest.mark.asyncio
async def test_create_tab_eth_returns_zero_asset_address():
    class DummyRpc:
        async def create_payment_tab(self, body):
            return {"id": "0x5"}  # no erc20_token → ETH

    rpc = DummyRpc()
    fake_client = SimpleNamespace(
        rpc=rpc,
        _signer=SimpleNamespace(address="0x0000000000000000000000000000000000000002"),
        guarantee_domain=b"\x00" * 32,
        guarantee_domains={1: b"\x00" * 32},
        params=SimpleNamespace(public_key=b"\x11" * 48),
        gateway=None,
    )

    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    tab_id, asset_address, next_req_id = await recipient.create_tab(
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        erc20_token=None,
        ttl=None,
    )

    assert tab_id == 5
    assert asset_address == "0x0000000000000000000000000000000000000000"
    assert next_req_id == 0


@pytest.mark.asyncio
async def test_create_tab_returns_zero_when_response_has_no_fields():
    """Empty RPC response should produce tab_id=0, ETH asset, next_req_id=0."""

    class DummyRpc:
        async def create_payment_tab(self, body):
            return {}

    rpc = DummyRpc()
    fake_client = SimpleNamespace(
        rpc=rpc,
        _signer=SimpleNamespace(address="0x0000000000000000000000000000000000000002"),
        guarantee_domain=b"\x00" * 32,
        guarantee_domains={1: b"\x00" * 32},
        params=SimpleNamespace(public_key=b"\x11" * 48),
        gateway=None,
    )
    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    tab_id, asset_address, next_req_id = await recipient.create_tab(
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        erc20_token=None,
        ttl=None,
    )

    assert tab_id == 0
    assert asset_address == "0x0000000000000000000000000000000000000000"
    assert next_req_id == 0


@pytest.mark.asyncio
async def test_create_tab_camel_case_response_keys():
    class DummyRpc:
        async def create_payment_tab(self, body):
            return {
                "id": "0xa",
                "erc20Token": "0x0000000000000000000000000000000000000009",
                "nextReqId": "3",
            }

    rpc = DummyRpc()
    fake_client = SimpleNamespace(
        rpc=rpc,
        _signer=SimpleNamespace(address="0x0000000000000000000000000000000000000002"),
        guarantee_domain=b"\x00" * 32,
        guarantee_domains={1: b"\x00" * 32},
        params=SimpleNamespace(public_key=b"\x11" * 48),
        gateway=None,
    )

    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    tab_id, asset_address, next_req_id = await recipient.create_tab(
        user_address="0x0000000000000000000000000000000000000001",
        recipient_address="0x0000000000000000000000000000000000000002",
        erc20_token="0x0000000000000000000000000000000000000009",
        ttl=3600,
    )

    assert tab_id == 10
    assert asset_address == "0x0000000000000000000000000000000000000009"
    assert next_req_id == 3


# ---------------------------------------------------------------------------
# Guarantee codec edge cases
# ---------------------------------------------------------------------------

_ZERO_ADDR = "0x0000000000000000000000000000000000000000"
_ADDR1 = "0x0000000000000000000000000000000000000001"
_ADDR2 = "0x0000000000000000000000000000000000000002"


def _v1_claims(domain=b"\x00" * 32) -> PaymentGuaranteeClaims:
    return PaymentGuaranteeClaims(
        domain=domain,
        user_address=_ADDR1,
        recipient_address=_ADDR2,
        tab_id=7,
        req_id=3,
        amount=100,
        total_amount=200,
        asset_address=_ZERO_ADDR,
        timestamp=1000,
        version=1,
    )


def test_decoded_version_field_is_set_v1():
    encoded = encode_guarantee_claims(_v1_claims())
    decoded = decode_guarantee_claims(encoded)
    assert decoded.version == 1


def test_decoded_version_field_is_set_v2():
    claims = PaymentGuaranteeClaims(
        domain=b"\x00" * 32,
        user_address=_ADDR1,
        recipient_address=_ADDR2,
        tab_id=1,
        req_id=2,
        amount=3,
        total_amount=4,
        asset_address=_ZERO_ADDR,
        timestamp=1234,
        version=2,
        validation_policy=PaymentGuaranteeValidationPolicyV2(
            validation_registry_address="0x0000000000000000000000000000000000000011",
            validation_request_hash="0x" + "ab" * 32,
            validation_chain_id=1,
            validator_address="0x0000000000000000000000000000000000000022",
            validator_agent_id=7,
            min_validation_score=80,
            validation_subject_hash="0x" + "cd" * 32,
            required_validation_tag="hard-finality",
            job_hash="0x" + "11" * 32,
        ),
    )
    encoded = encode_guarantee_claims(claims)
    decoded = decode_guarantee_claims(encoded)
    assert decoded.version == 2


def test_encode_rejects_invalid_domain_size():
    claims = _v1_claims(domain=b"\x00" * 16)  # 16 bytes, not 32
    with pytest.raises(VerificationError, match="32 bytes"):
        encode_guarantee_claims(claims)


def test_decode_rejects_too_short_claims():
    with pytest.raises(VerificationError, match="unexpected guarantee claims length"):
        decode_guarantee_claims(b"\x00" * 10)


def test_decode_legacy_unwrapped_v1_format():
    """320-byte raw V1 payload (no outer envelope) is accepted as legacy format."""
    raw_v1 = abi_encode(
        _CLAIMS_TYPES,
        [
            b"\x00" * 32,  # domain
            7,  # tab_id
            3,  # req_id
            _ADDR1,  # client
            _ADDR2,  # recipient
            100,  # amount
            200,  # total_amount
            _ZERO_ADDR,  # asset
            1000,  # timestamp
            1,  # version
        ],
    )
    assert len(raw_v1) == _CLAIMS_ENCODED_BYTES_V1
    decoded = decode_guarantee_claims(raw_v1)
    assert decoded.version == 1
    assert decoded.tab_id == 7
    assert decoded.amount == 100


def test_decode_rejects_wrapped_v1_with_wrong_inner_length():
    bad_wrapped = abi_encode(["uint64", "bytes"], [1, b"\x00" * 10])
    with pytest.raises(VerificationError, match="unexpected V1 claims inner length"):
        decode_guarantee_claims(bad_wrapped)


def test_verify_payment_guarantee_v2_rejects_missing_version_domain():
    """guarantee_domains without a v2 entry raises VerifyGuaranteeError."""
    pytest.importorskip("py_ecc")
    from py_ecc.bls import G2Basic

    v2_domain = b"\x05" * 32
    claims = PaymentGuaranteeClaims(
        domain=v2_domain,
        user_address=_ADDR1,
        recipient_address=_ADDR2,
        tab_id=1,
        req_id=1,
        amount=1,
        total_amount=1,
        asset_address=_ZERO_ADDR,
        timestamp=1234,
        version=2,
        validation_policy=PaymentGuaranteeValidationPolicyV2(
            validation_registry_address="0x0000000000000000000000000000000000000011",
            validation_request_hash="0x" + "ab" * 32,
            validation_chain_id=1,
            validator_address="0x0000000000000000000000000000000000000022",
            validator_agent_id=7,
            min_validation_score=80,
            validation_subject_hash="0x" + "cd" * 32,
            required_validation_tag="hard-finality",
            job_hash="0x" + "11" * 32,
        ),
    )
    claims_bytes = encode_guarantee_claims(claims)
    sk = 1
    pk = G2Basic.SkToPk(sk)
    signature = G2Basic.Sign(sk, claims_bytes)
    cert = BLSCert(
        claims="0x" + claims_bytes.hex(),
        signature="0x" + signature.hex(),
    )

    fake_client = SimpleNamespace(
        guarantee_domain=b"\x01" * 32,
        guarantee_domains={1: b"\x01" * 32},  # only v1 — v2 absent
        gateway=SimpleNamespace(account=SimpleNamespace(address=_ADDR2)),
        rpc=None,
        params=SimpleNamespace(public_key=pk),
    )
    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]

    with pytest.raises(
        VerifyGuaranteeError, match="unsupported guarantee claims version"
    ):
        recipient.verify_payment_guarantee(cert)


def test_verify_payment_guarantee_rejects_bytes_claims():
    """cert.claims as bytes (wrong type) raises VerifyGuaranteeError."""
    fake_client = SimpleNamespace(
        guarantee_domain=b"\x00" * 32,
        guarantee_domains={1: b"\x00" * 32},
        gateway=SimpleNamespace(account=SimpleNamespace(address=_ADDR2)),
        rpc=None,
        params=SimpleNamespace(public_key=b"\x00" * 48),
    )
    recipient = RecipientClient(fake_client)  # type: ignore[arg-type]
    cert = BLSCert(claims=b"\x00" * 10, signature="0x" + "00" * 96)  # type: ignore[arg-type]

    with pytest.raises(
        VerifyGuaranteeError, match="invalid BLS certificate claims encoding"
    ):
        recipient.verify_payment_guarantee(cert)
