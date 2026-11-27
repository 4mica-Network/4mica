import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from stubs import (
    CONTRACT_ADDRESS,
    TEST_ADDRESS,
    TOKEN_ADDRESS,
    FakeGateway,
    FakeRpc,
    attach_facilitator,
    make_ctx,
    supported_tokens,
)

from fourmica_sdk.client.deposit import DepositClient
from fourmica_sdk.client.model import Asset, TokenRoute
from fourmica_sdk.errors import (
    AmountZeroError,
    Erc20AllowanceRequiredError,
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    InvalidParamsError,
    MissingTokenDomainSeparatorError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
    SponsorshipTransportError,
)
from fourmica_sdk.models import TxReceiptWaitOptions

AMOUNT = 1_000_000
TX_HASH = "0x" + "ab" * 32
ZERO = "0x0000000000000000000000000000000000000000"
MAX_U256 = 2**256 - 1
OTHER = "0x1111111111111111111111111111111111111111"


class Recorder:
    def __init__(self, *responses) -> None:
        self.responses = list(responses)
        self.requests: list = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(
            (request.url.path, json.loads(request.content) if request.content else None)
        )
        response = (
            self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        )
        return response(request) if callable(response) else response

    @property
    def paths(self) -> list:
        return [path for path, _ in self.requests]

    @property
    def methods(self) -> list:
        return [body["assetTransferMethod"] for _, body in self.requests]


def success(**extra) -> httpx.Response:
    return httpx.Response(200, json={"success": True, "transaction": TX_HASH, **extra})


def rejection(code, nonce=None, **extra) -> httpx.Response:
    body = {"success": False, "errorReason": code, "errorMessage": code, **extra}
    if nonce is not None:
        body["extra"] = {"details": {"eip2612Nonce": nonce}}
    return httpx.Response(200, json=body)


PUBLISHED = supported_tokens()


def client_with(handler=None, gateway=None, domain=PUBLISHED):
    ctx = make_ctx(rpc=FakeRpc(supported_tokens=domain), gateway=gateway)
    if handler is not None:
        attach_facilitator(ctx, handler)
    return DepositClient(ctx), ctx


def mock_gateway(allowance=0):
    receipt = {"transactionHash": TX_HASH, "status": 1}
    return SimpleNamespace(
        approve_erc20=AsyncMock(return_value=receipt),
        deposit=AsyncMock(return_value=receipt),
        erc20_allowance=AsyncMock(return_value=allowance),
    )


def test_gasless_is_available_only_with_a_facilitator_configured():
    assert client_with(Recorder(success()))[0].is_gasless_available() is True
    assert client_with()[0].is_gasless_available() is False


def test_a_deposit_of_zero_is_refused_before_anything_is_signed():
    client, _ = client_with()
    with pytest.raises(AmountZeroError, match="must be positive"):
        client.of(TOKEN_ADDRESS, 0)


@pytest.mark.parametrize("amount", [-1, -(2**255), "-1"])
def test_a_negative_deposit_is_refused_as_an_invalid_amount(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError, match="cannot be negative"):
        client.of(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", [True, False, 1.5, 1.0, None, b"10", [1]], ids=repr)
def test_a_deposit_amount_that_is_not_a_whole_number_is_refused(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError, match="whole number of base units"):
        client.of(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", ["abc", "-5", "1.5", "", "0xZZ"])
def test_a_deposit_amount_string_that_is_not_a_u256_is_refused(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError, match="invalid amount"):
        client.of(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", ["0", "0x0", " 0 "])
def test_a_deposit_amount_string_of_zero_is_refused_as_zero(amount):
    client, _ = client_with()
    with pytest.raises(AmountZeroError):
        client.of(TOKEN_ADDRESS, amount)


@pytest.mark.parametrize("amount", ["1000000", "0xf4240", " 1000000 ", "0XF4240"])
async def test_a_decimal_or_hex_amount_string_is_sent_as_decimal_base_units(amount):
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, amount).eip3009().send()
    assert recorder.requests[0][1]["amount"] == str(AMOUNT)
    assert receipt.amount == AMOUNT


@pytest.mark.parametrize("asset", ["0x123", "not-an-address", "0x" + "g" * 40])
def test_a_malformed_asset_address_is_refused(asset):
    client, _ = client_with()
    with pytest.raises(ValueError, match="invalid address"):
        client.of(asset, AMOUNT)


async def test_a_lowercase_token_address_is_checksummed_before_it_is_sent():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS.lower(), AMOUNT).eip3009().send()
    assert recorder.requests[0][1]["asset"] == TOKEN_ADDRESS
    assert receipt.asset == TOKEN_ADDRESS


async def test_the_largest_u256_amount_is_signed_and_sent_verbatim():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, MAX_U256).eip3009().send()
    assert recorder.requests[0][1]["amount"] == str(MAX_U256)
    assert receipt.amount == MAX_U256


