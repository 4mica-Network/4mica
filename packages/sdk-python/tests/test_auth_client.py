import httpx
import pytest

from fourmica_sdk.auth import (
    AuthClient,
    AuthNonceResponse,
    SiweTemplate,
    build_siwe_message,
)
from fourmica_sdk.errors import AuthDecodeError, AuthStatusError, AuthTransportError


def _auth_client(handler) -> AuthClient:
    transport = httpx.MockTransport(handler)
    async_client = httpx.AsyncClient(
        transport=transport,
        base_url="http://example.com/",
        timeout=20.0,
    )
    return AuthClient("http://example.com", client=async_client)


def _nonce_payload() -> dict:
    return {
        "nonce": "nonce-1",
        "siwe": {
            "domain": "example.com",
            "uri": "https://example.com",
            "chain_id": 1,
            "statement": "Sign in",
            "expiration": "2025-01-01T00:00:00Z",
            "issued_at": "2024-01-01T00:00:00Z",
        },
    }


def test_build_siwe_message_format():
    template = SiweTemplate(
        domain="example.com",
        uri="https://example.com",
        chain_id=1,
        statement="Sign in",
        expiration="2025-01-01T00:00:00Z",
        issued_at="2024-01-01T00:00:00Z",
    )
    message = build_siwe_message(template, "0xabc", "nonce-1")
    assert (
        message == "example.com wants you to sign in with your Ethereum account:\n"
        "0xabc\n\n"
        "Sign in\n\n"
        "URI: https://example.com\n"
        "Version: 1\n"
        "Chain ID: 1\n"
        "Nonce: nonce-1\n"
        "Issued At: 2024-01-01T00:00:00Z\n"
        "Expiration Time: 2025-01-01T00:00:00Z"
    )


def test_siwe_template_accepts_camel_case():
    payload = {
        "domain": "example.com",
        "uri": "https://example.com",
        "chainId": 1,
        "statement": "Sign in",
        "expiration": "2025-01-01T00:00:00Z",
        "issuedAt": "2024-01-01T00:00:00Z",
    }
    template = SiweTemplate.from_payload(payload)
    assert template.chain_id == 1
    assert template.issued_at == "2024-01-01T00:00:00Z"


def test_auth_nonce_response_from_payload():
    response = AuthNonceResponse.from_payload(_nonce_payload())
    assert response.nonce == "nonce-1"
    assert response.siwe.domain == "example.com"


@pytest.mark.asyncio
async def test_auth_client_invalid_json_raises_decode_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not-json")

    client = _auth_client(handler)
    try:
        with pytest.raises(AuthDecodeError):
            await client.get_nonce("0xabc")
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_auth_client_status_error_from_payload():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    client = _auth_client(handler)
    try:
        with pytest.raises(AuthStatusError) as err:
            await client.get_nonce("0xabc")
        assert err.value.status_code == 401
        assert "unauthorized" in str(err.value)
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_auth_client_status_error_from_text():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="server down")

    client = _auth_client(handler)
    try:
        with pytest.raises(AuthStatusError) as err:
            await client.get_nonce("0xabc")
        assert err.value.status_code == 500
        assert "server down" in str(err.value)
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_auth_client_transport_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    client = _auth_client(handler)
    try:
        with pytest.raises(AuthTransportError):
            await client.get_nonce("0xabc")
    finally:
        await client.aclose()
