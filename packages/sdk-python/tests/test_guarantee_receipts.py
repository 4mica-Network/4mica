"""The operator's guarantee receipt: layout, decoding, and offline verification.

``guarantee_vectors.json`` is core's cross-boundary fixture
(``contracts/test/fixtures/guarantee_vectors.json`` in 4mica-core), which the
GuaranteeRegistry's Solidity suite verifies through ``verifyGuarantee``. To
refresh it, rerun core's ``guarantee_golden_vectors`` test with
``REGEN_GUARANTEE_VECTORS=1`` and copy the file here.
"""

import json
from pathlib import Path

import pytest
from eth_account import Account
from eth_utils import keccak

from fourmica_sdk.errors import (
    MalformedReceiptError,
    ReceiptSignerMismatchError,
    UnreadableReceiptSignatureError,
)
from fourmica_sdk.guarantee import (
    GUARANTEE_REGISTRY_EIP712_NAME,
    GUARANTEE_REGISTRY_EIP712_VERSION,
    GUARANTEE_V1_TYPE,
    GUARANTEE_V1_TYPE_HASH,
    Guarantee,
    GuaranteeReceipt,
    guarantee_registry_domain_separator,
    verify_guarantee_receipt,
)
from fourmica_sdk.models import PaymentRequestPayload

FIXTURES = Path(__file__).parent / "fixtures"
VECTORS = json.loads((FIXTURES / "guarantee_vectors.json").read_text())

# The deterministic key core's fixture stands the operator in with.
OPERATOR_KEY = "0x" + "24" * 32
OPERATOR = Account.from_key(OPERATOR_KEY)
CHAIN_ID = VECTORS["domain"]["chainId"]
REGISTRY = VECTORS["domain"]["verifyingContract"]
DOMAIN = guarantee_registry_domain_separator(CHAIN_ID, REGISTRY)


def vector_guarantee() -> Guarantee:
    g = VECTORS["guarantee"]
    return Guarantee(
        cycle_id=int(g["cycleId"]),
        req_id=int(g["reqId"]),
        client=g["client"],
        recipient=g["recipient"],
        amount=int(g["amount"]),
        asset=g["asset"],
        timestamp=g["timestamp"],
    )


def issued(signer=OPERATOR, domain=DOMAIN) -> tuple:
    guarantee = vector_guarantee()
    signature = signer.unsafe_sign_hash(guarantee.signing_digest(domain))
    return guarantee, GuaranteeReceipt.new(guarantee, "0x" + signature.signature.hex())


def test_the_fixture_signer_is_the_operator_key():
    assert OPERATOR.address == VECTORS["signer"]


def test_domain_is_the_guarantee_registrys():
    assert GUARANTEE_REGISTRY_EIP712_NAME == VECTORS["domain"]["name"]
    assert GUARANTEE_REGISTRY_EIP712_VERSION == VECTORS["domain"]["version"]


def test_type_hash_matches_the_registered_layout():
    """The type hash is the key the layout's verifier is registered under, so
    a drift unregisters the layout rather than merely breaking a signature."""
    assert GUARANTEE_V1_TYPE == (
        "GuaranteeV1(uint256 cycleId,uint256 reqId,address client,"
        "address recipient,uint256 amount,address asset,uint64 timestamp)"
    )
    assert GUARANTEE_V1_TYPE_HASH == keccak(text=GUARANTEE_V1_TYPE)
    assert "0x" + GUARANTEE_V1_TYPE_HASH.hex() == VECTORS["typeHash"]


def test_digest_signature_and_receipt_match_core():
    guarantee, receipt = issued()
    expected = VECTORS["guarantee"]

    assert "0x" + guarantee.signing_digest(DOMAIN).hex() == expected["digest"]
    assert receipt.signature == expected["signature"]
    assert receipt.receipt == expected["receipt"]


def test_core_receipt_decodes_to_its_guarantee():
    expected = VECTORS["guarantee"]
    receipt = GuaranteeReceipt(
        receipt=expected["receipt"], signature=expected["signature"]
    )
    assert receipt.guarantee() == vector_guarantee()
    assert receipt.guarantee().version == 1


