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
from fourmica_sdk.errors import (
    Erc20AllowanceRequiredError,
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    InvalidParamsError,
    MissingTokenDomainSeparatorError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
)
from fourmica_sdk.models import ClearingSettlementActionResponse

CYCLE_ID = "0x" + "aa" * 32
CYCLE_TEXT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266:1777248000"
CLEARING_HOUSE = "0x2222222222222222222222222222222222222222"
CREDITOR = "0x00000000000000000000000000000000000000Be"
TX_HASH = "0x" + "ef" * 32
ZERO = "0x0000000000000000000000000000000000000000"


def action(**overrides) -> ClearingSettlementActionResponse:
    raw = {
        "contract_address": CLEARING_HOUSE,
        "function_name": "payNetDebit",
        "action": "pay_net_debit",
        "cycle_id": CYCLE_ID,
        "cycle_id_text": CYCLE_TEXT,
        "asset_address": TOKEN_ADDRESS,
        "participant": TEST_ADDRESS,
        "amount": "5000",
        "payable_value": "0",
        "proof": ["0x" + "dd" * 32, "0x" + "ee" * 32],
    }
    raw.update(overrides)
    return ClearingSettlementActionResponse.from_rpc(raw)


def claim_action(**overrides) -> ClearingSettlementActionResponse:
    values = {"function_name": "claimNetCreditFor", "action": "claim_net_credit"}
    values.update(overrides)
    return action(**values)


class Recorder:
    def __init__(self, *responses) -> None:
        self.responses = list(responses)
        self.paths: list[str] = []
        self.bodies: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.paths.append(request.url.path)
        self.bodies.append(json.loads(request.content))
        response = (
            self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        )
        if isinstance(response, Exception):
            raise response
        return response


def settlement(handler=None, gateway=None, tokens=None, **rpc_responses):
    responses = {
        "supported_tokens": supported_tokens() if tokens is None else tokens,
        **rpc_responses,
    }
    ctx = make_ctx(rpc=FakeRpc(**responses), gateway=gateway)
    if handler is not None:
        attach_facilitator(ctx, handler)
    return SettlementClient(ctx), ctx


def success(**extra) -> httpx.Response:
    return httpx.Response(200, json={"success": True, "transaction": TX_HASH, **extra})


def rejection(code, extra=None) -> httpx.Response:
    body = {
        "success": False,
        "errorReason": code,
        "errorMessage": code.replace("_", " "),
        "extra": extra or {},
    }
    return httpx.Response(200, json=body)


def pay_calls(gateway: FakeGateway) -> list:
    return [c for c in gateway.calls if c[0] == "pay_net_debit"]


def test_gasless_is_available_only_with_a_facilitator():
    assert not settlement()[0].is_gasless_available()
    assert settlement(Recorder(success()))[0].is_gasless_available()


async def test_positions_are_listed_for_the_signer():
    class PositionsRpc(FakeRpc):
        async def list_participant_positions(self, participant):
            return self._respond("positions", participant)

    ctx = make_ctx(rpc=PositionsRpc(positions=["p"]))
    assert await SettlementClient(ctx).positions() == ["p"]
    assert ctx.rpc.calls == [("positions", TEST_ADDRESS)]


async def test_the_cycle_id_is_passed_to_core_as_text():
    client, ctx = settlement(pay_action=action(), claim_action=claim_action())
    await client.pay(CYCLE_TEXT).action()
    await client.claim(CYCLE_TEXT).action()
    assert ctx.rpc.calls == [
        ("pay_action", CYCLE_TEXT, TEST_ADDRESS),
        ("claim_action", CYCLE_TEXT, TEST_ADDRESS),
    ]


async def test_auto_pay_without_a_facilitator_is_self_funded():
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(gateway=gateway, pay_action=action())
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert receipt.tx_hash == gateway.receipt["transactionHash"]
    assert receipt.raw is gateway.receipt
    assert pay_calls(gateway)[0][4] == [
        bytes.fromhex("dd" * 32),
        bytes.fromhex("ee" * 32),
    ]


