"""PaymentClient offline: receipt verification against the connected operator,
issuance, and the checks a checkpoint batch must pass before the payer signs
over it."""

import pytest
from eth_account import Account
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    GUARANTEE_REGISTRY_ADDRESS,
    OPERATOR_PRIVATE_KEY,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    FakeRpc,
    make_ctx,
)

from fourmica_sdk.client.payment import PaymentClient, checkpoint_payload
from fourmica_sdk.errors import (
    InvalidParamsError,
    ReceiptSignerMismatchError,
    UntrustedCheckpointBatchError,
)
from fourmica_sdk.guarantee import (
    Guarantee,
    GuaranteeReceipt,
    clearing_house_domain_separator,
    guarantee_registry_domain_separator,
)
from fourmica_sdk.models import (
    CheckpointBatchResponse,
    CheckpointPayload,
    PaymentRequest,
    PaymentRequestPayload,
    SignedCheckpoint,
)

CHAIN_ID = 84532
ASSET = "0x0000000000000000000000000000000000000000"
RECIPIENT = "0x00000000000000000000000000000000000000Be"
CYCLE = "0x" + "11" * 32
OTHER_CYCLE = "0x" + "33" * 32
PAYER = Account.from_key(TEST_PRIVATE_KEY)
DOMAIN = clearing_house_domain_separator(CHAIN_ID, CLEARING_HOUSE_ADDRESS)


def payment_client(rpc=None) -> PaymentClient:
    return PaymentClient(make_ctx(rpc=rpc))


# --- receipts --------------------------------------------------------------


def receipt_signed_by(key: str) -> tuple:
    guarantee = Guarantee.from_payment(payment(1_000, 1_700_000_000), CYCLE)
    domain = guarantee_registry_domain_separator(CHAIN_ID, GUARANTEE_REGISTRY_ADDRESS)
    signature = Account.from_key(key).unsafe_sign_hash(guarantee.signing_digest(domain))
    return guarantee, GuaranteeReceipt.new(guarantee, "0x" + signature.signature.hex())


def test_verify_guarantee_accepts_the_connected_operators_receipt():
    guarantee, receipt = receipt_signed_by(OPERATOR_PRIVATE_KEY)
    assert payment_client().verify_guarantee(receipt) == guarantee


def test_verify_guarantee_refuses_anyone_elses_receipt():
    _, receipt = receipt_signed_by(TEST_PRIVATE_KEY)
    with pytest.raises(ReceiptSignerMismatchError):
        payment_client().verify_guarantee(receipt)


async def test_issue_guarantee_posts_the_signed_request():
    _, receipt = receipt_signed_by(OPERATOR_PRIVATE_KEY)
    rpc = FakeRpc(issue_guarantee=receipt)
    client = payment_client(rpc)
    request = signed_by(PAYER, payment(1_000, 1_700_000_000))

    assert await client.issue_guarantee(request) is receipt
    assert rpc.calls == [("issue_guarantee", request)]


async def test_sign_request_signs_under_the_clearing_house_domain():
    client = payment_client()
    payload = payment(1_000, 1_700_000_000)
    signed = await client.sign_request(payload)
    assert (
        Account._recover_hash(
            payload.signing_digest(DOMAIN), signature=signed.signature
        )
        == TEST_ADDRESS
    )


# --- checkpoint batches ----------------------------------------------------


def payment(amount: int, timestamp: int, **overrides) -> PaymentRequestPayload:
    """Request ids follow the timestamp, so payments at distinct times never
    collide."""
    values = dict(
        user_address=PAYER.address,
        recipient_address=RECIPIENT,
        cycle_id=CYCLE,
        req_id=timestamp,
        amount=amount,
        asset_address=ASSET,
        timestamp=timestamp,
        salt="0x" + "22" * 32,
    )
    values.update(overrides)
    return PaymentRequestPayload(**values)


def signed_by(signer, payload: PaymentRequestPayload) -> PaymentRequest:
    signature = signer.unsafe_sign_hash(payload.signing_digest(DOMAIN))
    return PaymentRequest(payload=payload, signature="0x" + signature.signature.hex())


def checkpoint_by(signer, gross: int, cutoff: int) -> SignedCheckpoint:
    payload = CheckpointPayload(
        payer=PAYER.address,
        cycle_id=CYCLE,
        asset_address=ASSET,
        cumulative_gross=gross,
        timestamp_cutoff=cutoff,
    )
    signature = signer.unsafe_sign_hash(payload.signing_digest(DOMAIN))
    return SignedCheckpoint(payload=payload, signature="0x" + signature.signature.hex())


def payments(*entries) -> list:
    return [signed_by(PAYER, payment(amount, ts)) for amount, ts in entries]


def batch(previous=None, authorizations=(), **overrides) -> CheckpointBatchResponse:
    values = dict(
        cycle_id=CYCLE,
        cycle_id_text="0x0:1700000000",
        asset_address=ASSET,
        payer=PAYER.address,
        previous=previous,
        authorizations=list(authorizations),
        max_uncheckpointed=2,
    )
    values.update(overrides)
    return CheckpointBatchResponse(**values)


