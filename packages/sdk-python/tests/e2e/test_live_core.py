"""Guarantee flows against a live core: the checks unit tests cannot replace.

A certificate issued here proves core accepts the 2.0 request signature
(verifyingContract domain, tabId-less struct) end to end, for both signing
schemes; the negative case proves core actually checks it.

See live_stack.py for environment and the required WalletRole grant.
"""

import pytest
from live_stack import (
    build_claims,
    ensure_collateral,
    guarantee_amount,
    requires_live_stack,
)

from fourmica_sdk import RpcError, SigningScheme

pytestmark = [pytest.mark.integration, requires_live_stack]

COLLATERAL = 10**15  # covers every guarantee this suite issues


async def test_guarantee_flow_end_to_end(payer, recipient):
    await ensure_collateral(payer, None, COLLATERAL)

    claims = build_claims(payer, recipient)
    signature = await payer.payment.sign_request(claims)

    cert = await recipient.payment.issue_guarantee(claims, signature)
    verified = recipient.payment.verify_guarantee(cert)

    assert verified.amount == claims.amount
    assert verified.user_address.lower() == payer.signer_address.lower()
    assert verified.recipient_address.lower() == recipient.signer_address.lower()
    assert verified.version == 1
    assert verified.cycle_id > 0
    assert verified.timestamp == claims.timestamp


async def test_eip191_guarantee_flow(payer, recipient):
    await ensure_collateral(payer, None, COLLATERAL)

    claims = build_claims(payer, recipient)
    signature = await payer.payment.sign_request(claims, SigningScheme.EIP191)
    assert signature.scheme == SigningScheme.EIP191

    cert = await recipient.payment.issue_guarantee(
        claims, signature, SigningScheme.EIP191
    )
    verified = recipient.payment.verify_guarantee(cert)
    assert verified.amount == claims.amount


async def test_core_rejects_tampered_claims(payer, recipient):
    """A signature over one set of claims must not issue a different one —
    the recipient inflates the amount after the payer signed."""
    await ensure_collateral(payer, None, COLLATERAL)

    claims = build_claims(payer, recipient)
    signature = await payer.payment.sign_request(claims)

    inflated = build_claims(payer, recipient, amount=claims.amount * 2)
    with pytest.raises(RpcError) as excinfo:
        await recipient.payment.issue_guarantee(inflated, signature)
    assert excinfo.value.status_code is not None
    assert 400 <= excinfo.value.status_code < 500


async def test_public_params_advertise_current_protocol(payer):
    params = payer.public_params
    assert 1 in params.supported_guarantee_versions
    assert len(params.public_key) == 48
    assert params.contract_address.startswith("0x")
    # The connected client resolved a v1 domain from them.
    assert len(payer.payment.guarantee_domain) == 32


async def test_recipient_payment_listing_is_served(recipient):
    received = await recipient.payment.list_received()
    assert isinstance(received, list)
    for payment in received:
        assert payment.recipient_address.lower() == recipient.signer_address.lower()


async def test_two_guarantees_share_the_open_cycle(payer, recipient):
    """Consecutive guarantees in one asset bind to the same settlement cycle —
    the aggregation the netting model relies on."""
    await ensure_collateral(payer, None, COLLATERAL)

    certs = []
    for _ in range(2):
        claims = build_claims(payer, recipient, amount=guarantee_amount())
        signature = await payer.payment.sign_request(claims)
        cert = await recipient.payment.issue_guarantee(claims, signature)
        certs.append(recipient.payment.verify_guarantee(cert))

    assert certs[0].cycle_id == certs[1].cycle_id