async def test_auto_pay_of_a_native_debit_skips_the_facilitator():
    gateway = FakeGateway()
    recorder = Recorder(success())
    client, _ = settlement(
        recorder,
        gateway=gateway,
        pay_action=action(asset_address=ZERO, payable_value="5000"),
    )
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert recorder.paths == []
    assert pay_calls(gateway)[0][5] == 5000


async def test_auto_pay_goes_gasless_through_eip3009_first():
    gateway = FakeGateway()
    recorder = Recorder(success(debtor=TEST_ADDRESS.lower(), network="eip155:84532"))
    client, _ = settlement(recorder, gateway=gateway, pay_action=action())
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.EIP3009
    assert receipt.account == TEST_ADDRESS
    assert receipt.network == "eip155:84532"
    assert receipt.raw["transaction"] == TX_HASH
    assert recorder.bodies[0]["cycleId"] == CYCLE_TEXT
    assert recorder.bodies[0]["authorization"]["nonce"] == CYCLE_ID
    assert gateway.calls == []


async def test_auto_pay_does_not_fall_back_after_an_unknown_outcome():
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(
        Recorder(httpx.Response(502, text="bad gateway")),
        gateway=gateway,
        pay_action=action(),
    )
    with pytest.raises(OutcomeUnknownError):
        await client.pay(CYCLE_TEXT).send()
    assert gateway.calls == []


async def test_auto_pay_falls_back_when_the_facilitator_is_unreachable():
    gateway = FakeGateway(allowance=5000)
    recorder = Recorder(httpx.Response(404, text="gone"))
    client, _ = settlement(recorder, gateway=gateway, pay_action=action())
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert len(recorder.paths) == 1
    assert len(pay_calls(gateway)) == 1


async def test_auto_pay_falls_back_when_eip3009_and_permit2_are_both_refused():
    gateway = FakeGateway(allowance=5000)
    recorder = Recorder(rejection("unsupported_transfer_method"), rejection("busy"))
    client, _ = settlement(recorder, gateway=gateway, pay_action=action())
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert [b["assetTransferMethod"] for b in recorder.bodies] == [
        "eip3009",
        "permit2",
    ]


async def test_auto_pay_raises_an_eip3009_rejection_that_names_the_payment():
    gateway = FakeGateway(allowance=5000)
    recorder = Recorder(rejection("invalid_signature"))
    client, _ = settlement(recorder, gateway=gateway, pay_action=action())
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.pay(CYCLE_TEXT).send()
    assert raised.value.code == "invalid_signature"
    assert len(recorder.bodies) == 1
    assert gateway.calls == []


async def test_auto_pay_checks_the_allowance_when_falling_back():
    gateway = FakeGateway(allowance=4999)
    client, _ = settlement(
        Recorder(rejection("rate_limited")), gateway=gateway, pay_action=action()
    )
    with pytest.raises(Erc20AllowanceRequiredError) as raised:
        await client.pay(CYCLE_TEXT).send()
    assert raised.value.needed == 5000
    assert raised.value.allowance == 4999
    assert pay_calls(gateway) == []


async def test_auto_pay_without_a_token_domain_goes_straight_to_permit2():
    recorder = Recorder(success())
    client, _ = settlement(
        recorder, tokens=supported_tokens(domain_separator=None), pay_action=action()
    )
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.PERMIT2
    assert [b["assetTransferMethod"] for b in recorder.bodies] == ["permit2"]


async def test_a_sponsored_permit2_without_a_token_domain_needs_an_approval():
    recorder = Recorder(
        rejection("permit2_allowance_required", {"details": {"eip2612Nonce": "4"}})
    )
    client, _ = settlement(
        recorder, tokens=supported_tokens(domain_separator=None), pay_action=action()
    )
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await client.pay(CYCLE_TEXT).gasless().send()
    assert raised.value.eip2612_nonce is None
    assert isinstance(raised.value.__context__, MissingTokenDomainSeparatorError)
    assert raised.value.__suppress_context__