def test_a_receipt_from_the_operator_verifies():
    guarantee, receipt = issued()
    assert verify_guarantee_receipt(receipt, DOMAIN, OPERATOR.address) == guarantee


def test_the_operator_address_is_compared_case_insensitively():
    _, receipt = issued()
    verify_guarantee_receipt(receipt, DOMAIN, OPERATOR.address.lower())


def test_a_receipt_from_anyone_else_is_refused():
    _, receipt = issued(signer=Account.create())
    with pytest.raises(ReceiptSignerMismatchError) as excinfo:
        verify_guarantee_receipt(receipt, DOMAIN, OPERATOR.address)
    assert excinfo.value.expected == OPERATOR.address


def test_a_receipt_does_not_carry_to_another_deployment():
    """The domain is inside the digest, so a receipt minted for one
    deployment cannot be replayed against another."""
    _, receipt = issued()
    elsewhere = guarantee_registry_domain_separator(
        CHAIN_ID, "0x00000000000000000000000000000000000000Be"
    )
    with pytest.raises(ReceiptSignerMismatchError):
        verify_guarantee_receipt(receipt, elsewhere, OPERATOR.address)


def test_a_receipt_whose_guarantee_was_altered_is_refused():
    guarantee, receipt = issued()
    inflated = Guarantee(**{**guarantee.__dict__, "amount": guarantee.amount * 10})
    forged = GuaranteeReceipt.new(inflated, receipt.signature)
    with pytest.raises(ReceiptSignerMismatchError):
        verify_guarantee_receipt(forged, DOMAIN, OPERATOR.address)


@pytest.mark.parametrize("signature", ["0x", "0x1234", "not hex", "0x" + "00" * 65])
def test_an_unreadable_signature_is_refused(signature):
    guarantee, _ = issued()
    receipt = GuaranteeReceipt.new(guarantee, signature)
    with pytest.raises(UnreadableReceiptSignatureError):
        verify_guarantee_receipt(receipt, DOMAIN, OPERATOR.address)


def test_a_truncated_receipt_is_refused():
    _, receipt = issued()
    receipt.receipt = receipt.receipt[:10]
    with pytest.raises(MalformedReceiptError, match="shorter than a type hash"):
        verify_guarantee_receipt(receipt, DOMAIN, OPERATOR.address)


def test_receipt_decoding_rejects_what_the_chain_would():
    good = vector_guarantee().receipt_bytes()

    with pytest.raises(MalformedReceiptError, match="shorter"):
        Guarantee.decode(good[:31])

    unknown = bytes([good[0] ^ 0xFF]) + good[1:]
    with pytest.raises(MalformedReceiptError, match="not a layout"):
        Guarantee.decode(unknown)

    with pytest.raises(MalformedReceiptError, match="not a GuaranteeV1"):
        Guarantee.decode(good[:-1])

    with pytest.raises(MalformedReceiptError, match="not hex"):
        Guarantee.decode("0xzz")


def test_receipt_bytes_are_the_type_hash_then_the_signed_guarantee():
    guarantee = vector_guarantee()
    data = guarantee.receipt_bytes()
    assert data[:32] == GUARANTEE_V1_TYPE_HASH
    assert len(data) == 32 + 7 * 32
    assert Guarantee.decode(data) == guarantee


def test_guarantee_is_built_from_the_payment_it_guarantees():
    payload = PaymentRequestPayload.new(
        user_address="0x1234567890123456789012345678901234567890",
        recipient_address="0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        cycle_id="0x" + "55" * 32,
        req_id=7,
        amount=1_000,
        timestamp=1_736_000_000,
    )
    guarantee = Guarantee.from_payment(payload, "0x1234")

    assert guarantee.cycle_id == 0x1234
    assert guarantee.req_id == 7
    assert guarantee.client == "0x1234567890123456789012345678901234567890"
    assert guarantee.recipient == "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD"
    assert guarantee.amount == 1_000
    assert guarantee.asset == "0x0000000000000000000000000000000000000000"
    assert guarantee.timestamp == 1_736_000_000


def test_receipt_round_trips_through_the_wire():
    _, receipt = issued()
    assert GuaranteeReceipt.from_rpc(receipt.to_payload()) == receipt