@pytest.mark.parametrize("amount", [2**256, str(2**256)], ids=["int", "str"])
def test_a_deposit_amount_above_u256_is_refused_as_invalid_params(amount):
    client, _ = client_with()
    with pytest.raises(InvalidParamsError):
        client.of(TOKEN_ADDRESS, amount)


async def test_an_amount_above_u256_never_reaches_the_facilitator():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    with pytest.raises(InvalidParamsError, match="does not fit in a u256"):
        await client.of(TOKEN_ADDRESS, 2**256).eip3009().send()
    assert recorder.requests == []


@pytest.mark.parametrize("asset", [None, ZERO, Asset.native()], ids=repr)
async def test_a_native_deposit_without_a_facilitator_rides_as_value(asset):
    gateway = FakeGateway()
    client, _ = client_with(gateway=gateway)
    receipt = await client.of(asset, AMOUNT).send()
    assert gateway.calls == [("deposit", AMOUNT, None)]
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert receipt.asset == ZERO
    assert receipt.account == TEST_ADDRESS
    assert receipt.tx_hash == TX_HASH
    assert receipt.raw == gateway.receipt


async def test_an_erc20_deposit_without_a_facilitator_is_self_funded_without_an_allowance_check():
    gateway = FakeGateway()
    client, _ = client_with(gateway=gateway)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert gateway.calls == [("deposit", AMOUNT, TOKEN_ADDRESS)]
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert receipt.asset == TOKEN_ADDRESS
    assert receipt.amount == AMOUNT


async def test_the_automatic_route_stops_at_eip3009_when_it_succeeds():
    recorder = Recorder(success(network="eip155:84532"))
    gateway = FakeGateway()
    client, _ = client_with(recorder, gateway)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert recorder.methods == ["eip3009"]
    assert receipt.route == TokenRoute.EIP3009
    assert receipt.network == "eip155:84532"
    assert gateway.calls == []


async def test_the_automatic_route_moves_to_permit2_when_eip3009_is_unsupported():
    recorder = Recorder(rejection("unsupported_transfer_method"), success())
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert recorder.methods == ["eip3009", "permit2"]
    assert receipt.route == TokenRoute.PERMIT2
    assert "eip2612Permit" not in recorder.requests[1][1]


async def test_a_token_with_no_published_domain_skips_eip3009_without_posting_it():
    recorder = Recorder(success())
    client, _ = client_with(recorder, domain=supported_tokens(None))
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert recorder.methods == ["permit2"]
    assert receipt.route == TokenRoute.PERMIT2


@pytest.mark.parametrize(
    "code", ["authorization_expired", "invalid_signature", "nonce_already_used"]
)
async def test_the_automatic_route_does_not_retry_a_rejection_naming_the_deposit(code):
    recorder = Recorder(rejection(code))
    gateway = FakeGateway()
    client, _ = client_with(recorder, gateway)
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert raised.value.code == code
    assert recorder.methods == ["eip3009"]
    assert gateway.calls == []


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(500, text="boom"), OutcomeUnknownError),
        (httpx.Response(408, text="slow"), OutcomeUnknownError),
        (httpx.Response(400, text="bad"), SponsorshipTransportError),
        (httpx.Response(200, text="not json"), OutcomeUnknownError),
        (httpx.Response(200, json=[1, 2]), OutcomeUnknownError),
        (rejection("sponsorship_unavailable"), FacilitatorNotConfiguredError),
    ],
    ids=["500", "408", "400", "malformed", "array", "unavailable"],
)
async def test_the_automatic_route_never_self_funds_after_an_eip3009_failure(
    response, error
):
    recorder = Recorder(response)
    gateway = FakeGateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway)
    with pytest.raises(error):
        await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert len(recorder.requests) == 1
    assert gateway.calls == []


