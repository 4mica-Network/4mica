"""The payer-signing path, pinned against the vectors the ClearingHouse
verifies in its own cross-boundary suite.

``checkpoint_vectors.json`` is core's fixture
(``contracts/test/fixtures/checkpoint_vectors.json`` in 4mica-core), consumed
by ``CheckpointCrossBoundary.t.sol``. A drift in the layout, the domain or the
encoding breaks these, and with them every payment on-chain default would
have to verify. Refresh by rerunning core's ``checkpoint_golden_vectors`` test
with ``REGEN_CHECKPOINT_VECTORS=1`` and copying the file here.
"""

import json
from pathlib import Path

import pytest
from eth_account import Account
from eth_utils import keccak

from fourmica_sdk.errors import (
    AddressMismatchError,
    InvalidPayerAddressError,
    SigningError,
)
from fourmica_sdk.guarantee import (
    CHECKPOINT_TYPE,
    CLEARING_HOUSE_EIP712_NAME,
    CLEARING_HOUSE_EIP712_VERSION,
    PAYMENT_AUTHORIZATION_TYPE,
    VALIDATION_TYPE,
    clearing_house_domain_separator,
    recipient_commitment,
)
from fourmica_sdk.models import (
    CheckpointPayload,
    PaymentRequestPayload,
    ValidationRequirement,
)
from fourmica_sdk.signing import PayerSigner

FIXTURES = Path(__file__).parent / "fixtures"
VECTORS = json.loads((FIXTURES / "checkpoint_vectors.json").read_text())

# The deterministic key behind every pinned signature in the fixture.
PAYER_KEY = "0x" + "42" * 32
PAYER = Account.from_key(PAYER_KEY).address
RECIPIENT = "0x00000000000000000000000000000000000000Be"
CHAIN_ID = VECTORS["domain"]["chainId"]
DOMAIN = clearing_house_domain_separator(
    CHAIN_ID, VECTORS["domain"]["verifyingContract"]
)


def payment() -> PaymentRequestPayload:
    return PaymentRequestPayload.new(
        user_address=PAYER,
        recipient_address=RECIPIENT,
        cycle_id=b"\x11" * 32,
        req_id=7,
        amount=1_000,
        timestamp=1_700_000_000,
        salt=b"\x22" * 32,
    )


def validation(**overrides) -> ValidationRequirement:
    values = dict(
        validator="eip155:31337:0x1111111111111111111111111111111111111111",
        subject="0x" + "44" * 32,
        deadline=1_700_003_600,
        params="0x010203",
    )
    values.update(overrides)
    return ValidationRequirement(**values)


def validated_payment() -> PaymentRequestPayload:
    return PaymentRequestPayload.new(
        user_address=PAYER,
        recipient_address=RECIPIENT,
        cycle_id=b"\x11" * 32,
        req_id=8,
        amount=500,
        timestamp=1_700_000_001,
        salt=b"\x33" * 32,
    ).with_validation(validation())


def checkpoint() -> CheckpointPayload:
    return CheckpointPayload(
        payer=PAYER,
        cycle_id=b"\x11" * 32,
        asset_address="0x0000000000000000000000000000000000000000",
        cumulative_gross=120,
        timestamp_cutoff=1_699_999_999,
    )


def test_the_fixture_signer_is_the_payer_key():
    assert PAYER == VECTORS["signer"]


def test_domain_is_the_clearing_houses():
    assert CLEARING_HOUSE_EIP712_NAME == VECTORS["domain"]["name"]
    assert CLEARING_HOUSE_EIP712_VERSION == VECTORS["domain"]["version"]


def test_eip712_type_strings_match_the_contract():
    """The ClearingHouse hard-codes these; drift here silently breaks every
    on-chain verification."""
    assert PAYMENT_AUTHORIZATION_TYPE == (
        "PaymentAuthorization(address payer,bytes32 cycleId,address asset,"
        "uint256 amount,uint256 reqId,uint64 timestamp,bytes32 recipientCommitment)"
    )
    assert CHECKPOINT_TYPE == (
        "Checkpoint(address payer,bytes32 cycleId,address asset,"
        "uint256 cumulativeGross,uint64 timestampCutoff)"
    )
    assert VALIDATION_TYPE == (
        "Validation(string validator,bytes32 subject,uint64 deadline,bytes params)"
    )


async def test_payment_matches_the_pinned_vector():
    expected = VECTORS["paymentAuthorization"]
    payload = payment()
    signed = await PayerSigner(PAYER_KEY).sign_payment_request(DOMAIN, payload)

    assert (
        "0x" + recipient_commitment(RECIPIENT, payload.salt).hex()
        == expected["recipientCommitment"]
    )
    assert "0x" + payload.signing_digest(DOMAIN).hex() == expected["digest"]
    assert signed.signature == expected["signature"]
    assert signed.payload is payload


