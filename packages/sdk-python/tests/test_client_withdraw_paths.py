import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from stubs import TEST_ADDRESS, TOKEN_ADDRESS, attach_facilitator, make_ctx

from fourmica_sdk.client.facilitator import ALREADY_SUBMITTED, NAMES_THE_REQUEST
from fourmica_sdk.client.model import Asset, Route
from fourmica_sdk.client.withdraw import WithdrawClient
from fourmica_sdk.errors import (
    AmountZeroError,
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    InvalidParamsError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
)
from fourmica_sdk.models import TxReceiptWaitOptions

AMOUNT = 1000
TX_HASH = "0x" + "cd" * 32
GATEWAY_TX = "0x" + "ef" * 32
ZERO = "0x0000000000000000000000000000000000000000"
OTHER = "0x1111111111111111111111111111111111111111"
MAX_U256 = 2**256 - 1


class Recorder:
    def __init__(self, response) -> None:
        self.response = response
        self.requests: list = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((request.url.path, json.loads(request.content)))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response

    @property
    def paths(self) -> list:
        return [path for path, _ in self.requests]


def success(**extra) -> httpx.Response:
    return httpx.Response(200, json={"success": True, "transaction": TX_HASH, **extra})


def rejection(code) -> httpx.Response:
    return httpx.Response(
        200, json={"success": False, "errorReason": code, "errorMessage": code}
    )


def mock_gateway():
    receipt = {"transactionHash": GATEWAY_TX, "status": 1}
    return SimpleNamespace(
        request_withdrawal=AsyncMock(return_value=receipt),
        cancel_withdrawal=AsyncMock(return_value=receipt),
        finalize_withdrawal=AsyncMock(return_value=receipt),
    )


def client_with(handler=None, gateway=None):
    ctx = make_ctx(gateway=gateway or mock_gateway())
    if handler is not None:
        attach_facilitator(ctx, handler)
    return WithdrawClient(ctx), ctx


def builders(client, asset=TOKEN_ADDRESS):
    return {
        "request": client.request(asset, AMOUNT),
        "cancel": client.cancel(asset),
        "finalize": client.finalize(asset),
    }


GATEWAY_METHOD = {
    "request": "request_withdrawal",
    "cancel": "cancel_withdrawal",
    "finalize": "finalize_withdrawal",
}


def test_gasless_is_available_only_with_a_facilitator_configured():
    assert client_with(Recorder(success()))[0].is_gasless_available() is True
    assert client_with()[0].is_gasless_available() is False


