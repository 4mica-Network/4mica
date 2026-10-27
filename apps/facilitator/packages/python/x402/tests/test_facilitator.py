import asyncio
import json

import pytest
from x402.http import FacilitatorConfig

from fourmica_x402.facilitator import (
    FourMicaFacilitatorClient,
    FourMicaFacilitatorClientSync,
)

httpx = pytest.importorskip("httpx")


class StubModel:
    def __init__(self, x402_version=2, **payload):
        self.x402_version = x402_version
        self._payload = payload

    def model_dump(self, by_alias=True, exclude_none=True):
        del by_alias, exclude_none
        return dict(self._payload)


def run(coro):
    return asyncio.run(coro)


PAYMENT = {
    "x402_version": 2,
    "accepted": {"scheme": "4mica-credit"},
    "payload": {"payload": {"version": "v1"}, "signature": "0x" + "33" * 65},
}
RECEIPT = {"receipt": "0x" + "11" * 32, "signature": "0x" + "22" * 65}


def test_settle_async_reads_the_receipt_from_extra():
    base_url = "http://fac.test"

    def handler(request):
        body = json.loads(request.content.decode())
        assert body["x402Version"] == 2
        assert body["paymentPayload"]["payload"]["payload"]["version"] == "v1"
        return httpx.Response(
            200,
            json={
                "success": True,
                "payer": "0x9999999999999999999999999999999999999999",
                "transaction": "",
                "network": "eip155:11155111",
                "extra": {"receipt": RECEIPT},
            },
        )

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        response = run(
            client.settle(
                StubModel(**PAYMENT),
                StubModel(network="eip155:11155111", scheme="4mica-credit"),
            )
        )
        assert response.success is True
        assert response.transaction == ""
        assert response.network == "eip155:11155111"
        assert response.payer == "0x9999999999999999999999999999999999999999"
        assert response.error_reason is None
        assert response.extra == {"receipt": RECEIPT}
    finally:
        run(async_client.aclose())


def test_settle_async_raises_on_a_non_200():
    base_url = "http://fac.test"

    def handler(request):
        return httpx.Response(422, text="unsupported x402Version 3")

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        with pytest.raises(ValueError, match="unsupported x402Version 3"):
            run(
                client.settle(
                    StubModel(**PAYMENT),
                    StubModel(network="eip155:11155111", scheme="4mica-credit"),
                )
            )
    finally:
        run(async_client.aclose())


def test_settle_sync_surfaces_a_refusal():
    """Refusals arrive as HTTP 200 with ``success: false``: the reason is a
    code, and 4mica's ``retryable`` / ``details`` ride under ``extra``."""
    base_url = "http://fac.test"
    details = {"uncheckpointed": 64, "max_uncheckpointed": 64}

    def handler(request):
        return httpx.Response(
            200,
            json={
                "success": False,
                "errorReason": "invalid_4mica_credit_checkpoint_required",
                "errorMessage": "checkpoint required",
                "transaction": "",
                "network": "eip155:11155111",
                "extra": {"retryable": False, "details": details},
            },
        )

    transport = httpx.MockTransport(handler)
    sync_client = httpx.Client(transport=transport)
    client = FourMicaFacilitatorClientSync(FacilitatorConfig(url=base_url, http_client=sync_client))

    response = client.settle(
        StubModel(**PAYMENT),
        StubModel(network="eip155:11155111", scheme="4mica-credit"),
    )
    assert response.success is False
    assert response.error_reason == "invalid_4mica_credit_checkpoint_required"
    assert response.error_message == "checkpoint required"
    assert response.extra == {"retryable": False, "details": details}

    sync_client.close()