async def test_a_permit2_rejection_without_a_nonce_is_not_sponsored():
    recorder = Recorder(rejection("permit2_allowance_required"))
    client, _ = settlement(recorder, pay_action=action())
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await client.pay(CYCLE_TEXT).permit2().sponsor_approval().send()
    assert raised.value.eip2612_nonce is None
    assert len(recorder.bodies) == 1


async def test_permit2_send_raises_the_missing_approval_instead_of_sponsoring():
    recorder = Recorder(
        rejection("permit2_allowance_required", {"details": {"eip2612Nonce": "4"}})
    )
    client, _ = settlement(recorder, pay_action=action())
    with pytest.raises(Permit2AllowanceRequiredError) as raised:
        await client.pay(CYCLE_TEXT).permit2().send()
    assert raised.value.eip2612_nonce == 4
    assert all("eip2612Permit" not in body for body in recorder.bodies)


async def test_permit2_send_pays_with_the_cycle_as_nonce():
    recorder = Recorder(success())
    client, _ = settlement(recorder, pay_action=action())
    receipt = await client.pay(CYCLE_TEXT).permit2().send()
    assert receipt.route == TokenRoute.PERMIT2
    body = recorder.bodies[0]
    assert body["permit2Authorization"]["nonce"] == hex(int(CYCLE_ID, 16))
    assert "eip2612Permit" not in body


async def test_a_signed_permit2_authorization_is_redeemed_as_signed():
    recorder = Recorder(httpx.Response(200, json={"isValid": True}), success())
    client, _ = settlement(recorder, pay_action=action())
    authorization = await client.pay(CYCLE_TEXT).permit2().sign()
    assert authorization.from_address == TEST_ADDRESS
    assert authorization.nonce == int(CYCLE_ID, 16)
    pay = client.pay(CYCLE_TEXT).permit2().authorization(authorization)
    await pay.verify()
    receipt = await pay.send()
    assert receipt.route == TokenRoute.PERMIT2
    assert recorder.paths == ["/clearing/pay/verify", "/clearing/pay"]
    assert recorder.bodies[1] == {
        "cycleId": CYCLE_TEXT,
        "assetTransferMethod": "permit2",
        "permit2Authorization": authorization.to_payload(),
    }


async def test_a_signed_eip3009_authorization_is_redeemed_as_signed():
    recorder = Recorder(success())
    client, _ = settlement(recorder, pay_action=action())
    authorization = await client.pay(CYCLE_TEXT).eip3009().sign()
    receipt = await client.pay(CYCLE_TEXT).eip3009().authorization(authorization).send()
    assert receipt.route == TokenRoute.EIP3009
    assert recorder.bodies[0]["authorization"] == authorization.to_payload()


@pytest.mark.parametrize("method", ["eip3009", "permit2"])
async def test_signing_a_native_debit_gaslessly_is_refused(method):
    client, _ = settlement(Recorder(success()), pay_action=action(asset_address=ZERO))
    with pytest.raises(InvalidParamsError, match="native-asset debits"):
        await getattr(client.pay(CYCLE_TEXT), method)().sign()


@pytest.mark.parametrize("method", ["eip3009", "permit2"])
async def test_signing_another_participants_debit_is_refused(method):
    client, _ = settlement(Recorder(success()), pay_action=action(participant=CREDITOR))
    with pytest.raises(InvalidParamsError, match="server echoed participant"):
        await getattr(client.pay(CYCLE_TEXT), method)().sign()


@pytest.mark.parametrize(
    ("body", "code", "message"),
    [
        (
            {
                "isValid": False,
                "invalidReason": "nonce_already_used",
                "invalidMessage": "used",
            },
            "nonce_already_used",
            "(nonce_already_used): used",
        ),
        ({"isValid": False}, "unknown", "(unknown): facilitator gave no reason"),
        ({}, "unknown", "(unknown): facilitator gave no reason"),
    ],
)
async def test_a_pay_verification_that_fails_raises_the_rejection(body, code, message):
    recorder = Recorder(httpx.Response(200, json=body))
    client, _ = settlement(recorder, pay_action=action())
    authorization = await client.pay(CYCLE_TEXT).eip3009().sign()
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.pay(CYCLE_TEXT).eip3009().authorization(authorization).verify()
    assert raised.value.code == code
    assert str(raised.value).endswith(message)


