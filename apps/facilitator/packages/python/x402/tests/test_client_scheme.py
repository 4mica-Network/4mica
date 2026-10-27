import pytest
from x402.schemas import (
    PaymentPayload,
    PaymentRequirements,
    PaymentResponseContext,
    RecoveredResponseResult,
    SettleResponse,
)
from x402.schemas.v1 import PaymentRequirementsV1

from fourmica_x402.client_scheme import FourMicaEvmScheme, _Payer

pytest.importorskip("x402")
pytest.importorskip("fourmica_sdk")
pytest.importorskip("eth_account")

SUBJECT = "0x" + "42" * 32


class StubRequest:
    """Stands in for the SDK's ``PaymentRequest``, whose wire form x402 sends."""

    def __init__(self, wire):
        self.wire = wire

    def to_payload(self):
        return self.wire


class StubSigned:
    def __init__(self, wire):
        self.payload = StubRequest(wire)


class StubFlow:
    def __init__(self):
        self.last_payment_required = None
        self.last_accepted = None

    async def sign_payment_v2(self, payment_required, accepted):
        self.last_payment_required = payment_required
        self.last_accepted = accepted
        return StubSigned({"claims": {"version": "v1", "req_id": "0x1"}, "v": 2})

    async def sign_payment(self, requirements):
        return StubSigned({"claims": {"version": "v1", "req_id": "0x2"}, "v": 1})


class StubPayment:
    def __init__(self, fail=False):
        self.calls = []
        self.fail = fail

    async def active_cycle(self, asset=None):
        self.calls.append(("active_cycle", asset))

    async def checkpoint_active_cycle(self, asset=None):
        if self.fail:
            raise RuntimeError("core unreachable")
        self.calls.append(("checkpoint_active_cycle", asset))

    async def checkpoint_cycle(self, asset, cycle_id):
        self.calls.append(("checkpoint_cycle", asset, cycle_id))


class StubScheme(FourMicaEvmScheme):
    def __init__(self, private_key, payment=None, core_urls=None):
        super().__init__(private_key, core_urls)
        self.payment = payment or StubPayment()
        self.connected = []

    async def _connect(self, rpc_url: str):
        self.connected.append(rpc_url)
        return _Payer(flow=StubFlow(), payment=self.payment)


def test_create_payment_payload_v2():
    scheme = StubScheme("0x" + "1" * 64)
    req = PaymentRequirements(
        scheme="4mica-credit",
        network="eip155:11155111",
        asset="0xabc",
        amount="1",
        pay_to="0xdef",
        max_timeout_seconds=60,
        extra={
            "rpcUrl": "https://custom.rpc.example",
            "validation": {
                "validator": "eip155:11155111:0x4444444444444444444444444444444444444444",
                "subject": SUBJECT,
                "deadline": 1_700_000_600,
            },
            "resource": {
                "url": "https://api.example.com/premium",
                "description": "Premium dataset",
                "mimeType": "application/json",
            },
        },
    )
    payload = scheme.create_payment_payload(req)
    assert payload["v"] == 2
    assert payload["claims"]["req_id"] == "0x1"
    flow = scheme._payers["https://custom.rpc.example"].flow
    assert flow.last_payment_required.resource.url == "https://api.example.com/premium"
    assert flow.last_payment_required.resource.description == "Premium dataset"
    assert flow.last_accepted.extra["validation"]["subject"] == SUBJECT
    assert flow.last_accepted.extra["validation"]["deadline"] == 1_700_000_600


def test_create_payment_payload_v1():
    scheme = StubScheme("0x" + "1" * 64)
    req = PaymentRequirementsV1(
        scheme="4mica-credit",
        network="eip155:11155111",
        max_amount_required="1",
        resource="/",
        description=None,
        mime_type=None,
        pay_to="0xdef",
        max_timeout_seconds=60,
        asset="0xabc",
        output_schema=None,
        extra={},
    )
    payload = scheme.create_payment_payload(req)
    assert payload["v"] == 1
    assert payload["claims"]["req_id"] == "0x2"


def test_pays_on_the_payers_core_override_unless_the_seller_names_one():
    scheme = StubScheme("0x" + "1" * 64, core_urls={"eip155:31337": "http://localhost:3000/"})
    req = PaymentRequirements(
        scheme="4mica-credit",
        network="eip155:31337",
        asset="0xabc",
        amount="1",
        pay_to="0xdef",
        max_timeout_seconds=60,
        extra={},
    )

    scheme.create_payment_payload(req)
    scheme.create_payment_payload(
        req.model_copy(update={"extra": {"rpcUrl": "https://seller.core.example/"}})
    )

    assert scheme.connected == ["http://localhost:3000/", "https://seller.core.example/"]


def test_create_payment_payload_v2_rejects_unknown_network_without_rpc():
    scheme = StubScheme("0x" + "1" * 64)
    req = PaymentRequirements(
        scheme="4mica-credit",
        network="eip155:1",
        asset="0xabc",
        amount="1",
        pay_to="0xdef",
        max_timeout_seconds=60,
        extra={},
    )

    with pytest.raises(ValueError, match="No RPC URL configured"):
        scheme.create_payment_payload(req)


def _paid(scheme, requirements):
    """Pays *requirements* once, so the scheme is connected to its core."""
    scheme.create_payment_payload(requirements)
    return PaymentResponseContext(
        payment_payload=PaymentPayload(x402_version=2, accepted=requirements, payload={}),
        requirements=requirements,
    )


def _refusal(reason, extra=None):
    return SettleResponse(
        success=False,
        error_reason=reason,
        transaction="",
        network="eip155:84532",
        extra=extra,
    )


BASE_SEPOLIA = PaymentRequirements(
    scheme="4mica-credit",
    network="eip155:84532",
    asset="0x2222222222222222222222222222222222222222",
    amount="1000",
    pay_to="0x1111111111111111111111111111111111111111",
    max_timeout_seconds=300,
)


def test_recovers_by_checkpointing_when_core_wants_one():
    scheme = StubScheme("0x" + "1" * 64)
    ctx = _paid(scheme, BASE_SEPOLIA)
    ctx.settle_response = _refusal("invalid_4mica_credit_checkpoint_required")

    on_payment_response = scheme.scheme_hooks["on_payment_response"]

    assert isinstance(on_payment_response(ctx), RecoveredResponseResult)
    assert scheme.payment.calls == [("checkpoint_active_cycle", BASE_SEPOLIA.asset)]


def test_leaves_success_and_unrecoverable_refusals_alone():
    scheme = StubScheme("0x" + "1" * 64)
    ctx = _paid(scheme, BASE_SEPOLIA)
    on_payment_response = scheme.scheme_hooks["on_payment_response"]

    ctx.settle_response = SettleResponse(success=True, transaction="", network="eip155:84532")
    assert on_payment_response(ctx) is None
    ctx.settle_response = _refusal("insufficient_funds")
    assert on_payment_response(ctx) is None
    assert scheme.payment.calls == []


def test_leaves_the_refusal_for_the_caller_when_the_checkpoint_fails():
    scheme = StubScheme("0x" + "1" * 64, StubPayment(fail=True))
    ctx = _paid(scheme, BASE_SEPOLIA)
    ctx.settle_response = _refusal("invalid_4mica_credit_checkpoint_required")

    assert scheme.scheme_hooks["on_payment_response"](ctx) is None
