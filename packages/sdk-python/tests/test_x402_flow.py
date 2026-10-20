import base64
import json
import time

import httpx
import pytest
from eth_account import Account
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    MOCK_CORE_CHAIN_ID,
    TEST_ADDRESS,
    MockCore,
    connect,
    ok,
)

from fourmica_sdk.client.model import Asset
from fourmica_sdk.errors import X402Error
from fourmica_sdk.guarantee import clearing_house_domain_separator
from fourmica_sdk.models import PaymentRequest, PaymentRequestPayload
from fourmica_sdk.x402 import (
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    X402Flow,
    X402PaymentRequired,
)

USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PAY_TO = "0x00000000000000000000000000000000000000Be"
ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
CYCLE = "0x" + "11" * 32


class FakeFlowSigner:
    def __init__(self) -> None:
        self.built = []
        self.signed = []

    async def new_payment(self, recipient, amount, asset):
        self.built.append((recipient, amount, asset))
        return PaymentRequestPayload.new(
            user_address=USER,
            recipient_address=recipient,
            cycle_id=CYCLE,
            req_id=7,
            amount=amount,
            timestamp=1_700_000_000,
            erc20_token=asset.erc20_token,
        )

    async def sign_payment(self, payload):
        self.signed.append(payload)
        return PaymentRequest(payload=payload, signature="0x" + "ab" * 65)


def reqs_v1(**overrides) -> PaymentRequirementsV1:
    raw = {
        "scheme": "4mica-credit",
        "network": "eip155:84532",
        "maxAmountRequired": "1000",
        "payTo": PAY_TO,
        "asset": ASSET,
    }
    raw.update(overrides)
    return PaymentRequirementsV1.from_raw(raw)


def reqs_v2(**overrides) -> PaymentRequirementsV2:
    raw = {
        "scheme": "4mica-credit",
        "network": "eip155:84532",
        "amount": "1000",
        "payTo": PAY_TO,
        "asset": ASSET,
    }
    raw.update(overrides)
    return PaymentRequirementsV2.from_raw(raw)


def payment_required(accepted: PaymentRequirementsV2) -> X402PaymentRequired:
    return X402PaymentRequired.from_raw(
        {
            "x402Version": 2,
            "resource": {"url": "https://api.example/resource"},
            "accepts": [accepted.to_payload()],
            "extensions": {"echo": "me"},
        }
    )


async def test_sign_payment_v1_builds_the_envelope():
    signer = FakeFlowSigner()
    payment = await X402Flow(signer).sign_payment(reqs_v1())

    assert payment.x402_version == 1
    envelope = json.loads(base64.b64decode(payment.header))
    assert envelope == payment.envelope
    assert envelope["x402Version"] == 1
    assert envelope["scheme"] == "4mica-credit"
    assert envelope["network"] == "eip155:84532"

    request = envelope["payload"]
    assert set(request) == {"payload", "signature"}
    assert request["signature"] == "0x" + "ab" * 65
    assert request["payload"]["version"] == "v1"
    assert request["payload"]["user_address"] == USER
    assert request["payload"]["recipient_address"] == PAY_TO
    assert request["payload"]["amount"] == hex(1000)
    assert request["payload"]["cycle_id"] == CYCLE
    assert request["payload"]["asset_address"] == ASSET
    assert payment.payload.to_payload() == request

    assert signer.built == [(PAY_TO, 1000, Asset(ASSET))]
    assert signer.signed[0].validation is None


async def test_the_native_asset_is_requested_as_native():
    signer = FakeFlowSigner()
    zero = "0x0000000000000000000000000000000000000000"
    await X402Flow(signer).sign_payment(reqs_v1(asset=zero))
    assert signer.built[0][2].is_native


async def test_the_recipient_is_echoed_as_the_server_spelled_it():
    """A resource server that compares payTo as a string must still match;
    the payer commits to the address either way."""
    lowered = PAY_TO.lower()
    signer = FakeFlowSigner()
    payment = await X402Flow(signer).sign_payment(reqs_v1(payTo=f" {lowered} "))
    assert payment.envelope["payload"]["payload"]["recipient_address"] == lowered


async def test_sign_payment_rejects_foreign_scheme():
    with pytest.raises(X402Error, match="invalid scheme"):
        await X402Flow(FakeFlowSigner()).sign_payment(reqs_v1(scheme="exact"))


