"""Guarantee flows against a live core: the checks unit tests cannot replace.

A receipt issued here proves core accepts the payer's ClearingHouse-domain
signature over a cycle-scoped payment end to end, and that its operator signs
receipts under the GuaranteeRegistry domain this SDK verifies; the negative
case proves core actually checks the payer's signature.

See live_stack.py for environment and the required WalletRole grant.
"""

import dataclasses

import pytest
from live_stack import (
    ensure_collateral,
    requires_live_stack,
    signed_payment,
)

from fourmica_sdk import PaymentRequest, RpcError

pytestmark = [pytest.mark.integration, requires_live_stack]

COLLATERAL = 10**15  # covers every guarantee this suite issues


async def test_guarantee_flow_end_to_end(payer, recipient):
    await ensure_collateral(payer, None, COLLATERAL)

    request = await signed_payment(payer, recipient)
    receipt = await recipient.payment.issue_guarantee(request)
    verified = recipient.payment.verify_guarantee(receipt)

    assert verified.amount == request.payload.amount
    assert verified.req_id == request.payload.req_id
    assert verified.client.lower() == payer.signer_address.lower()
    assert verified.recipient.lower() == recipient.signer_address.lower()
    assert verified.version == 1
    assert verified.cycle_id == int(request.payload.cycle_id, 16)
    assert verified.timestamp == request.payload.timestamp

    # Either side can check a receipt offline.
    assert payer.payment.verify_guarantee(receipt) == verified


async def test_core_rejects_a_tampered_payment(payer, recipient):
    """A signature over one payment must not issue a different one — the
    recipient inflates the amount after the payer signed."""
    await ensure_collateral(payer, None, COLLATERAL)

    request = await signed_payment(payer, recipient)
    inflated = PaymentRequest(
        payload=dataclasses.replace(request.payload, amount=request.payload.amount * 2),
        signature=request.signature,
    )
    with pytest.raises(RpcError) as excinfo:
        await recipient.payment.issue_guarantee(inflated)
    assert excinfo.value.status_code is not None
    assert 400 <= excinfo.value.status_code < 500


async def test_public_params_advertise_current_protocol(payer):
    params = payer.public_params
    assert 1 in params.supported_payment_payload_versions
    assert params.eip712_name == "4micaClearingHouse"
    for address in (
        params.contract_address,
        params.clearing_house_address,
        params.guarantee_registry_address,
        params.guarantee_signer,
    ):
        assert address.startswith("0x")


async def test_recipient_payment_listing_is_served(recipient):
    received = await recipient.payment.list_received()
    assert isinstance(received, list)
    for payment in received:
        assert payment.recipient_address.lower() == recipient.signer_address.lower()


async def test_two_guarantees_share_the_open_cycle(payer, recipient):
    """Consecutive guarantees in one asset bind to the same settlement cycle —
    the aggregation the netting model relies on."""
    await ensure_collateral(payer, None, COLLATERAL)

    verified = []
    for _ in range(2):
        request = await signed_payment(payer, recipient)
        receipt = await recipient.payment.issue_guarantee(request)
        verified.append(recipient.payment.verify_guarantee(receipt))

    assert verified[0].cycle_id == verified[1].cycle_id


async def test_payer_checkpoints_what_it_owes(payer, recipient):
    """Core accepts a checkpoint this SDK built from core's own batch, and the
    payer's next payment is still accepted past its cutoff."""
    await ensure_collateral(payer, None, COLLATERAL)

    request = await signed_payment(payer, recipient)
    await recipient.payment.issue_guarantee(request)

    accepted = await payer.payment.checkpoint_active_cycle()
    assert accepted is not None
    assert accepted.covered >= 1
    assert accepted.timestamp_cutoff >= request.payload.timestamp

    after = await signed_payment(payer, recipient)
    assert after.payload.timestamp > accepted.timestamp_cutoff
    await recipient.payment.issue_guarantee(after)