def build(b: CheckpointBatchResponse):
    return checkpoint_payload(PAYER.address, ASSET, CYCLE, DOMAIN, b)


def refused(b: CheckpointBatchResponse) -> str:
    with pytest.raises(UntrustedCheckpointBatchError) as excinfo:
        build(b)
    return excinfo.value.reason


def test_a_checkpoint_extends_the_previous_one():
    payload = build(
        batch(
            checkpoint_by(PAYER, 50, 1_699_999_000),
            payments((10, 1_700_000_000), (7, 1_700_000_500)),
        )
    )
    assert payload.cumulative_gross == 67
    assert payload.timestamp_cutoff == 1_700_000_500
    assert payload.payer == PAYER.address
    assert payload.cycle_id == CYCLE


def test_a_first_checkpoint_starts_from_zero():
    payload = build(batch(None, payments((10, 1_700_000_000))))
    assert payload.cumulative_gross == 10
    assert payload.timestamp_cutoff == 1_700_000_000


def test_the_cutoff_is_the_latest_payment_whatever_the_order():
    payload = build(batch(None, payments((1, 1_700_000_900), (1, 1_700_000_100))))
    assert payload.timestamp_cutoff == 1_700_000_900


def test_an_empty_batch_needs_no_checkpoint():
    assert build(batch(None, [])) is None


def test_addresses_match_whatever_their_casing():
    """Core may spell an address in any casing; it is the same address."""
    lowered = payment(10, 1_700_000_000, user_address=PAYER.address.lower())
    payload = build(
        batch(None, [signed_by(PAYER, lowered)], payer=PAYER.address.lower())
    )
    assert payload.cumulative_gross == 10


def test_a_payment_the_payer_did_not_sign_is_refused():
    """An operator that slips in a payment the payer never signed would
    inflate what the payer can be charged on default."""
    forged = signed_by(Account.create(), payment(1_000_000, 1_700_000_100))
    reason = refused(batch(None, payments((10, 1_700_000_000)) + [forged]))
    assert "not signed by the payer" in reason


def test_a_payment_with_a_tampered_amount_is_refused():
    authorizations = payments((10, 1_700_000_000))
    authorizations[0].payload.amount = 10_000
    assert "not signed by the payer" in refused(batch(None, authorizations))


def test_another_payers_payment_is_refused():
    stranger = Account.create()
    theirs = signed_by(
        stranger, payment(10, 1_700_000_000, user_address=stranger.address)
    )
    assert "another payer" in refused(batch(None, [theirs]))


def test_a_payment_from_another_cycle_is_refused():
    elsewhere = signed_by(PAYER, payment(10, 1_700_000_000, cycle_id=OTHER_CYCLE))
    assert "another payer, cycle or asset" in refused(batch(None, [elsewhere]))


def test_a_payment_in_another_asset_is_refused():
    token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    elsewhere = signed_by(PAYER, payment(10, 1_700_000_000, asset_address=token))
    assert "another payer, cycle or asset" in refused(batch(None, [elsewhere]))


def test_a_payment_counted_twice_is_refused():
    once = payments((10, 1_700_000_000))
    assert "appears twice" in refused(batch(None, once + once))


def test_a_payment_the_previous_checkpoint_covers_is_refused():
    reason = refused(
        batch(
            checkpoint_by(PAYER, 50, 1_700_000_000),
            payments((10, 1_700_000_000)),
        )
    )
    assert "already covered" in reason


def test_a_previous_checkpoint_the_payer_did_not_sign_is_refused():
    """The previous total is carried forward, so a forged one inflates the new
    checkpoint just as a forged payment would."""
    reason = refused(
        batch(
            checkpoint_by(Account.create(), 1_000_000, 1_699_999_000),
            payments((10, 1_700_000_000)),
        )
    )
    assert "previous checkpoint" in reason


def test_a_previous_checkpoint_for_another_cycle_is_refused():
    previous = checkpoint_by(PAYER, 50, 1_699_999_000)
    previous.payload.cycle_id = OTHER_CYCLE
    reason = refused(batch(previous, payments((10, 1_700_000_000))))
    assert "previous checkpoint is for another payer, cycle or asset" in reason


def test_a_batch_for_another_cycle_is_refused():
    reason = refused(batch(None, payments((10, 1_700_000_000)), cycle_id=OTHER_CYCLE))
    assert "batch is for cycle" in reason


def test_a_batch_for_another_asset_is_refused():
    reason = refused(
        batch(
            None,
            payments((10, 1_700_000_000)),
            asset_address="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        )
    )
    assert "batch is for asset" in reason


def test_a_total_past_u256_is_refused():
    previous = checkpoint_by(PAYER, 2**256 - 5, 1_699_999_000)
    with pytest.raises(InvalidParamsError, match="overflows"):
        build(batch(previous, payments((10, 1_700_000_000))))
