import asyncio
import json

import pytest
from x402.http import FacilitatorConfig

from fourmica_x402.facilitator import (
    FourMicaFacilitatorClient,
    FourMicaFacilitatorClientSync,
    OpenTabError,
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


def test_open_tab_async_success():
    base_url = "http://fac.test"

    def handler(request):
        assert request.url.path == "/tabs"
        body = json.loads(request.content.decode())
        assert body["userAddress"] == "0xabc"
        return httpx.Response(
            200,
            json={
                "tabId": "0x1",
                "userAddress": "0xabc",
                "recipientAddress": "0xdef",
                "assetAddress": "0x0",
                "startTimestamp": 123,
                "ttlSeconds": 3600,
                "nextReqId": "0x2",
            },
        )

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        resp = run(client.open_tab("0xabc", {"payTo": "0xdef"}, ttl_seconds=3600))
        assert resp.tab_id == "0x1"
        assert resp.next_req_id == "0x2"
    finally:
        run(async_client.aclose())


def test_open_tab_async_error():
    base_url = "http://fac.test"

    def handler(request):
        return httpx.Response(
            400,
            json={
                "tabId": "0x1",
                "userAddress": "0xabc",
                "recipientAddress": "0xdef",
                "assetAddress": "0x0",
                "startTimestamp": 123,
                "ttlSeconds": 3600,
                "nextReqId": "0x2",
            },
        )

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        with pytest.raises(OpenTabError):
            run(client.open_tab("0xabc", {"payTo": "0xdef"}))
    finally:
        run(async_client.aclose())


def test_open_tab_sync_success():
    base_url = "http://fac.test"

    def handler(request):
        return httpx.Response(
            200,
            json={
                "tabId": "0x1",
                "userAddress": "0xabc",
                "recipientAddress": "0xdef",
                "assetAddress": "0x0",
                "startTimestamp": 123,
                "ttlSeconds": 3600,
            },
        )

    transport = httpx.MockTransport(handler)
    sync_client = httpx.Client(transport=transport)
    client = FourMicaFacilitatorClientSync(FacilitatorConfig(url=base_url, http_client=sync_client))

    resp = client.open_tab("0xabc", {"payTo": "0xdef"})
    assert resp.tab_id == "0x1"

    sync_client.close()


def test_open_tab_sync_error():
    base_url = "http://fac.test"

    def handler(request):
        return httpx.Response(400, json={"error": "bad"})

    transport = httpx.MockTransport(handler)
    sync_client = httpx.Client(transport=transport)
    client = FourMicaFacilitatorClientSync(FacilitatorConfig(url=base_url, http_client=sync_client))

    with pytest.raises(OpenTabError):
        client.open_tab("0xabc", {"payTo": "0xdef"})

    sync_client.close()


def test_settle_async_normalizes_certificate_and_alias_fields():
    base_url = "http://fac.test"

    def handler(request):
        body = json.loads(request.content.decode())
        assert body["x402Version"] == 2
        return httpx.Response(
            200,
            json={
                "success": True,
                "txHash": "0xdeadbeef",
                "networkId": "eip155:11155111",
                "certificate": {
                    "claims": "0x" + "11" * 32,
                    "signature": "0x" + "22" * 96,
                },
            },
        )

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        response = run(
            client.settle(
                StubModel(
                    x402_version=2,
                    accepted={"scheme": "4mica-credit"},
                    payload={"claims": {"version": "v2"}},
                ),
                StubModel(network="eip155:11155111", scheme="4mica-credit"),
            )
        )
        assert response.success is True
        assert response.transaction == "0xdeadbeef"
        assert response.network == "eip155:11155111"
        assert response.error_reason is None
    finally:
        run(async_client.aclose())


def test_settle_async_normalizes_alias_fields_without_certificate():
    base_url = "http://fac.test"

    def handler(request):
        body = json.loads(request.content.decode())
        assert body["x402Version"] == 2
        assert body["paymentPayload"]["payload"]["claims"]["version"] == "v2"
        return httpx.Response(
            200,
            json={
                "success": True,
                "transactionHash": "0xabc123",
                "network": "eip155:80002",
                "user_address": "0x9999999999999999999999999999999999999999",
            },
        )

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        response = run(
            client.settle(
                StubModel(
                    x402_version=2,
                    accepted={"scheme": "4mica-credit"},
                    payload={"claims": {"version": "v2"}},
                ),
                StubModel(network="eip155:80002", scheme="4mica-credit"),
            )
        )
        assert response.success is True
        assert response.transaction == "0xabc123"
        assert response.network == "eip155:80002"
        assert response.payer == "0x9999999999999999999999999999999999999999"
        assert response.error_reason is None
    finally:
        run(async_client.aclose())


def test_settle_async_raises_on_facilitator_error_reason():
    base_url = "http://fac.test"

    def handler(request):
        return httpx.Response(
            400,
            json={
                "success": False,
                "error_reason": "unsupported x402Version 2",
            },
        )

    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(transport=transport)
    client = FourMicaFacilitatorClient(FacilitatorConfig(url=base_url, http_client=async_client))

    try:
        with pytest.raises(ValueError, match="unsupported x402Version 2"):
            run(
                client.settle(
                    StubModel(
                        x402_version=2,
                        accepted={"scheme": "4mica-credit"},
                        payload={"claims": {"version": "v2"}},
                    ),
                    StubModel(network="eip155:11155111", scheme="4mica-credit"),
                )
            )
    finally:
        run(async_client.aclose())


def test_settle_sync_normalizes_alias_fields():
    base_url = "http://fac.test"

    def handler(request):
        return httpx.Response(
            200,
            json={
                "success": True,
                "tx_hash": "0xfeedface",
                "network_id": "eip155:11155111",
                "certificate": {
                    "claims": "0x" + "11" * 32,
                    "signature": "0x" + "22" * 96,
                },
            },
        )

    transport = httpx.MockTransport(handler)
    sync_client = httpx.Client(transport=transport)
    client = FourMicaFacilitatorClientSync(FacilitatorConfig(url=base_url, http_client=sync_client))

    response = client.settle(
        StubModel(
            x402_version=2,
            accepted={"scheme": "4mica-credit"},
            payload={"claims": {"version": "v2"}},
        ),
        StubModel(network="eip155:11155111", scheme="4mica-credit"),
    )
    assert response.success is True
    assert response.transaction == "0xfeedface"
    assert response.network == "eip155:11155111"
    assert response.error_reason is None

    sync_client.close()