async def test_an_unsponsorable_permit2_allowance_falls_back_to_a_covered_self_funded_deposit():
    recorder = Recorder(
        rejection("simulation_reverted"), rejection("permit2_allowance_required")
    )
    gateway = FakeGateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway)
    options = TxReceiptWaitOptions(timeout_secs=5)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send(options)
    assert recorder.methods == ["eip3009", "permit2"]
    assert gateway.calls == [
        ("erc20_allowance", TOKEN_ADDRESS, CONTRACT_ADDRESS),
        ("deposit", AMOUNT, TOKEN_ADDRESS),
    ]
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert receipt.account == TEST_ADDRESS
    assert receipt.asset == TOKEN_ADDRESS
    assert receipt.amount == AMOUNT
    assert receipt.raw == gateway.receipt


async def test_the_self_funded_fallback_forwards_the_wait_options():
    recorder = Recorder(
        rejection("simulation_reverted"), rejection("permit2_allowance_required")
    )
    gateway = mock_gateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway)
    options = TxReceiptWaitOptions(timeout_secs=5, poll_latency_secs=1)
    await client.of(TOKEN_ADDRESS, AMOUNT).send(options)
    gateway.deposit.assert_awaited_once_with(
        AMOUNT, TOKEN_ADDRESS, wait_options=options
    )


@pytest.mark.parametrize("allowance", [0, AMOUNT - 1])
async def test_a_short_allowance_stops_the_fallback_with_the_amount_still_needed(
    allowance,
):
    recorder = Recorder(
        rejection("simulation_reverted"), rejection("permit2_allowance_required")
    )
    gateway = FakeGateway(allowance=allowance)
    client, _ = client_with(recorder, gateway)
    with pytest.raises(Erc20AllowanceRequiredError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert raised.value.token == TOKEN_ADDRESS
    assert raised.value.spender == CONTRACT_ADDRESS
    assert raised.value.allowance == allowance
    assert raised.value.needed == AMOUNT
    assert "call approve() first" in str(raised.value)
    assert [call[0] for call in gateway.calls] == ["erc20_allowance"]


async def test_a_sponsorable_allowance_that_cannot_be_signed_falls_back_to_self_funding():
    recorder = Recorder(rejection("permit2_allowance_required", nonce="7"))
    gateway = FakeGateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway, domain=supported_tokens(None))
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert recorder.methods == ["permit2"]
    assert receipt.route == TokenRoute.SELF_FUNDED


async def test_a_sponsored_approval_refused_again_falls_back_to_self_funding():
    recorder = Recorder(
        rejection("simulation_reverted"),
        rejection("permit2_allowance_required", nonce="0x7"),
        rejection("permit2_allowance_required"),
    )
    gateway = FakeGateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert recorder.methods == ["eip3009", "permit2", "permit2"]
    assert "eip2612Permit" in recorder.requests[2][1]
    assert receipt.route == TokenRoute.SELF_FUNDED


async def test_the_automatic_route_signs_the_sponsored_approval_with_the_echoed_nonce():
    recorder = Recorder(
        rejection("simulation_reverted"),
        rejection("permit2_allowance_required", nonce="0x2a"),
        success(),
    )
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert receipt.route == TokenRoute.SPONSORED_PERMIT2
    permit = recorder.requests[2][1]["eip2612Permit"]
    assert permit["value"] == str(MAX_U256)
    assert int(permit["deadline"]) > 0


