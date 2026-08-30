import base64
import json

import httpx
import pytest

from fourmica_sdk.errors import X402Error
from fourmica_sdk.models import PaymentSignature, SigningScheme
from fourmica_sdk.x402 import (
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    X402Flow,
    X402PaymentRequired,
)

USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PAY_TO = "0x00000000000000000000000000000000000000Be"
ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"


class FakeFlowSigner:
    def __init__(self) -> None:
        self.signed = []

    async def sign_payment(self, claims, scheme):
        self.signed.append((claims, scheme))
        return PaymentSignature(signature="0x" + "ab" * 65, scheme=scheme)


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


async def test_sign_payment_v1_builds_envelope_without_tab_step():
    signer = FakeFlowSigner()
    payment = await X402Flow(signer).sign_payment(reqs_v1(), USER)

    assert payment.x402_version == 1
    envelope = json.loads(base64.b64decode(payment.header))
    assert envelope == payment.envelope
    assert envelope["x402Version"] == 1
    assert envelope["scheme"] == "4mica-credit"
    assert envelope["network"] == "eip155:84532"

    claims_payload = envelope["payload"]["claims"]
    assert claims_payload["version"] == "v1"
    assert claims_payload["user_address"] == USER
    assert claims_payload["recipient_address"] == PAY_TO
    assert claims_payload["amount"] == hex(1000)
    assert int(claims_payload["req_id"], 16) != 0
    assert "tab_id" not in claims_payload

    signed_claims, scheme = signer.signed[0]
    assert scheme == SigningScheme.EIP712
    assert signed_claims.validation is None


async def test_sign_payment_rejects_foreign_scheme():
    with pytest.raises(X402Error, match="invalid scheme"):
        await X402Flow(FakeFlowSigner()).sign_payment(reqs_v1(scheme="exact"), USER)


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
    payment = await X402Flow(signer).sign_payment(requirements, USER)

    signed_claims, _ = signer.signed[0]
    assert signed_claims.validation is not None
    assert signed_claims.validation.subject == "0x" + "42" * 32

    validation_payload = payment.envelope["payload"]["claims"]["validation"]
    assert validation_payload["deadline"] == 1_700_000_600
    assert validation_payload["params"] == "0xdeadbeef"


async def test_sign_payment_v2_echoes_resource_and_extensions():
    accepted = reqs_v2()
    payment = await X402Flow(FakeFlowSigner()).sign_payment_v2(
        payment_required(accepted), accepted, USER
    )

    assert payment.x402_version == 2
    assert payment.envelope["accepted"] == accepted.to_payload()
    assert payment.envelope["resource"] == {"url": "https://api.example/resource"}
    assert payment.envelope["extensions"] == {"echo": "me"}


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
                "certificate": {"claims": "0x00", "signature": "0x11"},
            },
        )

    flow = X402Flow(
        FakeFlowSigner(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    requirements = reqs_v1()
    payment = await flow.sign_payment(requirements, USER)
    settled = await flow.settle_payment(
        payment, requirements, "https://facilitator.example"
    )

    assert seen["url"] == "https://facilitator.example/settle"
    assert seen["body"]["x402Version"] == 1
    assert seen["body"]["paymentPayload"] == payment.envelope
    assert "paymentHeader" not in seen["body"]
    assert seen["body"]["paymentRequirements"] == requirements.to_payload()
    assert settled.settlement.success
    assert settled.settlement.certificate.signature == "0x11"


async def test_settle_rejects_version_mismatch():
    flow = X402Flow(FakeFlowSigner())
    payment = await flow.sign_payment(reqs_v1(), USER)
    with pytest.raises(X402Error, match="x402 v"):
        await flow.settle_payment(payment, reqs_v2(), "https://facilitator.example")
