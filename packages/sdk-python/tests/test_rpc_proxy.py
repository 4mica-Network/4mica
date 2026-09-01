import httpx
import pytest

from fourmica_sdk.errors import RpcError
from fourmica_sdk.rpc import RpcProxy


def _proxy_with_transport(handler) -> RpcProxy:
    transport = httpx.MockTransport(handler)
    proxy = RpcProxy("http://example.com")
    proxy._client = httpx.AsyncClient(
        transport=transport, base_url="http://example.com"
    )
    return proxy


@pytest.mark.asyncio
async def test_rpc_proxy_get_public_params_round_trip():
    params = {
        "public_key": [1, 2, 3],
        "contract_address": "0x1234567890abcdef1234567890abcdef12345678",
        "ethereum_http_rpc_url": "http://localhost:8545",
        "eip712_name": "4mica",
        "eip712_version": "1",
        "chain_id": 1337,
        "max_accepted_guarantee_version": 2,
        "accepted_guarantee_versions": [1, 2],
        "active_guarantee_domain_separator": "0x" + "ab" * 32,
        "trusted_validation_registries": ["0x0000000000000000000000000000000000000011"],
        "validation_hash_canonicalization_version": "4MICA_VALIDATION_REQUEST_V1",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/core/public-params"
        return httpx.Response(200, json=params)

    proxy = _proxy_with_transport(handler)
    try:
        got = await proxy.get_public_params()
        assert got.chain_id == 1337
        assert got.contract_address == params["contract_address"]
        assert got.ethereum_http_rpc_url == params["ethereum_http_rpc_url"]
        assert got.max_accepted_guarantee_version == 2
        assert got.accepted_guarantee_versions == [1, 2]
        assert (
            got.active_guarantee_domain_separator
            == params["active_guarantee_domain_separator"]
        )
        assert got.trusted_validation_registries == [
            "0x0000000000000000000000000000000000000011"
        ]
        assert (
            got.validation_hash_canonicalization_version
            == "4MICA_VALIDATION_REQUEST_V1"
        )
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_surfaces_api_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        assert "settlement_status=unknown" in str(request.url)
        payload = {"error": "invalid settlement status: unknown"}
        return httpx.Response(400, json=payload)

    proxy = _proxy_with_transport(handler)
    try:
        with pytest.raises(RpcError) as err:
            await proxy.list_recipient_tabs("0xdeadbeef", ["unknown"])
        assert "invalid settlement status" in str(err.value)
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_returns_decode_error_on_invalid_json():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not-json")

    proxy = _proxy_with_transport(handler)
    try:
        with pytest.raises(RpcError):
            await proxy.get_public_params()
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_includes_bearer_token():
    params = {
        "public_key": [1, 2, 3],
        "contract_address": "0x1234567890abcdef1234567890abcdef12345678",
        "ethereum_http_rpc_url": "http://localhost:8545",
        "eip712_name": "4mica",
        "eip712_version": "1",
        "chain_id": 1337,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer token"
        return httpx.Response(200, json=params)

    proxy = _proxy_with_transport(handler).with_bearer_token("token")
    try:
        await proxy.get_public_params()
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_preserves_prefixed_bearer_token():
    params = {
        "public_key": [1, 2, 3],
        "contract_address": "0x1234567890abcdef1234567890abcdef12345678",
        "ethereum_http_rpc_url": "http://localhost:8545",
        "eip712_name": "4mica",
        "eip712_version": "1",
        "chain_id": 1337,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer token"
        return httpx.Response(200, json=params)

    proxy = _proxy_with_transport(handler).with_bearer_token("Bearer token")
    try:
        await proxy.get_public_params()
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_gets_supported_tokens():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/core/tokens"
        return httpx.Response(
            200,
            json={
                "chainId": 8453,
                "tokens": [
                    {
                        "symbol": "USDC",
                        "address": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
                        "decimals": 6,
                    },
                    {
                        "symbol": "ETH",
                        "address": "0x0000000000000000000000000000000000000000",
                    },
                ],
            },
        )

    from fourmica_sdk.models import SupportedTokenInfo, SupportedTokensResponse

    proxy = _proxy_with_transport(handler)
    try:
        resp = await proxy.get_supported_tokens()
        assert isinstance(resp, SupportedTokensResponse)
        assert resp.chain_id == 8453
        assert all(isinstance(t, SupportedTokenInfo) for t in resp.tokens)
        assert len(resp.tokens) == 2
        assert resp.tokens[0].symbol == "USDC"
        assert resp.tokens[0].decimals == 6
        assert resp.tokens[1].symbol == "ETH"
        assert resp.tokens[1].decimals is None
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_adds_admin_api_key_header():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-api-key") == "ak_test123"
        return httpx.Response(
            200, json={"suspended": False, "userAddress": "0xdeadbeef", "updatedAt": 0}
        )

    proxy = _proxy_with_transport(handler)
    proxy.with_admin_api_key("ak_test123")
    try:
        result = await proxy.update_user_suspension("0xdeadbeef", False)
        assert result is not None
    finally:
        await proxy.aclose()


@pytest.mark.asyncio
async def test_rpc_proxy_uses_token_provider():
    params = {
        "public_key": [1, 2, 3],
        "contract_address": "0x1234567890abcdef1234567890abcdef12345678",
        "ethereum_http_rpc_url": "http://localhost:8545",
        "eip712_name": "4mica",
        "eip712_version": "1",
        "chain_id": 1337,
    }
    calls = {"count": 0}

    async def provider() -> str:
        calls["count"] += 1
        return "dynamic"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer dynamic"
        return httpx.Response(200, json=params)

    proxy = _proxy_with_transport(handler).with_token_provider(provider)
    try:
        await proxy.get_public_params()
        assert calls["count"] == 1
    finally:
        await proxy.aclose()
