"""Tests for new UserClient methods: list_tabs and pay_tab auto-resolve."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from fourmica_sdk.client import RecipientClient, UserClient
from fourmica_sdk.errors import RpcError
from fourmica_sdk.models import GuaranteeInfo, TabInfo
from fourmica_sdk.rpc import RpcProxy

PAYER = "0xCeb466b69295362DE4e021185ad5f725f757ABD3"
RECIPIENT = "0x5A9C43bE40A9334FA1358093Dee026E7eCb77330"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
ETH_ZERO = "0x0000000000000000000000000000000000000000"

TAB_RAW: dict[str, Any] = {
    "tab_id": "42",
    "user_address": PAYER.lower(),
    "recipient_address": RECIPIENT.lower(),
    "asset_address": USDC,
    "start_timestamp": 1000,
    "ttl_seconds": 3600,
    "status": "OPEN",
    "settlement_status": "PENDING",
    "created_at": 1000,
    "updated_at": 1000,
    "total_amount": "5000",
    "paid_amount": "0",
}

GUARANTEE_RAW: dict[str, Any] = {
    "tab_id": "42",
    "req_id": "1",
    "from_address": PAYER.lower(),
    "to_address": RECIPIENT.lower(),
    "asset_address": USDC,
    "amount": "5000",
    "timestamp": 1000,
    "certificate": None,
}


def _proxy_with_transport(handler) -> RpcProxy:
    transport = httpx.MockTransport(handler)
    proxy = RpcProxy("http://example.com")
    proxy._client = httpx.AsyncClient(
        transport=transport, base_url="http://example.com"
    )
    return proxy


def _make_client_stub(signer_address: str, rpc: RpcProxy):
    """Build a minimal fake Client with a real RpcProxy and stub gateway/signer."""
    stub = MagicMock()
    stub._signer = MagicMock()
    stub._signer.address = signer_address
    stub.rpc = rpc
    stub.gateway = MagicMock()
    stub.recipient = MagicMock(spec=RecipientClient)
    return stub


# ---------------------------------------------------------------------------
# RpcProxy.list_user_tabs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rpc_list_user_tabs_returns_tabs():
    def handler(request: httpx.Request) -> httpx.Response:
        assert f"/core/users/{PAYER.lower()}/tabs" in str(request.url)
        assert "settlement_status" not in str(request.url)
        return httpx.Response(200, json=[TAB_RAW])

    proxy = _proxy_with_transport(handler)
    try:
        result = await proxy.list_user_tabs(PAYER.lower())
        assert result == [TAB_RAW]
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_list_user_tabs_passes_settlement_filter():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "settlement_status=PENDING" in str(request.url)
        return httpx.Response(200, json=[TAB_RAW])

    proxy = _proxy_with_transport(handler)
    try:
        result = await proxy.list_user_tabs(PAYER.lower(), ["PENDING"])
        assert len(result) == 1
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_list_user_tabs_raises_on_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "missing authorization"})

    proxy = _proxy_with_transport(handler)
    try:
        with pytest.raises(RpcError) as exc_info:
            await proxy.list_user_tabs(PAYER.lower())
        assert "401" in str(exc_info.value)
        assert exc_info.value.status_code == 401
    finally:
        await proxy.aclose()


# ---------------------------------------------------------------------------
# UserClient.list_tabs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_client_list_tabs_uses_signer_address():
    def handler(request: httpx.Request) -> httpx.Response:
        assert PAYER.lower() in str(request.url).lower()
        return httpx.Response(200, json=[TAB_RAW])

    proxy = _proxy_with_transport(handler)
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        user = UserClient(client_stub)
        tabs = await user.list_tabs()
        assert len(tabs) == 1
        assert isinstance(tabs[0], TabInfo)
        assert tabs[0].tab_id == 42
        assert tabs[0].status == "OPEN"
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_user_client_list_tabs_with_status_filter():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "settlement_status=PENDING" in str(request.url)
        return httpx.Response(200, json=[TAB_RAW])

    proxy = _proxy_with_transport(handler)
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        user = UserClient(client_stub)
        tabs = await user.list_tabs(["PENDING"])
        assert len(tabs) == 1
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_user_client_list_tabs_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    proxy = _proxy_with_transport(handler)
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        user = UserClient(client_stub)
        tabs = await user.list_tabs()
        assert tabs == []
    finally:
        await proxy.aclose()


# ---------------------------------------------------------------------------
# UserClient.pay_tab — auto-resolve from latest guarantee
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pay_tab_auto_resolves_erc20_from_guarantee():
    tab = TabInfo.from_rpc(TAB_RAW)  # total_amount=5000, paid_amount=0 → remaining=5000
    guarantee = GuaranteeInfo.from_rpc(GUARANTEE_RAW)

    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.recipient.get_tab = AsyncMock(return_value=tab)
        client_stub.recipient.get_latest_guarantee = AsyncMock(return_value=guarantee)
        client_stub.gateway.pay_tab_erc20 = AsyncMock(return_value={"tx": "0xabc"})

        user = UserClient(client_stub)
        result = await user.pay_tab(42)

        client_stub.recipient.get_tab.assert_awaited_once_with(42)
        client_stub.recipient.get_latest_guarantee.assert_awaited_once_with(42)
        # pays remaining (total - paid = 5000), not guarantee.amount
        client_stub.gateway.pay_tab_erc20.assert_awaited_once_with(
            42, 5000, USDC, RECIPIENT.lower(), None
        )
        assert result == {"tx": "0xabc"}
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_pay_tab_uses_remaining_not_guarantee_amount():
    """Partial payment: remaining = total_amount - paid_amount, not guarantee.amount."""
    tab_raw = {**TAB_RAW, "total_amount": "8000", "paid_amount": "3000"}
    guarantee_raw = {**GUARANTEE_RAW, "amount": "8000"}  # full original amount
    tab = TabInfo.from_rpc(tab_raw)
    guarantee = GuaranteeInfo.from_rpc(guarantee_raw)

    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.recipient.get_tab = AsyncMock(return_value=tab)
        client_stub.recipient.get_latest_guarantee = AsyncMock(return_value=guarantee)
        client_stub.gateway.pay_tab_erc20 = AsyncMock(return_value={"tx": "0xabc"})

        user = UserClient(client_stub)
        await user.pay_tab(42)

        client_stub.gateway.pay_tab_erc20.assert_awaited_once_with(
            42,
            5000,
            USDC,
            RECIPIENT.lower(),
            None,  # remaining = 8000 - 3000
        )
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_pay_tab_auto_resolves_eth_when_zero_asset():
    tab_raw = {**TAB_RAW, "asset_address": ETH_ZERO}
    eth_guarantee_raw = {**GUARANTEE_RAW, "asset_address": ETH_ZERO}
    tab = TabInfo.from_rpc(tab_raw)
    guarantee = GuaranteeInfo.from_rpc(eth_guarantee_raw)

    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.recipient.get_tab = AsyncMock(return_value=tab)
        client_stub.recipient.get_latest_guarantee = AsyncMock(return_value=guarantee)
        client_stub.gateway.pay_tab_eth = AsyncMock(return_value={"tx": "0xdef"})

        user = UserClient(client_stub)
        result = await user.pay_tab(42)

        client_stub.gateway.pay_tab_eth.assert_awaited_once_with(
            42,
            guarantee.req_id,
            5000,
            RECIPIENT.lower(),
            None,  # remaining = 5000
        )
        assert result == {"tx": "0xdef"}
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_pay_tab_raises_when_tab_not_found():
    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.recipient.get_tab = AsyncMock(return_value=None)

        user = UserClient(client_stub)
        with pytest.raises(ValueError, match="not found"):
            await user.pay_tab(42)
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_pay_tab_raises_when_no_guarantee():
    tab = TabInfo.from_rpc(TAB_RAW)

    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.recipient.get_tab = AsyncMock(return_value=tab)
        client_stub.recipient.get_latest_guarantee = AsyncMock(return_value=None)

        user = UserClient(client_stub)
        with pytest.raises(ValueError, match="no guarantee"):
            await user.pay_tab(42)
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_pay_tab_raises_when_already_fully_paid():
    tab_raw = {**TAB_RAW, "total_amount": "5000", "paid_amount": "5000"}
    guarantee = GuaranteeInfo.from_rpc(GUARANTEE_RAW)
    tab = TabInfo.from_rpc(tab_raw)

    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.recipient.get_tab = AsyncMock(return_value=tab)
        client_stub.recipient.get_latest_guarantee = AsyncMock(return_value=guarantee)

        user = UserClient(client_stub)
        with pytest.raises(ValueError, match="already fully paid"):
            await user.pay_tab(42)
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_pay_tab_explicit_params_skip_guarantee_lookup():
    proxy = _proxy_with_transport(lambda r: httpx.Response(200, json=[]))
    try:
        client_stub = _make_client_stub(PAYER, proxy)
        client_stub.gateway.pay_tab_erc20 = AsyncMock(return_value={"tx": "0xfed"})

        user = UserClient(client_stub)
        result = await user.pay_tab(
            tab_id=42,
            req_id=1,
            amount=5000,
            recipient_address=RECIPIENT,
            erc20_token=USDC,
        )

        client_stub.recipient.get_tab.assert_not_called()
        client_stub.gateway.pay_tab_erc20.assert_awaited_once_with(
            42, 5000, USDC, RECIPIENT, None
        )
        assert result == {"tx": "0xfed"}
    finally:
        await proxy.aclose()


# ---------------------------------------------------------------------------
# TabInfo model — total_amount / paid_amount
# ---------------------------------------------------------------------------


def test_tab_info_from_rpc_parses_total_and_paid_amount():
    raw = {**TAB_RAW, "total_amount": "12000", "paid_amount": "3000"}
    tab = TabInfo.from_rpc(raw)
    assert tab.total_amount == 12000
    assert tab.paid_amount == 3000


def test_tab_info_from_rpc_camel_case_keys():
    raw = {
        "tabId": "99",
        "userAddress": PAYER.lower(),
        "recipientAddress": RECIPIENT.lower(),
        "assetAddress": USDC,
        "startTimestamp": 1000,
        "ttlSeconds": 3600,
        "status": "OPEN",
        "settlementStatus": "PENDING",
        "createdAt": 1000,
        "updatedAt": 1000,
        "totalAmount": "7500",
        "paidAmount": "2500",
    }
    tab = TabInfo.from_rpc(raw)
    assert tab.tab_id == 99
    assert tab.total_amount == 7500
    assert tab.paid_amount == 2500


def test_tab_info_from_rpc_defaults_amounts_to_zero_when_absent():
    raw = {k: v for k, v in TAB_RAW.items() if k not in ("total_amount", "paid_amount")}
    tab = TabInfo.from_rpc(raw)
    assert tab.total_amount == 0
    assert tab.paid_amount == 0