@pytest.mark.parametrize(
    "body",
    [
        {"success": True},
        {"success": True, "transaction": ""},
        {"success": True, "transaction": 12},
        {"success": True, "transaction": "ef" * 32},
    ],
)
async def test_a_pay_success_without_a_transaction_is_an_unknown_outcome(body):
    client, _ = settlement(
        Recorder(httpx.Response(200, json=body)), pay_action=action()
    )
    with pytest.raises(OutcomeUnknownError, match="without a transaction"):
        await client.pay(CYCLE_TEXT).eip3009().send()


async def test_a_pay_echoing_another_debtor_is_an_unknown_outcome():
    client, _ = settlement(Recorder(success(debtor=CREDITOR)), pay_action=action())
    with pytest.raises(OutcomeUnknownError, match="echoed debtor"):
        await client.pay(CYCLE_TEXT).gasless().send()


async def test_a_refusal_after_broadcast_keeps_the_transaction():
    body = {
        "success": False,
        "errorReason": "settlement_pending",
        "transaction": TX_HASH,
    }
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(
        Recorder(httpx.Response(200, json=body)), gateway=gateway, pay_action=action()
    )
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.pay(CYCLE_TEXT).send()
    assert raised.value.transaction == TX_HASH
    assert gateway.calls == []


async def test_a_sponsorship_unavailable_rejection_falls_back_to_self_funded():
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(
        Recorder(rejection("sponsorship_unavailable")),
        gateway=gateway,
        pay_action=action(),
    )
    receipt = await client.pay(CYCLE_TEXT).send()
    assert receipt.route == TokenRoute.SELF_FUNDED


async def test_gasless_pay_never_falls_back():
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(
        Recorder(rejection("sponsorship_unavailable")),
        gateway=gateway,
        pay_action=action(),
    )
    with pytest.raises(FacilitatorNotConfiguredError):
        await client.pay(CYCLE_TEXT).gasless().send()
    assert gateway.calls == []


async def test_gasless_pay_without_a_facilitator_is_not_configured():
    client, _ = settlement(pay_action=action())
    with pytest.raises(FacilitatorNotConfiguredError):
        await client.pay(CYCLE_TEXT).eip3009().send()


async def test_self_funded_send_pays_an_approved_debit():
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(Recorder(success()), gateway=gateway, pay_action=action())
    receipt = await client.pay(CYCLE_TEXT).self_funded().send()
    assert receipt.route == TokenRoute.SELF_FUNDED
    assert receipt.account == TEST_ADDRESS
    assert pay_calls(gateway)[0][1:4] == (
        CLEARING_HOUSE,
        bytes.fromhex("aa" * 32),
        5000,
    )


async def test_self_funded_send_with_exactly_enough_allowance_pays():
    gateway = FakeGateway(allowance=5000)
    client, _ = settlement(gateway=gateway, pay_action=action())
    await client.pay(CYCLE_TEXT).self_funded().send()
    assert len(pay_calls(gateway)) == 1


async def test_self_funded_approve_refuses_another_participants_debit():
    client, _ = settlement(
        gateway=FakeGateway(), pay_action=action(participant=CREDITOR)
    )
    with pytest.raises(InvalidParamsError, match="participant"):
        await client.pay(CYCLE_TEXT).self_funded().approve()


async def test_self_funded_pay_refuses_a_claim_call():
    client, _ = settlement(
        gateway=FakeGateway(allowance=5000), pay_action=claim_action()
    )
    with pytest.raises(InvalidParamsError, match="expected payNetDebit"):
        await client.pay(CYCLE_TEXT).self_funded().send()


async def test_claim_action_reads_the_creditors_action():
    client, ctx = settlement(claim_action=claim_action(participant=CREDITOR))
    builder = client.claim(CYCLE_TEXT).creditor(CREDITOR.lower())
    assert (await builder.action()).participant == CREDITOR
    assert ctx.rpc.calls == [("claim_action", CYCLE_TEXT, CREDITOR)]