@pytest.mark.parametrize(
    "field,value",
    [("payTo", "nope"), ("asset", "0x12"), ("maxAmountRequired", "lots")],
)
async def test_malformed_requirements_are_refused_before_signing(field, value):
    signer = FakeFlowSigner()
    with pytest.raises(X402Error, match="invalid payment requirements"):
        await X402Flow(signer).sign_payment(reqs_v1(**{field: value}))
    assert signer.built == []


async def test_sign_payment_parses_nested_validation_extra():
    requirements = reqs_v1(
        extra={
            "validation": {
                "validator": "eip155:84532:0x1111111111111111111111111111111111111111",
                "subject": "0x" + "42" * 32,
                "deadline": 1_700_000_600,
                "params": "0xdeadbeef",
            }
        }
    )
    signer = FakeFlowSigner()
    payment = await X402Flow(signer).sign_payment(requirements)

    signed = signer.signed[0]
    assert signed.validation is not None
    assert signed.validation.subject == "0x" + "42" * 32

    validation_payload = payment.envelope["payload"]["payload"]["validation"]
    assert validation_payload["deadline"] == 1_700_000_600
    assert validation_payload["params"] == "0xdeadbeef"


async def test_sign_payment_v2_echoes_resource_and_extensions():
    accepted = reqs_v2()
    payment = await X402Flow(FakeFlowSigner()).sign_payment_v2(
        payment_required(accepted), accepted
    )

    assert payment.x402_version == 2
    assert payment.envelope["accepted"] == accepted.to_payload()
    assert payment.envelope["resource"] == {"url": "https://api.example/resource"}
    assert payment.envelope["extensions"] == {"echo": "me"}
    assert payment.envelope["payload"]["payload"]["version"] == "v1"


async def test_settle_sends_payload_object_not_header():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "success": True,
                "txHash": None,
                "networkId": "eip155:84532",
                "certificate": {"receipt": "0x00", "signature": "0x11"},
            },
        )

    flow = X402Flow(
        FakeFlowSigner(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    requirements = reqs_v1()
    payment = await flow.sign_payment(requirements)
    settled = await flow.settle_payment(
        payment, requirements, "https://facilitator.example"
    )

    assert seen["url"] == "https://facilitator.example/settle"
    assert seen["body"]["x402Version"] == 1
    assert seen["body"]["paymentPayload"] == payment.envelope
    assert "paymentHeader" not in seen["body"]
    assert seen["body"]["paymentRequirements"] == requirements.to_payload()
    assert settled.settlement.success
    assert settled.settlement.receipt.signature == "0x11"


@pytest.mark.parametrize(
    "body",
    [
        {"success": True},
        {"success": True, "certificate": {"claims": "0x00", "signature": "0x11"}},
    ],
)
def test_a_settlement_without_a_receipt_keeps_it_raw(body):
    """A facilitator that relays no receipt, or one still shaped like a BLS
    certificate, leaves ``receipt`` empty rather than misreading it."""
    from fourmica_sdk.x402.model import SettlementReceipt

    settlement = SettlementReceipt.from_raw(body)
    assert settlement.receipt is None
    assert settlement.raw == body


async def test_settle_rejects_version_mismatch():
    flow = X402Flow(FakeFlowSigner())
    payment = await flow.sign_payment(reqs_v1())
    with pytest.raises(X402Error, match="x402 v"):
        await flow.settle_payment(payment, reqs_v2(), "https://facilitator.example")


async def test_a_connected_client_signs_for_the_live_cycle(monkeypatch):
    """The Client is a FlowSigner: the payment is scoped to the cycle core
    reports, for the advertised asset, and signed under the ClearingHouse
    domain by the client's own key."""
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): lambda r: ok(
                {
                    "cycle_id": CYCLE,
                    "cycle_id_text": "t",
                    "asset_address": r.url.params["asset"],
                    "period_start": 1_700_000_000,
                    "period_end": int(time.time()) + 86_400,
                }
            )
        }
    )
    client = await connect(monkeypatch, core)

    payment = await X402Flow.from_client(client).sign_payment(reqs_v1())

    request = payment.payload
    assert request.payload.cycle_id == CYCLE
    assert request.payload.user_address == TEST_ADDRESS
    assert request.payload.asset_address == ASSET
    assert core.requests[-1].url.params["asset"] == ASSET
    domain = clearing_house_domain_separator(MOCK_CORE_CHAIN_ID, CLEARING_HOUSE_ADDRESS)
    recovered = Account._recover_hash(
        request.payload.signing_digest(domain), signature=request.signature
    )
    assert recovered == TEST_ADDRESS
