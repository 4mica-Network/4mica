import asyncio

import pytest

import fourmica_sdk.auth as auth_module
from fourmica_sdk import AuthNonceResponse, AuthSession, AuthTokens, SiweTemplate
from fourmica_sdk.errors import AuthConfigError, AuthStatusError


class FakeAuthClient:
    def __init__(
        self,
        verify_tokens,
        refresh_tokens=None,
        refresh_error=None,
        verify_delay: float = 0.0,
    ) -> None:
        self.verify_tokens = list(verify_tokens)
        self.refresh_tokens = list(refresh_tokens or [])
        self.refresh_error = refresh_error
        self.verify_delay = verify_delay
        self.verify_calls = 0
        self.refresh_calls = 0
        self.nonce_calls = 0
        self.last_message = None
        self.last_signature = None

    async def aclose(self) -> None:
        return None

    async def get_nonce(self, address: str) -> AuthNonceResponse:
        self.nonce_calls += 1
        return AuthNonceResponse(
            nonce="nonce-1",
            siwe=SiweTemplate(
                domain="example.com",
                uri="https://example.com",
                chain_id=1,
                statement="Sign in",
                expiration="2025-01-01T00:00:00Z",
                issued_at="2024-01-01T00:00:00Z",
            ),
        )

    async def verify(self, address: str, message: str, signature: str) -> AuthTokens:
        self.verify_calls += 1
        if self.verify_delay:
            await asyncio.sleep(self.verify_delay)
        self.last_message = message
        self.last_signature = signature
        assert signature.startswith("0x")
        idx = min(self.verify_calls - 1, len(self.verify_tokens) - 1)
        return self.verify_tokens[idx]

    async def refresh(self, refresh_token: str) -> AuthTokens:
        self.refresh_calls += 1
        if self.refresh_error:
            raise self.refresh_error
        idx = min(self.refresh_calls - 1, len(self.refresh_tokens) - 1)
        return self.refresh_tokens[idx]

    async def logout(self, refresh_token: str) -> None:
        return None


@pytest.mark.asyncio
async def test_auth_session_caches_token(monkeypatch):
    now = {"value": 1000.0}
    monkeypatch.setattr(auth_module.time, "time", lambda: now["value"])
    tokens = AuthTokens(
        access_token="access-1", refresh_token="refresh-1", expires_in=120
    )
    client = FakeAuthClient([tokens])
    session = AuthSession(client, "0x" + "11" * 32, refresh_margin_secs=60)

    token1 = await session.access_token()
    token2 = await session.access_token()

    assert token1 == "access-1"
    assert token2 == "access-1"
    assert client.verify_calls == 1
    assert client.refresh_calls == 0


@pytest.mark.asyncio
async def test_auth_session_refreshes_when_expiring(monkeypatch):
    now = {"value": 1000.0}
    monkeypatch.setattr(auth_module.time, "time", lambda: now["value"])
    initial_tokens = AuthTokens(
        access_token="access-1", refresh_token="refresh-1", expires_in=120
    )
    refreshed_tokens = AuthTokens(
        access_token="access-2", refresh_token="refresh-2", expires_in=120
    )
    client = FakeAuthClient([initial_tokens], refresh_tokens=[refreshed_tokens])
    session = AuthSession(client, "0x" + "11" * 32, refresh_margin_secs=60)

    await session.access_token()
    now["value"] = 1100.0
    token = await session.access_token()

    assert token == "access-2"
    assert client.refresh_calls == 1


@pytest.mark.asyncio
async def test_auth_session_refresh_falls_back_to_login(monkeypatch):
    now = {"value": 1000.0}
    monkeypatch.setattr(auth_module.time, "time", lambda: now["value"])
    initial_tokens = AuthTokens(
        access_token="access-1", refresh_token="refresh-1", expires_in=120
    )
    relogin_tokens = AuthTokens(
        access_token="access-2", refresh_token="refresh-2", expires_in=120
    )
    client = FakeAuthClient(
        [initial_tokens, relogin_tokens],
        refresh_error=AuthStatusError("401 unauthorized", status_code=401),
    )
    session = AuthSession(client, "0x" + "11" * 32, refresh_margin_secs=60)

    await session.access_token()
    now["value"] = 1100.0
    token = await session.access_token()

    assert token == "access-2"
    assert client.refresh_calls == 1
    assert client.verify_calls == 2


@pytest.mark.asyncio
async def test_auth_session_access_token_single_flight(monkeypatch):
    now = {"value": 1000.0}
    monkeypatch.setattr(auth_module.time, "time", lambda: now["value"])
    tokens = AuthTokens(
        access_token="access-1", refresh_token="refresh-1", expires_in=120
    )
    client = FakeAuthClient([tokens], verify_delay=0.05)
    session = AuthSession(client, "0x" + "11" * 32, refresh_margin_secs=60)

    results = await asyncio.gather(
        session.access_token(),
        session.access_token(),
        session.access_token(),
    )

    assert results == ["access-1", "access-1", "access-1"]
    assert client.verify_calls == 1
    assert client.nonce_calls == 1


def test_auth_session_rejects_invalid_private_key():
    client = FakeAuthClient([])
    with pytest.raises(AuthConfigError):
        AuthSession(client, "not-a-key")


def test_auth_session_rejects_negative_refresh_margin():
    client = FakeAuthClient([])
    with pytest.raises(AuthConfigError):
        AuthSession(client, "0x" + "11" * 32, refresh_margin_secs=-1)
