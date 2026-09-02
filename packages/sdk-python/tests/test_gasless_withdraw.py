"""Gasless withdrawal flows against a mocked facilitator, mirroring
``sdk-rust/tests/gasless_withdraw.rs``: the action-tagged wire shape and the
fallback matrix."""

import json

import httpx
import pytest
from stubs import (
    TEST_ADDRESS,
    TOKEN_ADDRESS,
    FakeGateway,
    attach_facilitator,
    make_ctx,
)

from fourmica_sdk.client.model import Route
from fourmica_sdk.client.withdraw import WithdrawClient
from fourmica_sdk.errors import (
    FacilitatorRejectedError,
    InvalidParamsError,
    OutcomeUnknownError,
)

AMOUNT = 1000
TX_HASH = "0x" + "cd" * 32
ZERO = "0x0000000000000000000000000000000000000000"


def withdraw_client(handler, gateway=None) -> WithdrawClient:
    ctx = make_ctx(gateway=gateway)
    attach_facilitator(ctx, handler)
    return WithdrawClient(ctx)


def success():
    return httpx.Response(200, json={"success": True, "txHash": TX_HASH})


def rejection(code):
    return httpx.Response(
        200, json={"success": False, "errorCode": code, "error": code.lower()}
    )


async def test_gasless_request_posts_the_action_tagged_shape():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return success()

    receipt = await withdraw_client(handler).request(None, AMOUNT).gasless().send()

    body = seen["body"]
    assert body["action"] == "request"
    authorization = body["authorization"]
    assert authorization["user"] == TEST_ADDRESS
    assert authorization["asset"] == ZERO
    assert authorization["amount"] == hex(AMOUNT)
    assert set(authorization) == {
        "user",
        "asset",
        "amount",
        "validAfter",
        "validBefore",
        "nonce",
        "signature",
    }
    assert receipt.route == Route.GASLESS
    assert receipt.account == TEST_ADDRESS


async def test_gasless_finalize_needs_no_signature():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return success()

    await withdraw_client(handler).finalize(TOKEN_ADDRESS).gasless().send()

    assert seen["body"] == {
        "action": "finalize",
        "user": TEST_ADDRESS,
        "asset": TOKEN_ADDRESS,
    }


async def test_throttling_falls_back_to_self_funding():
    gateway = FakeGateway()

    receipt = (
        await withdraw_client(lambda request: rejection("RATE_LIMITED"), gateway)
        .request(None, AMOUNT)
        .send()
    )

    assert receipt.route == Route.SELF_FUNDED
    assert any(call[0] == "request_withdrawal" for call in gateway.calls)


async def test_a_rejection_naming_the_request_does_not_fall_back():
    """The user's own transaction would revert for the same reason, so falling
    back would cost them gas to learn what the facilitator already told them
    for free."""
    gateway = FakeGateway()
    client = withdraw_client(lambda request: rejection("SIGNATURE_MISMATCH"), gateway)

    with pytest.raises(FacilitatorRejectedError):
        await client.request(None, AMOUNT).send()
    assert gateway.calls == []


async def test_an_unknown_outcome_does_not_fall_back():
    """A second requestWithdrawal would overwrite the first and restart the
    grace period without anyone noticing."""
    gateway = FakeGateway()
    client = withdraw_client(lambda request: httpx.Response(500, text="boom"), gateway)

    with pytest.raises(OutcomeUnknownError):
        await client.request(None, AMOUNT).send()
    assert gateway.calls == []


async def test_cancel_falls_back_on_unknown_codes():
    """A code this SDK predates is treated as "the facilitator would not pay",
    which costs one transaction at worst and keeps a new rejection from
    stranding the user."""
    gateway = FakeGateway()

    receipt = (
        await withdraw_client(lambda request: rejection("SOMETHING_NEW"), gateway)
        .cancel(TOKEN_ADDRESS)
        .send()
    )

    assert receipt.route == Route.SELF_FUNDED
    assert any(call[0] == "cancel_withdrawal" for call in gateway.calls)


async def test_an_attached_authorization_must_match_the_builder():
    client = withdraw_client(lambda request: success())
    authorization = await client.request(None, AMOUNT).gasless().sign()

    with pytest.raises(InvalidParamsError, match="authorization signs"):
        await (
            client.request(None, AMOUNT * 2)
            .gasless()
            .authorization(authorization)
            .send()
        )


async def test_verify_hits_the_verify_endpoint_only():
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"isValid": True})

    await withdraw_client(handler).finalize(None).gasless().verify()
    assert paths == ["/withdraw/verify"]
