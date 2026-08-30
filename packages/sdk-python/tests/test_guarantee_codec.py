"""Claims codec tests, including the cross-language golden vectors shared with
the Rust (`guarantee_golden_vectors.rs`) and Solidity
(`GuaranteeCrossBoundary.t.sol`) suites.

Regenerate the fixture in the 4mica-core repo with
``REGEN_GUARANTEE_VECTORS=1 cargo test -p rpc-4mica --test guarantee_golden_vectors``
and copy ``contracts/test/fixtures/guarantee_vectors.json`` here.
"""

import json
from pathlib import Path

import pytest
from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode

from fourmica_sdk.errors import VerificationError
from fourmica_sdk.guarantee import decode_guarantee_claims, encode_guarantee_claims
from fourmica_sdk.models import PaymentGuaranteeClaims

FIXTURES = Path(__file__).parent / "fixtures"


def make_claims(**overrides) -> PaymentGuaranteeClaims:
    values = dict(
        domain=b"\x01" * 32,
        user_address="0x1234567890123456789012345678901234567890",
        recipient_address="0xAbcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD",
        cycle_id=100,
        req_id=200,
        amount=1000,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1234567890,
        version=1,
    )
    values.update(overrides)
    return PaymentGuaranteeClaims(**values)


def test_encode_decode_roundtrip():
    claims = make_claims()
    decoded = decode_guarantee_claims(encode_guarantee_claims(claims))
    assert decoded == claims


def test_golden_vector_decodes_and_reencodes_byte_identically():
    vector = json.loads((FIXTURES / "guarantee_vectors.json").read_text())["v1"]
    claims = decode_guarantee_claims(vector["guarantee"])
    expected = vector["expected"]

    assert claims.user_address.lower() == expected["client"].lower()
    assert claims.recipient_address.lower() == expected["recipient"].lower()
    assert claims.cycle_id == int(expected["cycleId"])
    assert claims.req_id == int(expected["reqId"])
    assert claims.amount == int(expected["amount"])
    assert claims.asset_address.lower() == expected["asset"].lower()
    assert claims.timestamp == expected["timestamp"]
    assert claims.version == expected["version"]
    assert "0x" + bytes(claims.domain).hex() == vector["domain"]

    assert "0x" + encode_guarantee_claims(claims).hex() == vector["guarantee"].lower()


def test_unsupported_version_rejected_on_encode():
    with pytest.raises(VerificationError, match="unsupported"):
        encode_guarantee_claims(make_claims(version=99))


def test_unsupported_envelope_version_rejected_on_decode():
    encoded = encode_guarantee_claims(make_claims())
    _, inner = abi_decode(["uint64", "bytes"], encoded)
    tampered = abi_encode(["uint64", "bytes"], [42, inner])
    with pytest.raises(VerificationError, match="unsupported"):
        decode_guarantee_claims(tampered)


def test_mismatched_embedded_version_rejected():
    # An envelope claiming v1 around claims words whose version slot says 2.
    encoded = encode_guarantee_claims(make_claims())
    _, inner = abi_decode(["uint64", "bytes"], encoded)
    claims_words = bytearray(inner)
    claims_words[-1] = 2  # version is the last word's low byte
    tampered = abi_encode(["uint64", "bytes"], [1, bytes(claims_words)])
    with pytest.raises(VerificationError, match="mismatched embedded version"):
        decode_guarantee_claims(tampered)


def test_legacy_bare_claims_still_decode():
    encoded = encode_guarantee_claims(make_claims())
    _, inner = abi_decode(["uint64", "bytes"], encoded)
    assert len(inner) == 32 * 9
    decoded = decode_guarantee_claims(inner)
    assert decoded == make_claims()


def test_garbage_length_rejected():
    with pytest.raises(VerificationError, match="length"):
        decode_guarantee_claims(b"\x00" * 33)
