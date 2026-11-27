import json
from pathlib import Path

import pytest

from fourmica_sdk.guarantee import (
    clearing_house_domain_separator,
    recipient_commitment,
)
from fourmica_sdk.models import CheckpointPayload, PaymentRequestPayload

FIXTURES = Path(__file__).parent / "fixtures"
VECTORS = json.loads((FIXTURES / "digest_vectors.json").read_text())
DOMAIN = clearing_house_domain_separator(
    VECTORS["domain"]["chain_id"], VECTORS["domain"]["verifying_contract"]
)


@pytest.mark.parametrize("case", ["plain", "validated"])
def test_payment_digest_matches_rust(case):
    vector = VECTORS[case]
    payload = PaymentRequestPayload.from_rpc(vector["payload"])

    assert "0x" + payload.signing_digest(DOMAIN).hex() == vector["eip712_digest"]
    assert (
        "0x"
        + recipient_commitment(
            payload.recipient_address, payload.salt, payload.validation
        ).hex()
        == vector["recipient_commitment"]
    )


@pytest.mark.parametrize("case", ["plain", "validated"])
def test_payment_serializes_exactly_as_rust_does(case):
    payload = VECTORS[case]["payload"]
    assert PaymentRequestPayload.from_rpc(payload).to_payload() == payload


def test_checkpoint_digest_matches_rust():
    vector = VECTORS["checkpoint"]
    payload = CheckpointPayload.from_rpc(vector["payload"])
    assert "0x" + payload.signing_digest(DOMAIN).hex() == vector["eip712_digest"]


def test_checkpoint_serializes_exactly_as_rust_does():
    payload = VECTORS["checkpoint"]["payload"]
    assert CheckpointPayload.from_rpc(payload).to_payload() == payload


def test_validated_and_plain_digests_differ():
    assert VECTORS["plain"]["eip712_digest"] != VECTORS["validated"]["eip712_digest"]