@pytest.mark.parametrize("amount", [0, "0", "0x0"])
def test_a_withdrawal_of_zero_is_refused(amount):
    client, _ = client_with()
    with pytest.raises(AmountZeroError, match="withdrawal amount must be positive"):
        client.request(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", [-1, 2**256])
def test_a_withdrawal_outside_u256_is_refused(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError, match=r"negative|does not fit"):
        client.request(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", [True, False, 2.0, None], ids=repr)
def test_a_withdrawal_amount_that_is_not_a_whole_number_is_refused(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError, match="whole number"):
        client.request(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", ["-1", "ten", "1.0"])
def test_a_withdrawal_amount_string_that_is_not_a_u256_is_refused(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError, match="invalid amount"):
        client.request(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
def test_every_withdrawal_step_refuses_a_malformed_asset(step):
    client, _ = client_with()
    start = {
        "request": lambda: client.request("0xdead", AMOUNT),
        "cancel": lambda: client.cancel("0xdead"),
        "finalize": lambda: client.finalize("0xdead"),
    }[step]
    with pytest.raises(ValueError, match="invalid address"):
        start()


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
@pytest.mark.parametrize(
    ("asset", "token"),
    [
        (None, None),
        (ZERO, None),
        (Asset.native(), None),
        (TOKEN_ADDRESS, TOKEN_ADDRESS),
    ],
    ids=["none", "zero", "native", "erc20"],
)
async def test_without_a_facilitator_every_step_is_self_funded(step, asset, token):
    gateway = mock_gateway()
    client, _ = client_with(gateway=gateway)
    options = TxReceiptWaitOptions(timeout_secs=3)
    receipt = await builders(client, asset)[step].send(options)
    method = getattr(gateway, GATEWAY_METHOD[step])
    if step == "request":
        method.assert_awaited_once_with(AMOUNT, token, wait_options=options)
    else:
        method.assert_awaited_once_with(token, wait_options=options)
    assert receipt.route == Route.SELF_FUNDED
    assert receipt.tx_hash == GATEWAY_TX
    assert receipt.account == TEST_ADDRESS
    assert receipt.asset == (token or ZERO)
    assert receipt.raw == {"transactionHash": GATEWAY_TX, "status": 1}


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
async def test_a_gasless_success_never_touches_the_chain(step):
    gateway = mock_gateway()
    recorder = Recorder(success(network="eip155:84532"))
    client, _ = client_with(recorder, gateway)
    receipt = await builders(client)[step].send()
    assert recorder.paths == ["/withdraw"]
    assert recorder.requests[0][1]["action"] == step
    assert receipt.route == Route.GASLESS
    assert receipt.tx_hash == TX_HASH
    assert receipt.network == "eip155:84532"
    assert receipt.asset == TOKEN_ADDRESS
    getattr(gateway, GATEWAY_METHOD[step]).assert_not_awaited()


FALLS_BACK = {
    "rate_limited": rejection("rate_limited"),
    "brand_new_code": rejection("brand_new_code"),
    "sponsorship_unavailable": rejection("sponsorship_unavailable"),
    "http-400": httpx.Response(400, text="bad"),
    "http-401": httpx.Response(401, text="nope"),
    "http-429": httpx.Response(429, text="slow down"),
    "refused": httpx.ConnectError("refused"),
    "bad-url": httpx.UnsupportedProtocol("ftp"),
}


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
@pytest.mark.parametrize("failure", list(FALLS_BACK))
async def test_sponsorship_that_is_unavailable_falls_back_to_self_funding(
    step, failure
):
    gateway = mock_gateway()
    recorder = Recorder(FALLS_BACK[failure])
    client, _ = client_with(recorder, gateway)
    receipt = await builders(client)[step].send()
    assert len(recorder.requests) == 1
    assert receipt.route == Route.SELF_FUNDED
    getattr(gateway, GATEWAY_METHOD[step]).assert_awaited_once()


NO_FALLBACK = {
    **{code: (rejection(code), FacilitatorRejectedError) for code in NAMES_THE_REQUEST},
    **{code: (rejection(code), FacilitatorRejectedError) for code in ALREADY_SUBMITTED},
    "permit2": (rejection("permit2_allowance_required"), Permit2AllowanceRequiredError),
    "http-500": (httpx.Response(500, text="boom"), OutcomeUnknownError),
    "http-408": (httpx.Response(408, text="timeout"), OutcomeUnknownError),
    "read-timeout": (httpx.ReadTimeout("slow"), OutcomeUnknownError),
    "malformed": (httpx.Response(200, text="<html>"), OutcomeUnknownError),
    "not-object": (httpx.Response(200, json="ok"), OutcomeUnknownError),
    "no-hash": (httpx.Response(200, json={"success": True}), OutcomeUnknownError),
}


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
@pytest.mark.parametrize("failure", sorted(NO_FALLBACK))
async def test_a_failure_that_may_have_acted_or_names_the_request_is_not_self_funded(
    step, failure
):
    response, error = NO_FALLBACK[failure]
    gateway = mock_gateway()
    client, _ = client_with(Recorder(response), gateway)
    with pytest.raises(error):
        await builders(client)[step].send()
    getattr(gateway, GATEWAY_METHOD[step]).assert_not_awaited()


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
async def test_an_error_outside_sponsorship_propagates_without_self_funding(step):
    gateway = mock_gateway()
    client, ctx = client_with(Recorder(success()), gateway)
    ctx.facilitator = SimpleNamespace(
        is_configured=lambda: True, post=AsyncMock(side_effect=RuntimeError("bug"))
    )
    with pytest.raises(RuntimeError, match="bug"):
        await builders(client)[step].send()
    getattr(gateway, GATEWAY_METHOD[step]).assert_not_awaited()


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
async def test_a_pinned_gasless_step_never_falls_back(step):
    gateway = mock_gateway()
    client, _ = client_with(Recorder(rejection("rate_limited")), gateway)
    with pytest.raises(FacilitatorRejectedError, match="rate_limited"):
        await builders(client)[step].gasless().send()
    getattr(gateway, GATEWAY_METHOD[step]).assert_not_awaited()


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
async def test_a_pinned_gasless_step_without_a_facilitator_is_not_configured(step):
    gateway = mock_gateway()
    client, _ = client_with(gateway=gateway)
    with pytest.raises(FacilitatorNotConfiguredError, match="no facilitator"):
        await builders(client)[step].gasless().send()
    getattr(gateway, GATEWAY_METHOD[step]).assert_not_awaited()


@pytest.mark.parametrize("step", ["request", "cancel", "finalize"])
async def test_a_pinned_self_funded_step_ignores_a_configured_facilitator(step):
    gateway = mock_gateway()
    recorder = Recorder(success())
    client, _ = client_with(recorder, gateway)
    receipt = await builders(client)[step].self_funded().send()
    assert recorder.requests == []
    assert receipt.route == Route.SELF_FUNDED


async def test_a_gasless_cancel_signs_an_authorization_with_no_amount():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    receipt = await client.cancel(TOKEN_ADDRESS).gasless().send()
    body = recorder.requests[0][1]
    assert body["action"] == "cancel"
    assert set(body["authorization"]) == {
        "user",
        "asset",
        "validAfter",
        "validBefore",
        "nonce",
        "signature",
    }
    assert body["authorization"]["user"] == TEST_ADDRESS
    assert body["authorization"]["asset"] == TOKEN_ADDRESS
    assert receipt.account == TEST_ADDRESS


async def test_the_largest_u256_withdrawal_is_signed_as_a_hex_quantity():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    await client.request(TOKEN_ADDRESS, MAX_U256).gasless().send()
    assert recorder.requests[0][1]["authorization"]["amount"] == hex(MAX_U256)


def test_a_withdrawal_amount_above_u256_is_refused_as_invalid_params():
    client, _ = client_with()
    with pytest.raises(InvalidParamsError):
        client.request(TOKEN_ADDRESS, 2**256)


async def test_a_signed_request_is_redeemed_exactly_as_signed():
    recorder = Recorder(success(user=TEST_ADDRESS.lower(), asset=TOKEN_ADDRESS.lower()))
    client, _ = client_with(recorder)
    authorization = await client.request(TOKEN_ADDRESS, AMOUNT).gasless().sign()
    receipt = (
        await client.request(TOKEN_ADDRESS, AMOUNT)
        .gasless()
        .authorization(authorization)
        .send()
    )
    assert recorder.requests[0][1] == {
        "action": "request",
        "authorization": authorization.to_payload(),
    }
    assert receipt.account == authorization.user
    assert receipt.asset == authorization.asset


async def test_a_request_authorization_matches_a_builder_asset_in_any_case():
    recorder = Recorder(httpx.Response(200, json={"isValid": True}))
    client, _ = client_with(recorder)
    authorization = await client.request(TOKEN_ADDRESS, AMOUNT).gasless().sign()
    await (
        client.request(TOKEN_ADDRESS.lower(), AMOUNT)
        .gasless()
        .authorization(authorization)
        .verify()
    )
    assert recorder.paths == ["/withdraw/verify"]
    assert recorder.requests[0][1]["action"] == "request"


@pytest.mark.parametrize("terminal", ["send", "verify"])
async def test_a_request_authorization_for_another_asset_is_refused_locally(terminal):
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    authorization = await client.request(TOKEN_ADDRESS, AMOUNT).gasless().sign()
    attached = client.request(None, AMOUNT).gasless().authorization(authorization)
    with pytest.raises(InvalidParamsError, match="authorization signs"):
        await getattr(attached, terminal)()
    assert recorder.requests == []


async def test_a_request_authorization_for_another_amount_is_refused_before_verifying():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    authorization = await client.request(TOKEN_ADDRESS, AMOUNT).gasless().sign()
    attached = (
        client.request(TOKEN_ADDRESS, AMOUNT + 1).gasless().authorization(authorization)
    )
    with pytest.raises(InvalidParamsError, match=f"asks {AMOUNT + 1}"):
        await attached.verify()
    assert recorder.requests == []


async def test_a_signed_cancel_is_redeemed_exactly_as_signed():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    authorization = await client.cancel(TOKEN_ADDRESS).gasless().sign()
    receipt = (
        await client.cancel(TOKEN_ADDRESS.lower())
        .gasless()
        .authorization(authorization)
        .send()
    )
    assert recorder.requests[0][1] == {
        "action": "cancel",
        "authorization": authorization.to_payload(),
    }
    assert receipt.route == Route.GASLESS


async def test_a_valid_cancel_authorization_verifies_without_submitting():
    recorder = Recorder(httpx.Response(200, json={"isValid": True}))
    client, _ = client_with(recorder)
    authorization = await client.cancel(None).gasless().sign()
    assert (
        await client.cancel(ZERO).gasless().authorization(authorization).verify()
        is None
    )
    assert recorder.paths == ["/withdraw/verify"]


@pytest.mark.parametrize("terminal", ["send", "verify"])
async def test_a_cancel_authorization_for_another_asset_is_refused_locally(terminal):
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    authorization = await client.cancel(TOKEN_ADDRESS).gasless().sign()
    attached = client.cancel(None).gasless().authorization(authorization)
    with pytest.raises(InvalidParamsError, match="authorization cancels for"):
        await getattr(attached, terminal)()
    assert recorder.requests == []


async def test_a_cancel_verification_rejection_is_raised_with_its_code():
    recorder = Recorder(
        httpx.Response(
            200,
            json={
                "isValid": False,
                "invalidReason": "no_withdrawal_requested",
                "invalidMessage": "nothing to cancel",
                "extra": {"retryable": False},
            },
        )
    )
    client, _ = client_with(recorder)
    authorization = await client.cancel(TOKEN_ADDRESS).gasless().sign()
    with pytest.raises(FacilitatorRejectedError, match="nothing to cancel") as raised:
        await (
            client.cancel(TOKEN_ADDRESS).gasless().authorization(authorization).verify()
        )
    assert raised.value.code == "no_withdrawal_requested"


async def test_a_finalize_verification_rejection_names_the_grace_period():
    recorder = Recorder(
        httpx.Response(
            200,
            json={"isValid": False, "invalidReason": "grace_period_not_elapsed"},
        )
    )
    client, _ = client_with(recorder)
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.finalize(TOKEN_ADDRESS).gasless().verify()
    assert raised.value.code == "grace_period_not_elapsed"
    assert recorder.requests[0][1] == {
        "action": "finalize",
        "user": TEST_ADDRESS,
        "asset": TOKEN_ADDRESS,
    }


@pytest.mark.parametrize("field", ["user", "asset"])
async def test_an_echo_naming_someone_else_is_an_unknown_outcome(field):
    client, _ = client_with(Recorder(success(**{field: OTHER})))
    with pytest.raises(OutcomeUnknownError, match=f"echoed {field}"):
        await client.finalize(TOKEN_ADDRESS).gasless().send()


@pytest.mark.parametrize("transaction", ["", "cd" * 32, 7, None])
async def test_success_with_an_unusable_transaction_hash_is_an_unknown_outcome(
    transaction,
):
    client, _ = client_with(
        Recorder(
            httpx.Response(200, json={"success": True, "transaction": transaction})
        )
    )
    with pytest.raises(OutcomeUnknownError, match="without a transaction"):
        await client.request(TOKEN_ADDRESS, AMOUNT).gasless().send()


async def test_a_rejection_that_was_already_broadcast_carries_its_transaction():
    client, _ = client_with(
        Recorder(
            httpx.Response(
                200,
                json={
                    "success": False,
                    "errorReason": "invalid_transaction_state",
                    "transaction": TX_HASH,
                },
            )
        )
    )
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.request(TOKEN_ADDRESS, AMOUNT).send()
    assert raised.value.transaction == TX_HASH
    assert "facilitator gave no reason" in str(raised.value)


async def test_concurrent_gasless_requests_never_share_a_nonce():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    await asyncio.gather(
        *(client.request(TOKEN_ADDRESS, AMOUNT).gasless().send() for _ in range(4))
    )
    nonces = {body["authorization"]["nonce"] for _, body in recorder.requests}
    assert len(nonces) == 4