async def test_validated_payment_matches_the_pinned_vector():
    expected = VECTORS["validatedPaymentAuthorization"]
    payload = validated_payment()
    signed = await PayerSigner(PAYER_KEY).sign_payment_request(DOMAIN, payload)

    assert (
        "0x" + recipient_commitment(RECIPIENT, payload.salt, payload.validation).hex()
        == expected["recipientCommitment"]
    )
    assert "0x" + payload.signing_digest(DOMAIN).hex() == expected["digest"]
    assert signed.signature == expected["signature"]


async def test_checkpoint_matches_the_pinned_vector():
    expected = VECTORS["checkpoint"]
    signed = await PayerSigner(PAYER_KEY).sign_checkpoint(DOMAIN, checkpoint())

    assert "0x" + signed.payload.signing_digest(DOMAIN).hex() == expected["digest"]
    assert signed.signature == expected["signature"]


async def test_a_signature_recovers_to_the_payer():
    payload = payment()
    signed = await PayerSigner(PAYER_KEY).sign_payment_request(DOMAIN, payload)
    recovered = Account._recover_hash(
        payload.signing_digest(DOMAIN), signature=signed.signature
    )
    assert recovered == PAYER


def test_validation_is_covered_by_the_payment_signature():
    """A validation requirement is inside the commitment the payer signs, so
    attaching one after the fact cannot reuse the plain signature."""
    plain = payment().signing_digest(DOMAIN)
    validated = (
        payment()
        .with_validation(validation(deadline=None, params="0x"))
        .signing_digest(DOMAIN)
    )
    assert plain != validated


@pytest.mark.parametrize(
    "field,value",
    [
        ("validator", "eip155:31337:0x1111111111111111111111111111111111111112"),
        ("subject", "0x" + "45" * 32),
        ("deadline", None),
        ("params", "0x09"),
    ],
)
def test_any_validation_field_changes_the_commitment(field, value):
    base = recipient_commitment(RECIPIENT, b"\x01" * 32, validation())
    tampered = recipient_commitment(
        RECIPIENT, b"\x01" * 32, validation(**{field: value})
    )
    assert base != tampered


def test_the_commitment_binds_recipient_and_salt():
    base = recipient_commitment(RECIPIENT, b"\x01" * 32)
    assert base == recipient_commitment(RECIPIENT, b"\x01" * 32)
    assert base == recipient_commitment(RECIPIENT.lower(), b"\x01" * 32)
    assert base != recipient_commitment("0x" + "42" * 20, b"\x01" * 32)
    assert base != recipient_commitment(RECIPIENT, b"\x02" * 32)


def test_the_salt_changes_the_payment_digest():
    other = payment()
    other.salt = "0x" + "99" * 32
    assert payment().signing_digest(DOMAIN) != other.signing_digest(DOMAIN)


def test_a_payment_is_only_valid_in_its_own_domain():
    other_contract = clearing_house_domain_separator(
        CHAIN_ID, "0x00000000000000000000000000000000000c1ea8"
    )
    other_chain = clearing_house_domain_separator(
        CHAIN_ID + 1, VECTORS["domain"]["verifyingContract"]
    )
    digest = payment().signing_digest(DOMAIN)
    assert digest != payment().signing_digest(other_contract)
    assert digest != payment().signing_digest(other_chain)


def test_a_checkpoints_digest_depends_on_its_total():
    bumped = checkpoint()
    bumped.cumulative_gross += 1
    assert checkpoint().signing_digest(DOMAIN) != bumped.signing_digest(DOMAIN)


def test_the_domain_separator_is_the_standard_eip712_one():
    """Built the way the contract's OpenZeppelin EIP712 builds it."""
    from eth_abi import encode

    expected = keccak(
        keccak(
            text="EIP712Domain(string name,string version,uint256 chainId,"
            "address verifyingContract)"
        )
        + keccak(text="4micaClearingHouse")
        + keccak(text="1")
        + encode(
            ["uint256", "address"],
            [CHAIN_ID, VECTORS["domain"]["verifyingContract"]],
        )
    )
    assert DOMAIN == expected


async def test_signing_for_another_payer_is_refused():
    with pytest.raises(AddressMismatchError) as excinfo:
        await PayerSigner(Account.create().key.hex()).sign_payment_request(
            DOMAIN, payment()
        )
    assert excinfo.value.payer == PAYER


async def test_checkpointing_for_another_payer_is_refused():
    with pytest.raises(AddressMismatchError):
        await PayerSigner(Account.create().key.hex()).sign_checkpoint(
            DOMAIN, checkpoint()
        )


async def test_a_payer_that_is_not_an_address_is_refused():
    payload = payment()
    payload.user_address = "nope"
    with pytest.raises(InvalidPayerAddressError):
        await PayerSigner(PAYER_KEY).sign_payment_request(DOMAIN, payload)


async def test_a_remote_signer_failure_is_a_signing_error():
    class Broken:
        address = PAYER

        async def sign_hash(self, message_hash):
            raise RuntimeError("kms unavailable")

    with pytest.raises(SigningError, match="kms unavailable"):
        await PayerSigner(Broken()).sign_payment_request(DOMAIN, payment())
