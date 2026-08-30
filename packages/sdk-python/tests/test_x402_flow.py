import base64
import json

import httpx

import pytest

from fourmica_sdk.errors import X402Error
from fourmica_sdk.models import PaymentSignature, SigningScheme
from fourmica_sdk.x402 import (
    PaymentRequirementsExtra,
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    TabResponse,
    X402Flow,
    X402PaymentRequired,
    X402ResourceInfo,
)


class StubSigner:
    async def sign_payment(self, claims, scheme: SigningScheme) -> PaymentSignature:
        return PaymentSignature(signature="deadbeef", scheme=scheme)


class StubX402Flow(X402Flow):
    async def _request_tab(
        self,
        x402_version,
        payment_requirements,
        user_address: str,
        resource=None,
    ) -> TabResponse:
        return TabResponse(tab_id="2", user_address=user_address, next_req_id="0x1")


@pytest.mark.asyncio
async def test_sign_payment_rejects_invalid_scheme():
    flow = StubX402Flow(StubSigner())
    requirements = PaymentRequirementsV1(
        scheme="http+pay",
        network="testnet",
        max_amount_required="1",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": "https://example.com"},
    )
    with pytest.raises(X402Error):
        await flow.sign_payment(
            requirements, "0x0000000000000000000000000000000000000001"
        )


@pytest.mark.asyncio
async def test_sign_payment_builds_header_and_payload():
    flow = StubX402Flow(StubSigner())
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": "https://example.com"},
    )
    user_address = "0x0000000000000000000000000000000000000001"
    signed = await flow.sign_payment(requirements, user_address)

    decoded_header = base64.b64decode(signed.header).decode()
    envelope = json.loads(decoded_header)

    assert envelope["x402Version"] == 1
    assert envelope["scheme"] == "4mica+pay"
    assert envelope["payload"]["claims"]["tab_id"] == hex(2)
    assert envelope["payload"]["claims"]["req_id"] == hex(1)
    assert signed.payload["claims"]["tab_id"] == hex(2)
    assert signed.payload["claims"]["amount"] == hex(5)
    assert signed.payload["claims"]["req_id"] == hex(1)


def test_payment_requirements_from_raw_handles_casing_and_required_fields():
    raw = {
        "scheme": "4mica-credit",
        "network": "polygon-amoy",
        "maxAmountRequired": "0x1",
        "payTo": "0xabc",
        "asset": "0xdef",
        "extra": {"tabEndpoint": "http://tab"},
        "mimeType": "application/json",
        "maxTimeoutSeconds": 300,
    }
    req = PaymentRequirementsV1.from_raw(raw)
    assert req.scheme == "4mica-credit"
    assert req.network == "polygon-amoy"
    assert req.max_amount_required == "0x1"
    assert req.pay_to == "0xabc"
    assert req.asset == "0xdef"
    assert req.mime_type == "application/json"
    assert req.max_timeout_seconds == 300


def test_payment_requirements_extra_parses_v2_validation_fields():
    extra = PaymentRequirementsExtra.from_raw(
        {
            "tabEndpoint": "https://example.com/tab",
            "validationRegistryAddress": "0x0000000000000000000000000000000000000011",
            "validationChainId": 1,
            "validatorAddress": "0x0000000000000000000000000000000000000022",
            "validatorAgentId": "0x7",
            "minValidationScore": 80,
            "requiredValidationTag": "hard-finality",
            "jobHash": "0x" + "11" * 32,
        }
    )
    assert extra.tab_endpoint == "https://example.com/tab"
    assert (
        extra.validation_registry_address
        == "0x0000000000000000000000000000000000000011"
    )
    assert extra.validation_chain_id == 1
    assert extra.validator_address == "0x0000000000000000000000000000000000000022"
    assert extra.validator_agent_id == 7
    assert extra.min_validation_score == 80
    assert extra.required_validation_tag == "hard-finality"
    assert extra.job_hash == "0x" + "11" * 32


def test_payment_requirements_extra_parses_v2_fields_without_tab_endpoint():
    extra = PaymentRequirementsExtra.from_raw(
        {
            "validationRegistryAddress": "0x0000000000000000000000000000000000000011",
            "validationChainId": 1,
            "validatorAddress": "0x0000000000000000000000000000000000000022",
            "validatorAgentId": "0x7",
            "minValidationScore": 80,
            "requiredValidationTag": "hard-finality",
            "jobHash": "0x" + "11" * 32,
        }
    )
    assert extra.tab_endpoint is None
    assert (
        extra.validation_registry_address
        == "0x0000000000000000000000000000000000000011"
    )
    assert extra.validation_chain_id == 1
    assert extra.validator_address == "0x0000000000000000000000000000000000000022"
    assert extra.validator_agent_id == 7
    assert extra.min_validation_score == 80
    assert extra.required_validation_tag == "hard-finality"
    assert extra.job_hash == "0x" + "11" * 32