async def test_a_sponsored_approval_refused_for_another_reason_is_raised():
    recorder = Recorder(
        rejection("simulation_reverted"),
        rejection("permit2_allowance_required", nonce="1"),
        rejection("relayer_underfunded"),
    )
    gateway = FakeGateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway)
    with pytest.raises(FacilitatorRejectedError, match="relayer_underfunded"):
        await client.of(TOKEN_ADDRESS, AMOUNT).send()
    assert gateway.calls == []


async def test_a_pinned_sponsored_permit2_reports_a_missing_domain_as_unsponsorable():
    recorder = Recorder(rejection("permit2_allowance_required", nonce="7"))
    client, _ = client_with(recorder, domain=supported_tokens(None))
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sponsor_approval().send()
    assert raised.value.eip2612_nonce is None
    assert "permit2_allowance_required" in str(raised.value)
    assert raised.value.__cause__ is None
    assert raised.value.__suppress_context__ is True


@pytest.mark.parametrize("nonce", ["seven", "", "0xZZ"])
async def test_an_unreadable_eip2612_nonce_is_not_signed(nonce):
    recorder = Recorder(rejection("permit2_allowance_required", nonce=nonce))
    client, _ = client_with(recorder)
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sponsor_approval().send()
    assert raised.value.eip2612_nonce is None
    assert len(recorder.requests) == 1


async def test_a_pinned_gasless_deposit_never_self_funds_an_unsponsorable_allowance():
    recorder = Recorder(
        rejection("simulation_reverted"), rejection("permit2_allowance_required")
    )
    gateway = FakeGateway(allowance=AMOUNT)
    client, _ = client_with(recorder, gateway)
    with pytest.raises(Permit2AllowanceRequiredError):
        await client.of(TOKEN_ADDRESS, AMOUNT).gasless().send()
    assert gateway.calls == []


async def test_a_pinned_gasless_deposit_succeeds_on_eip3009_without_trying_permit2():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).gasless().send()
    assert recorder.methods == ["eip3009"]
    assert receipt.route == TokenRoute.EIP3009


async def test_a_pinned_gasless_deposit_skips_eip3009_for_a_token_with_no_domain():
    recorder = Recorder(rejection("permit2_allowance_required", nonce="3"))
    client, _ = client_with(recorder, domain=supported_tokens(None))
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).gasless().send()
    assert raised.value.eip2612_nonce is None
    assert recorder.methods == ["permit2"]


