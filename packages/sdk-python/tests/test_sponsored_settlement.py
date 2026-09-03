"""Sponsored clearing settlement against a mocked facilitator, mirroring
``sdk-rust/tests/sponsored_settlement.rs``: cycle-bound nonces, the sponsored
approval retry, and the fallback matrix."""

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

from fourmica_sdk.client.model import Route, TokenRoute
from fourmica_sdk.client.settlement import SettlementClient
from fourmica_sdk.errors import FacilitatorRejectedError, InvalidParamsError
from fourmica_sdk.models import ClearingSettlementActionResponse

CYCLE_ID = "0x" + "aa" * 32
CLEARING_HOUSE = "0x2222222222222222222222222222222222222222"
TX_HASH = "0x" + "ef" * 32
ZERO = "0x0000000000000000000000000000000000000000"


def action(**overrides) -> ClearingSettlementActionResponse:
    raw = {
        "contract_address": CLEARING_HOUSE,
        "function_name": "payNetDebit",
        "action": "pay_net_debit",
        "cycle_id": CYCLE_ID,
        "cycle_id_text": "cycle",
        "asset_address": TOKEN_ADDRESS,
        "participant": TEST_ADDRESS,
        "amount": "5000",
        "payable_value": "0",
        "proof": ["0x" + "dd" * 32],
    }
    raw.update(overrides)
    return ClearingSettlementActionResponse.from_rpc(raw)


def settlement(handler, gateway=None, **rpc_responses) -> SettlementClient:
    responses = {"supported_tokens": supported_tokens(), **rpc_responses}
    ctx = make_ctx(rpc=FakeRpc(**responses), gateway=gateway)
    attach_facilitator(ctx, handler)
    return SettlementClient(ctx)


def success(extra=None):
    body = {"success": True, "txHash": TX_HASH}
    body.update(extra or {})
    return httpx.Response(200, json=body)


def rejection(code, extra=None):
    body = {"success": False, "errorCode": code, "error": code.lower()}
    body.update(extra or {})
    return httpx.Response(200, json=body)


async def test_eip3009_pay_binds_the_cycle_as_its_nonce():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return success()

    client = settlement(handler, pay_action=action())
    receipt = await client.pay(CYCLE_ID).eip3009().send()

    assert seen["path"] == "/clearing/pay"
    body = seen["body"]
    assert body["cycleId"] == CYCLE_ID
    assert body["assetTransferMethod"] == "eip3009"
    assert body["authorization"]["nonce"] == CYCLE_ID
    assert receipt.route == TokenRoute.EIP3009
    assert receipt.account == TEST_ADDRESS


async def test_sponsored_permit2_pay_pins_uint256_cycle_nonce():
    bodies = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if "eip2612Permit" not in body:
            return rejection(
                "PERMIT2_ALLOWANCE_REQUIRED",
                {"permit2Allowance": {"eip2612Nonce": "3"}},
            )
        return success()

    client = settlement(handler, pay_action=action())
    receipt = await client.pay(CYCLE_ID).permit2().sponsor_approval().send()

    assert receipt.route == TokenRoute.SPONSORED_PERMIT2
    for body in bodies:
        assert body["permit2Authorization"]["nonce"] == hex(int(CYCLE_ID, 16))
    assert "eip2612Permit" in bodies[-1]


async def test_auto_pay_falls_back_to_self_funded_when_unsponsorable():
    """EIP-3009 refused as a failed simulation, Permit2 refused with no
    sponsorable approval — the auto route pays self-funded, allowance
    pre-checked."""
    gateway = FakeGateway(allowance=5000)

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["assetTransferMethod"] == "eip3009":
            return rejection("SIMULATION_REVERTED")
        return rejection("PERMIT2_ALLOWANCE_REQUIRED")

    client = settlement(handler, gateway=gateway, pay_action=action())
    receipt = await client.pay(CYCLE_ID).send()

    assert receipt.route == TokenRoute.SELF_FUNDED
    call = next(c for c in gateway.calls if c[0] == "pay_net_debit")
    assert call[1] == CLEARING_HOUSE


async def test_auto_pay_does_not_retry_an_insufficient_balance():
    """INSUFFICIENT_BALANCE names the payment: the self-funded route pulls
    from the same wallet and fails the same way, after paying gas."""
    gateway = FakeGateway(allowance=5000)

    def handler(request: httpx.Request) -> httpx.Response:
        return rejection("INSUFFICIENT_BALANCE")

    client = settlement(handler, gateway=gateway, pay_action=action())
    with pytest.raises(FacilitatorRejectedError):
        await client.pay(CYCLE_ID).send()
    assert all(c[0] != "pay_net_debit" for c in gateway.calls)


async def test_native_debits_cannot_go_gasless():
    client = settlement(
        lambda request: success(), pay_action=action(asset_address=ZERO)
    )
    with pytest.raises(InvalidParamsError, match="native"):
        await client.pay(CYCLE_ID).gasless().send()


async def test_gasless_claim_names_the_claim_only():
    """Nothing is signed: the facilitator resolves the claim's terms from
    core, so the request can only name which claim to submit."""
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return success({"creditor": TEST_ADDRESS})

    client = settlement(handler)
    receipt = await client.claim(CYCLE_ID).gasless().send()

    assert seen["path"] == "/clearing/claim"
    assert seen["body"] == {"cycleId": CYCLE_ID, "creditor": TEST_ADDRESS}
    assert receipt.route == Route.GASLESS
    assert receipt.account == TEST_ADDRESS


async def test_claim_for_another_creditor_travels_in_the_request():
    creditor = "0x00000000000000000000000000000000000000Be"
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return success()

    client = settlement(handler)
    receipt = await client.claim(CYCLE_ID).creditor(creditor).gasless().send()

    assert seen["body"]["creditor"] == creditor
    assert receipt.account == creditor


async def test_claim_falls_back_when_the_facilitator_declines():
    gateway = FakeGateway()
    client = settlement(
        lambda request: rejection("RATE_LIMITED"),
        gateway=gateway,
        claim_action=action(
            function_name="claimNetCreditFor", action="claim_net_credit"
        ),
    )

    receipt = await client.claim(CYCLE_ID).send()

    assert receipt.route == Route.SELF_FUNDED
    assert any(c[0] == "claim_net_credit_for" for c in gateway.calls)


async def test_claim_does_not_fall_back_on_an_unfunded_cycle():
    gateway = FakeGateway()
    client = settlement(
        lambda request: rejection("ACTION_UNAVAILABLE"), gateway=gateway
    )

    with pytest.raises(FacilitatorRejectedError):
        await client.claim(CYCLE_ID).send()
    assert gateway.calls == []


async def test_pay_verify_preflights_without_submitting():
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/verify"):
            return httpx.Response(200, json={"isValid": True})
        return success()

    client = settlement(handler, pay_action=action())
    authorization = await client.pay(CYCLE_ID).eip3009().sign()
    await client.pay(CYCLE_ID).eip3009().authorization(authorization).verify()

    assert paths == ["/clearing/pay/verify"]