def test_payment_requirements_extra_rejects_invalid_validator_agent_id():
    with pytest.raises(X402Error, match="invalid validatorAgentId"):
        PaymentRequirementsExtra.from_raw(
            {
                "tabEndpoint": "https://example.com/tab",
                "validatorAgentId": "not-a-number",
            }
        )


def test_build_claims_rejects_user_mismatch():
    flow = StubX402Flow(StubSigner())
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": "https://example.com"},
    )
    tab = TabResponse(
        tab_id=3,
        user_address="0x00000000000000000000000000000000000000aa",
    )
    with pytest.raises(X402Error):
        flow._build_claims(
            requirements, tab, "0x00000000000000000000000000000000000000bb"
        )


class RecordingSigner:
    async def sign_payment(self, claims, scheme: SigningScheme) -> PaymentSignature:
        return PaymentSignature(signature="0xsig", scheme=scheme)


@pytest.mark.asyncio
async def test_x402_flow_settles_payment_through_facilitator():
    user_address = "0x0000000000000000000000000000000000000009"
    tab_endpoint = "http://facilitator.test/tab"
    facilitator_url = "http://facilitator.test"
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x00000000000000000000000000000000000000ff",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": tab_endpoint},
    )

    def handler(request):
        if request.url.path == "/tab":
            assert request.method == "POST"
            body = json.loads(request.content.decode())
            assert body["x402Version"] == 1
            assert body["userAddress"] == user_address
            return httpx.Response(
                200,
                json={
                    "tabId": "0x1234",
                    "userAddress": user_address,
                    "nextReqId": "0x1",
                },
            )
        if request.url.path == "/settle":
            payload = json.loads(request.content.decode())
            assert payload["paymentRequirements"]["payTo"] == requirements.pay_to
            return httpx.Response(
                200,
                json={"settled": True, "networkId": requirements.network},
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    flow = X402Flow(RecordingSigner(), httpx.AsyncClient(transport=transport))

    try:
        payment = await flow.sign_payment(requirements, user_address)
        assert payment.payload["claims"]["tab_id"] == hex(0x1234)

        settled = await flow.settle_payment(payment, requirements, facilitator_url)
        assert settled.settlement.raw["settled"] is True
        assert settled.settlement.raw["networkId"] == requirements.network
        assert (
            settled.payment.payload["claims"]["recipient_address"]
            == requirements.pay_to
        )
    finally:
        await flow.http.aclose()


@pytest.mark.asyncio
async def test_sign_payment_v2_builds_header_and_payload():
    flow = StubX402Flow(StubSigner())
    accepted = PaymentRequirementsV2(
        scheme="4mica+pay",
        network="eip155:1",
        amount="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={
            "tabEndpoint": "https://example.com",
            "validationRegistryAddress": "0x0000000000000000000000000000000000000011",
            "validatorAddress": "0x0000000000000000000000000000000000000022",
            "validatorAgentId": "0x7",
            "minValidationScore": 80,
            "requiredValidationTag": "hard-finality",
            "jobHash": "0x" + "11" * 32,
        },
    )
    payment_required = X402PaymentRequired(
        x402_version=2,
        resource=X402ResourceInfo(
            url="https://example.com/data",
            description="example",
            mime_type="application/json",
        ),
        accepts=[accepted],
    )
    user_address = "0x0000000000000000000000000000000000000001"
    signed = await flow.sign_payment_v2(payment_required, accepted, user_address)

    decoded_header = base64.b64decode(signed.header).decode()
    envelope = json.loads(decoded_header)

    assert envelope["x402Version"] == 2
    assert envelope["accepted"]["amount"] == "5"
    assert envelope["resource"]["mimeType"] == "application/json"
    assert envelope["payload"]["claims"]["version"] == "v2"
    assert signed.payload["claims"]["tab_id"] == hex(2)
    assert signed.payload["claims"]["req_id"] == hex(1)
    assert signed.payload["claims"]["amount"] == hex(5)
    assert (
        signed.payload["claims"]["validation_registry_address"]
        == "0x0000000000000000000000000000000000000011"
    )
    assert signed.payload["claims"]["validation_chain_id"] == 1
    assert (
        signed.payload["claims"]["validator_address"]
        == "0x0000000000000000000000000000000000000022"
    )
    assert signed.payload["claims"]["validator_agent_id"] == "0x7"
    assert signed.payload["claims"]["min_validation_score"] == 80
    assert signed.payload["claims"]["required_validation_tag"] == "hard-finality"
    assert signed.payload["claims"]["job_hash"] == "0x" + "11" * 32
    assert isinstance(signed.payload["claims"]["validation_request_hash"], str)
    assert isinstance(signed.payload["claims"]["validation_subject_hash"], str)
    assert signed.payload["claims"]["validation_request_hash"] != "0x" + "00" * 32
    assert signed.payload["claims"]["validation_subject_hash"] != "0x" + "00" * 32