async def test_a_pinned_eip3009_deposit_needs_a_published_domain():
    recorder = Recorder(success())
    client, _ = client_with(recorder, domain=supported_tokens(None))
    with pytest.raises(MissingTokenDomainSeparatorError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()
    assert raised.value.token == TOKEN_ADDRESS
    assert recorder.requests == []


async def test_a_pinned_permit2_deposit_needs_no_token_domain():
    recorder = Recorder(success())
    client, _ = client_with(recorder, domain=supported_tokens(None))
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().send()
    body = recorder.requests[0][1]
    assert body["assetTransferMethod"] == "permit2"
    assert body["permit2Authorization"]["from"] == TEST_ADDRESS
    assert receipt.route == TokenRoute.PERMIT2
    assert receipt.account == TEST_ADDRESS


def native_terminals():
    return {
        "eip3009.send": lambda b: b.eip3009().send(),
        "eip3009.sign": lambda b: b.eip3009().sign(),
        "permit2.send": lambda b: b.permit2().send(),
        "permit2.sign": lambda b: b.permit2().sign(),
        "sponsored.send": lambda b: b.permit2().sponsor_approval().send(),
        "gasless.send": lambda b: b.gasless().send(),
    }


@pytest.mark.parametrize("terminal", list(native_terminals()))
async def test_every_gasless_terminal_refuses_native_eth(terminal):
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    with pytest.raises(InvalidParamsError, match="native ETH has no gasless route"):
        await native_terminals()[terminal](client.of(None, AMOUNT))
    assert recorder.requests == []


async def test_an_attached_authorization_cannot_be_redeemed_for_native_eth():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    eip3009 = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().sign()
    permit2 = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sign()
    native = client.of(None, AMOUNT)
    for call in (
        native.eip3009().authorization(eip3009).verify,
        native.eip3009().authorization(eip3009).send,
        native.permit2().authorization(permit2).verify,
        native.permit2().authorization(permit2).send,
    ):
        with pytest.raises(InvalidParamsError):
            await call()
    assert recorder.requests == []


async def test_a_signed_eip3009_authorization_is_redeemed_exactly_as_signed():
    recorder = Recorder(success(**{"from": TEST_ADDRESS.lower(), "amount": AMOUNT}))
    client, _ = client_with(recorder)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().sign()
    receipt = (
        await client.of(TOKEN_ADDRESS, AMOUNT)
        .eip3009()
        .authorization(authorization)
        .send()
    )
    assert recorder.requests[0][1]["authorization"] == authorization.to_payload()
    assert receipt.route == TokenRoute.EIP3009
    assert receipt.account == TEST_ADDRESS


async def test_a_valid_eip3009_authorization_verifies_without_submitting():
    recorder = Recorder(httpx.Response(200, json={"isValid": True}))
    client, _ = client_with(recorder)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().sign()
    result = (
        await client.of(TOKEN_ADDRESS, AMOUNT)
        .eip3009()
        .authorization(authorization)
        .verify()
    )
    assert result is None
    assert recorder.paths == ["/deposit/verify"]


async def test_a_signed_permit2_authorization_is_redeemed_exactly_as_signed():
    recorder = Recorder(success())
    client, _ = client_with(recorder)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sign()
    receipt = (
        await client.of(TOKEN_ADDRESS, AMOUNT)
        .permit2()
        .authorization(authorization)
        .send()
    )
    body = recorder.requests[0][1]
    assert recorder.paths == ["/deposit"]
    assert body["permit2Authorization"] == authorization.to_payload()
    assert body["assetTransferMethod"] == "permit2"
    assert "eip2612Permit" not in body
    assert receipt.route == TokenRoute.PERMIT2


async def test_a_valid_permit2_authorization_verifies_without_submitting():
    recorder = Recorder(httpx.Response(200, json={"isValid": True}))
    client, _ = client_with(recorder)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sign()
    await (
        client.of(TOKEN_ADDRESS, AMOUNT).permit2().authorization(authorization).verify()
    )
    assert recorder.paths == ["/deposit/verify"]
    assert recorder.requests[0][1]["amount"] == str(AMOUNT)


async def test_a_permit2_verification_names_the_sponsorable_nonce():
    recorder = Recorder(
        httpx.Response(
            200,
            json={
                "isValid": False,
                "invalidReason": "permit2_allowance_required",
                "extra": {"details": {"eip2612Nonce": "9"}},
            },
        )
    )
    client, _ = client_with(recorder)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sign()
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await (
            client.of(TOKEN_ADDRESS, AMOUNT)
            .permit2()
            .authorization(authorization)
            .verify()
        )
    assert raised.value.eip2612_nonce == 9
    assert "facilitator gave no reason" in str(raised.value)


async def test_a_verification_with_no_reason_is_an_unknown_rejection():
    recorder = Recorder(httpx.Response(200, json={}))
    client, _ = client_with(recorder)
    authorization = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().sign()
    with pytest.raises(FacilitatorRejectedError) as raised:
        await (
            client.of(TOKEN_ADDRESS, AMOUNT)
            .eip3009()
            .authorization(authorization)
            .verify()
        )
    assert raised.value.code == "unknown"
    assert raised.value.retryable is False


@pytest.mark.parametrize("echo", [AMOUNT, str(AMOUNT), hex(AMOUNT), "0XF4240"])
async def test_an_amount_echo_in_any_integer_spelling_confirms_the_deposit(echo):
    recorder = Recorder(success(amount=echo))
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()
    assert receipt.amount == AMOUNT


@pytest.mark.parametrize("echo", [AMOUNT + 1, "0", "01000000", True, "1e6", -AMOUNT])
async def test_an_amount_echo_that_differs_is_an_unknown_outcome(echo):
    recorder = Recorder(success(amount=echo))
    client, _ = client_with(recorder)
    with pytest.raises(OutcomeUnknownError, match="echoed amount"):
        await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()


async def test_an_asset_echo_in_lowercase_confirms_and_keeps_the_checksum():
    recorder = Recorder(success(asset=TOKEN_ADDRESS.lower()))
    client, _ = client_with(recorder)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()
    assert receipt.asset == TOKEN_ADDRESS


async def test_an_asset_echo_naming_another_token_is_an_unknown_outcome():
    recorder = Recorder(success(asset=OTHER))
    client, _ = client_with(recorder)
    with pytest.raises(OutcomeUnknownError, match="echoed asset"):
        await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()


@pytest.mark.parametrize("transaction", [None, "", "ab" * 32, 123, ["0x1"]])
async def test_success_with_an_unusable_transaction_hash_is_an_unknown_outcome(
    transaction,
):
    recorder = Recorder(
        httpx.Response(200, json={"success": True, "transaction": transaction})
    )
    client, _ = client_with(recorder)
    with pytest.raises(OutcomeUnknownError, match="without a transaction"):
        await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()


async def test_a_rejection_after_broadcast_carries_the_transaction_to_check():
    recorder = Recorder(
        rejection(
            "settlement_pending",
            transaction=TX_HASH,
            extra={"retryable": True, "details": {"k": 1}},
        )
    )
    client, _ = client_with(recorder)
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send()
    assert raised.value.transaction == TX_HASH
    assert raised.value.retryable is True
    assert raised.value.details == {"k": 1}


async def test_a_self_funded_approval_is_refused_for_native_eth():
    gateway = mock_gateway()
    client, _ = client_with(gateway=gateway)
    with pytest.raises(InvalidParamsError, match="needs no approval"):
        await client.of(None, AMOUNT).self_funded().approve()
    gateway.approve_erc20.assert_not_awaited()


async def test_a_self_funded_approval_grants_exactly_the_deposit_amount():
    gateway = mock_gateway()
    client, _ = client_with(gateway=gateway)
    options = TxReceiptWaitOptions(timeout_secs=9)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).self_funded().approve(options)
    gateway.approve_erc20.assert_awaited_once_with(
        TOKEN_ADDRESS, AMOUNT, wait_options=options
    )
    assert receipt["transactionHash"] == TX_HASH


