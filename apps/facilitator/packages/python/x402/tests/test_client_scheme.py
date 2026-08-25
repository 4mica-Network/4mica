import pytest
from x402.schemas import PaymentRequirements
from x402.schemas.v1 import PaymentRequirementsV1

from fourmica_x402.client_scheme import FourMicaEvmScheme

pytest.importorskip("x402")
pytest.importorskip("fourmica_sdk")
pytest.importorskip("eth_account")


class StubSigned:
    def __init__(self, payload):
        self.payload = payload


class StubFlow:
    def __init__(self):
        self.last_payment_required = None
        self.last_accepted = None

    async def sign_payment_v2(self, payment_required, accepted, user_address):
        self.last_payment_required = payment_required
        self.last_accepted = accepted
        return StubSigned({"claims": {"tab_id": "0x1"}, "v": 2})

    async def sign_payment(self, requirements, user_address):
        return StubSigned({"claims": {"tab_id": "0x2"}, "v": 1})


class StubScheme(FourMicaEvmScheme):
    async def _create_flow(self, rpc_url: str):
        return StubFlow()


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
            "validationRegistryAddress": "0x3333333333333333333333333333333333333333",
            "validatorAddress": "0x4444444444444444444444444444444444444444",
            "validatorAgentId": "7",
            "minValidationScore": 80,
            "requiredValidationTag": "hard-finality",
            "jobHash": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "resource": {
                "url": "https://api.example.com/premium",
                "description": "Premium dataset",
                "mimeType": "application/json",
            },
        },
    )
    payload = scheme.create_payment_payload(req)
    assert payload["v"] == 2
    assert payload["claims"]["tab_id"] == "0x1"
    flow = scheme._flows["https://custom.rpc.example"]
    assert flow.last_payment_required.resource.url == "https://api.example.com/premium"
    assert flow.last_payment_required.resource.description == "Premium dataset"
    assert (
        flow.last_accepted.extra["validationRegistryAddress"]
        == "0x3333333333333333333333333333333333333333"
    )
    assert (
        flow.last_accepted.extra["validatorAddress"] == "0x4444444444444444444444444444444444444444"
    )
    assert flow.last_accepted.extra["validatorAgentId"] == "7"
    assert flow.last_accepted.extra["minValidationScore"] == 80
    assert flow.last_accepted.extra["requiredValidationTag"] == "hard-finality"
    assert (
        flow.last_accepted.extra["jobHash"]
        == "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )


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
    assert payload["claims"]["tab_id"] == "0x2"


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