async def test_a_malformed_creditor_is_refused():
    client, _ = settlement()
    with pytest.raises(ValueError, match="invalid address"):
        client.claim(CYCLE_TEXT).creditor("0xnope")


async def test_auto_claim_without_a_facilitator_is_self_funded():
    gateway = FakeGateway()
    client, _ = settlement(gateway=gateway, claim_action=claim_action())
    receipt = await client.claim(CYCLE_TEXT).send()
    assert receipt.route == Route.SELF_FUNDED
    assert receipt.raw is gateway.receipt


async def test_auto_claim_goes_gasless_when_it_can():
    gateway = FakeGateway()
    recorder = Recorder(success(network="eip155:84532"))
    client, _ = settlement(recorder, gateway=gateway, claim_action=claim_action())
    receipt = await client.claim(CYCLE_TEXT).send()
    assert receipt.route == Route.GASLESS
    assert receipt.network == "eip155:84532"
    assert receipt.tx_hash == TX_HASH
    assert gateway.calls == []


async def test_auto_claim_does_not_fall_back_after_an_unknown_outcome():
    gateway = FakeGateway()
    client, _ = settlement(
        Recorder(httpx.Response(504, text="timeout")),
        gateway=gateway,
        claim_action=claim_action(),
    )
    with pytest.raises(OutcomeUnknownError):
        await client.claim(CYCLE_TEXT).send()
    assert gateway.calls == []


async def test_a_self_funded_claim_for_someone_else_is_refused():
    client, _ = settlement(gateway=FakeGateway(), claim_action=claim_action())
    with pytest.raises(InvalidParamsError, match="participant"):
        await client.claim(CYCLE_TEXT).creditor(CREDITOR).self_funded().send()


async def test_a_claim_verification_passes_without_submitting():
    recorder = Recorder(httpx.Response(200, json={"isValid": True}))
    client, _ = settlement(recorder)
    await client.claim(CYCLE_TEXT).creditor(CREDITOR).gasless().verify()
    assert recorder.paths == ["/clearing/claim/verify"]
    assert recorder.bodies == [{"cycleId": CYCLE_TEXT, "creditor": CREDITOR}]


async def test_a_claim_verification_that_fails_raises_the_rejection():
    recorder = Recorder(
        httpx.Response(
            200,
            json={
                "isValid": False,
                "invalidReason": "clearing_action_unavailable",
                "invalidMessage": "not committed yet",
                "extra": {"retryable": True},
            },
        )
    )
    client, _ = settlement(recorder)
    with pytest.raises(FacilitatorRejectedError) as raised:
        await client.claim(CYCLE_TEXT).gasless().verify()
    assert raised.value.code == "clearing_action_unavailable"
    assert raised.value.retryable is True
    assert "not committed yet" in str(raised.value)


@pytest.mark.parametrize(
    "body",
    [{"success": True}, {"success": True, "transaction": None}],
)
async def test_a_claim_success_without_a_transaction_is_an_unknown_outcome(body):
    client, _ = settlement(Recorder(httpx.Response(200, json=body)))
    with pytest.raises(OutcomeUnknownError, match="without a transaction"):
        await client.claim(CYCLE_TEXT).gasless().send()


async def test_a_claim_echoing_another_creditor_is_an_unknown_outcome():
    client, _ = settlement(Recorder(success(creditor=CREDITOR)))
    with pytest.raises(OutcomeUnknownError, match="echoed creditor"):
        await client.claim(CYCLE_TEXT).gasless().send()


async def test_the_creditor_set_after_gasless_does_not_change_that_builder():
    recorder = Recorder(success())
    client, _ = settlement(recorder)
    builder = client.claim(CYCLE_TEXT)
    gasless = builder.gasless()
    builder.creditor(CREDITOR)
    receipt = await gasless.send()
    assert receipt.account == TEST_ADDRESS
    assert recorder.bodies[0]["creditor"] == TEST_ADDRESS