async def test_a_self_funded_approval_returns_none_when_the_allowance_already_covers_it():
    gateway = mock_gateway()
    gateway.approve_erc20 = AsyncMock(return_value=None)
    client, _ = client_with(gateway=gateway)
    assert await client.of(TOKEN_ADDRESS, AMOUNT).self_funded().approve() is None


async def test_a_pinned_self_funded_deposit_forwards_the_wait_options():
    gateway = mock_gateway()
    client, _ = client_with(Recorder(success()), gateway)
    options = TxReceiptWaitOptions(timeout_secs=1)
    receipt = await client.of(TOKEN_ADDRESS, AMOUNT).self_funded().send(options)
    gateway.deposit.assert_awaited_once_with(
        AMOUNT, TOKEN_ADDRESS, wait_options=options
    )
    assert receipt.route == TokenRoute.SELF_FUNDED


async def test_concurrent_deposits_fetch_the_token_domain_once_and_never_share_a_nonce():
    recorder = Recorder(success())
    client, ctx = client_with(recorder)
    await asyncio.gather(
        *(client.of(TOKEN_ADDRESS, AMOUNT).eip3009().send() for _ in range(5))
    )
    nonces = {body["authorization"]["nonce"] for _, body in recorder.requests}
    assert len(nonces) == 5
    assert [call[0] for call in ctx.rpc.calls] == ["supported_tokens"]


async def test_two_permit2_signatures_for_the_same_deposit_use_different_nonces():
    client, _ = client_with(Recorder(success()))
    first = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sign()
    second = await client.of(TOKEN_ADDRESS, AMOUNT).permit2().sign()
    assert first.nonce != second.nonce
    assert first.from_address == second.from_address == TEST_ADDRESS
