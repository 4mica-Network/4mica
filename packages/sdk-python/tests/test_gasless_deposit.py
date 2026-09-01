"""Gasless deposit flows against a mocked facilitator, mirroring
``sdk-rust/tests/gasless_deposit.rs``."""

import json

import httpx
import pytest
from stubs import (
    TEST_ADDRESS,
    TOKEN_ADDRESS,
    FakeGateway,
    FakeRpc,
    attach_facilitator,
    make_ctx,
    supported_tokens,
)

from fourmica_sdk.client.deposit import DepositClient
from fourmica_sdk.client.model import TokenRoute
from fourmica_sdk.errors import (
    FacilitatorRejectedError,
    InvalidParamsError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
)

AMOUNT = 1_000_000
TX_HASH = "0x" + "ab" * 32


def deposit_client(handler, gateway=None) -> DepositClient:
    ctx = make_ctx(rpc=FakeRpc(supported_tokens=supported_tokens()), gateway=gateway)
    attach_facilitator(ctx, handler)
    return DepositClient(ctx)


def success(extra=None):
    body = {"success": True, "txHash": TX_HASH}
    body.update(extra or {})
    return httpx.Response(200, json=body)


def rejection(code, extra=None):
    body = {"success": False, "errorCode": code, "error": code.lower()}
    body.update(extra or {})
    return httpx.Response(200, json=body)


async def test_eip3009_send_posts_the_wire_shape():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return success()

    receipt = await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).eip3009().send()

    assert seen["path"] == "/deposit"
    body = seen["body"]
    assert body["assetTransferMethod"] == "eip3009"
    assert body["asset"].lower() == TOKEN_ADDRESS.lower()
    assert body["amount"] == str(AMOUNT)
    authorization = body["authorization"]
    assert authorization["from"] == TEST_ADDRESS
    assert authorization["validAfter"] == "0x0"
    assert set(authorization) == {
        "from",
        "validAfter",
        "validBefore",
        "nonce",
        "v",
        "r",
        "s",
    }

    assert receipt.route == TokenRoute.EIP3009
    assert receipt.account == TEST_ADDRESS
    assert receipt.tx_hash == TX_HASH


async def test_gasless_falls_from_eip3009_to_permit2_on_simulation_revert():
    methods = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        methods.append(body["assetTransferMethod"])
        if body["assetTransferMethod"] == "eip3009":
            return rejection("SIMULATION_REVERTED")
        return success()

    receipt = await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).gasless().send()

    assert methods == ["eip3009", "permit2"]
    assert receipt.route == TokenRoute.PERMIT2


async def test_sponsored_permit2_signs_the_missing_approval():
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if "eip2612Permit" not in body:
            return rejection(
                "PERMIT2_ALLOWANCE_REQUIRED",
                {"permit2Allowance": {"eip2612Nonce": "7"}},
            )
        return success()

    receipt = (
        await deposit_client(handler)
        .of(TOKEN_ADDRESS, AMOUNT)
        .permit2()
        .sponsor_approval()
        .send()
    )

    assert receipt.route == TokenRoute.SPONSORED_PERMIT2
    permit = bodies[-1]["eip2612Permit"]
    assert permit["value"] == str(2**256 - 1)
    assert set(permit) == {"value", "deadline", "v", "r", "s"}
    # The retry reuses the same Permit2 authorization it already signed.
    assert bodies[0]["permit2Authorization"] == bodies[-1]["permit2Authorization"]


async def test_unsponsorable_allowance_is_surfaced():
    def handler(request: httpx.Request) -> httpx.Response:
        return rejection("PERMIT2_ALLOWANCE_REQUIRED")

    with pytest.raises(Permit2AllowanceRequiredError) as excinfo:
        await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).permit2().send()
    assert excinfo.value.eip2612_nonce is None


async def test_auto_route_self_funds_native():
    gateway = FakeGateway()
    client = deposit_client(lambda request: rejection("UNREACHED"), gateway)

    receipt = await client.of(None, AMOUNT).send()

    assert receipt.route == TokenRoute.SELF_FUNDED
    assert any(call[0] == "deposit" for call in gateway.calls)


async def test_a_rejection_that_names_the_deposit_is_not_retried():
    def handler(request: httpx.Request) -> httpx.Response:
        return rejection("EXPIRED")

    with pytest.raises(FacilitatorRejectedError) as excinfo:
        await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).gasless().send()
    assert excinfo.value.code == "EXPIRED"


async def test_a_mismatched_echo_is_an_unknown_outcome():
    other = "0x1111111111111111111111111111111111111111"

    def handler(request: httpx.Request) -> httpx.Response:
        return success({"from": other})

    with pytest.raises(OutcomeUnknownError, match="echoed from"):
        await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).eip3009().send()


async def test_an_unreadable_amount_echo_is_an_unknown_outcome():
    def handler(request: httpx.Request) -> httpx.Response:
        return success({"amount": "not-a-number"})

    with pytest.raises(OutcomeUnknownError, match="echoed amount"):
        await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).eip3009().send()


async def test_success_without_tx_hash_is_an_unknown_outcome():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"success": True})

    with pytest.raises(OutcomeUnknownError, match="txHash"):
        await deposit_client(handler).of(TOKEN_ADDRESS, AMOUNT).eip3009().send()


async def test_verify_reports_the_rejection_without_submitting():
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(
            200,
            json={"isValid": False, "invalidReason": "expired", "errorCode": "EXPIRED"},
        )

    client = deposit_client(handler)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().sign()
    with pytest.raises(FacilitatorRejectedError, match="expired"):
        await (
            client.of(TOKEN_ADDRESS, AMOUNT)
            .eip3009()
            .authorization(authorization)
            .verify()
        )
    assert paths == ["/deposit/verify"]


async def test_gasless_pin_refuses_native():
    client = deposit_client(lambda request: success())
    with pytest.raises(InvalidParamsError, match="native"):
        await client.of(None, AMOUNT).gasless().send()