@pytest.mark.asyncio
async def test_sign_payment_v2_rejects_missing_validation_fields():
    flow = StubX402Flow(StubSigner())
    accepted = PaymentRequirementsV2(
        scheme="4mica+pay",
        network="eip155:1",
        amount="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": "https://example.com"},
    )
    payment_required = X402PaymentRequired(
        x402_version=2,
        resource=X402ResourceInfo(
            url="https://example.com/data",
            description="example",
            mime_type="application/json",
        ),
        accepts=[accepted],
    )

    with pytest.raises(X402Error, match="missing V2 validation fields"):
        await flow.sign_payment_v2(
            payment_required,
            accepted,
            "0x0000000000000000000000000000000000000001",
        )


@pytest.mark.asyncio
async def test_sign_payment_rejects_missing_tab_endpoint():
    # Use real X402Flow — _request_tab raises before any HTTP call
    flow = X402Flow(StubSigner())
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={},  # no tabEndpoint
    )
    with pytest.raises(X402Error, match="missing tabEndpoint"):
        await flow.sign_payment(
            requirements, "0x0000000000000000000000000000000000000001"
        )


@pytest.mark.asyncio
async def test_sign_payment_rejects_non_string_tab_endpoint():
    # Use real X402Flow — invalid URL parsed before HTTP
    flow = X402Flow(StubSigner())
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": 12345},  # integer, not a valid URL
    )
    with pytest.raises(X402Error, match="tabEndpoint"):
        await flow.sign_payment(
            requirements, "0x0000000000000000000000000000000000000001"
        )


@pytest.mark.asyncio
async def test_request_tab_surfaces_http_failure():
    """A non-2xx tab-endpoint response is surfaced as X402Error."""
    user_address = "0x0000000000000000000000000000000000000009"
    tab_endpoint = "http://failing.test/tab"

    def handler(request):
        if request.url.path == "/tab":
            return httpx.Response(503, json={"error": "service unavailable"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x00000000000000000000000000000000000000ff",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": tab_endpoint},
    )
    flow = X402Flow(StubSigner(), httpx.AsyncClient(transport=transport))
    try:
        with pytest.raises(X402Error):
            await flow.sign_payment(requirements, user_address)
    finally:
        await flow.http.aclose()


@pytest.mark.asyncio
async def test_settle_payment_fails_when_facilitator_errors():
    """A non-2xx facilitator response raises X402Error."""
    user_address = "0x0000000000000000000000000000000000000009"
    tab_endpoint = "http://facilitator.test/tab"
    facilitator_url = "http://facilitator.test"
    requirements = PaymentRequirementsV1(
        scheme="4mica+pay",
        network="testnet",
        max_amount_required="5",
        pay_to="0x00000000000000000000000000000000000000ff",
        asset="0x0000000000000000000000000000000000000000",
        extra={"tabEndpoint": tab_endpoint},
    )

    def handler(request):
        if request.url.path == "/tab":
            return httpx.Response(
                200,
                json={"tabId": "0x1", "userAddress": user_address, "nextReqId": "0x0"},
            )
        if request.url.path == "/settle":
            return httpx.Response(402, json={"error": "payment verification failed"})
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    flow = X402Flow(RecordingSigner(), httpx.AsyncClient(transport=transport))
    try:
        payment = await flow.sign_payment(requirements, user_address)
        with pytest.raises(X402Error, match="settlement failed"):
            await flow.settle_payment(payment, requirements, facilitator_url)
    finally:
        await flow.http.aclose()


def test_payment_requirements_v2_from_raw_rejects_missing_amount():
    with pytest.raises(X402Error, match="missing fields"):
        PaymentRequirementsV2.from_raw(
            {
                "scheme": "4mica+pay",
                "network": "eip155:1",
                "payTo": "0x0000000000000000000000000000000000000003",
                "asset": "0x0000000000000000000000000000000000000000",
                # "amount" intentionally absent
            }
        )


@pytest.mark.asyncio
async def test_sign_payment_v2_rejects_mismatched_validation_chain_id():
    flow = StubX402Flow(StubSigner())
    accepted = PaymentRequirementsV2(
        scheme="4mica+pay",
        network="eip155:1",
        amount="5",
        pay_to="0x0000000000000000000000000000000000000003",
        asset="0x0000000000000000000000000000000000000000",
        extra={
            "tabEndpoint": "https://example.com",
            "validationRegistryAddress": "0x0000000000000000000000000000000000000011",
            "validationChainId": 2,
            "validatorAddress": "0x0000000000000000000000000000000000000022",
            "validatorAgentId": "0x7",
            "minValidationScore": 80,
            "jobHash": "0x" + "11" * 32,
        },
    )
    payment_required = X402PaymentRequired(
        x402_version=2,
        resource=X402ResourceInfo(
            url="https://example.com/data",
            description="example",
            mime_type="application/json",
        ),
        accepts=[accepted],
    )

    with pytest.raises(
        X402Error, match="validationChainId does not match paymentRequirements.network"
    ):
        await flow.sign_payment_v2(
            payment_required,
            accepted,
            "0x0000000000000000000000000000000000000001",
        )
