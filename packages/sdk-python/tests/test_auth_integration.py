import os

import pytest
from eth_account import Account

from fourmica_sdk import AuthClient, AuthSession, Client, ConfigBuilder
from fourmica_sdk.errors import RpcError

pytestmark = pytest.mark.integration

DEFAULT_RPC_URL = "http://127.0.0.1:3000"
DEFAULT_AUTH_URL = "http://127.0.0.1:3000"
DEFAULT_PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.skip(f"missing env {name}")
    return value


def _required_private_key() -> str:
    value = os.getenv("PAYER_KEY") or os.getenv("4MICA_WALLET_PRIVATE_KEY")
    if not value:
        pytest.skip("missing env PAYER_KEY or 4MICA_WALLET_PRIVATE_KEY")
    return value


async def _resolve_bearer_token(auth_url: str, private_key: str) -> str:
    token = os.getenv("4MICA_BEARER_TOKEN")
    if token:
        return token
    session = AuthSession(AuthClient(auth_url), private_key)
    try:
        tokens = await session.login()
        return tokens.access_token
    finally:
        await session.aclose()


@pytest.mark.asyncio
async def test_auth_login_allows_core_request(monkeypatch):
    monkeypatch.setenv("4MICA_RPC_URL", DEFAULT_RPC_URL)
    monkeypatch.setenv("4MICA_AUTH_URL", DEFAULT_AUTH_URL)
    monkeypatch.setenv("PAYER_KEY", DEFAULT_PAYER_KEY)
    rpc_url = _required_env("4MICA_RPC_URL")
    private_key = _required_private_key()

    cfg = (
        ConfigBuilder()
        .from_env()
        .rpc_url(rpc_url)
        .wallet_private_key(private_key)
        .enable_auth()
        .build()
    )

    client = await Client.new(cfg)
    try:
        tokens = await client.login()
        assert tokens.access_token
        assert tokens.refresh_token
        user_address = Account.from_key(private_key).address
        asset = os.getenv("ASSET_ADDRESS", "0x0000000000000000000000000000000000000000")
        try:
            await client.rpc.get_user_asset_balance(user_address, asset)
        except RpcError as exc:
            if exc.status_code == 401:
                raise
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_bearer_token_allows_core_request(monkeypatch):
    monkeypatch.setenv("4MICA_RPC_URL", DEFAULT_RPC_URL)
    monkeypatch.setenv("4MICA_AUTH_URL", DEFAULT_AUTH_URL)
    monkeypatch.setenv("PAYER_KEY", DEFAULT_PAYER_KEY)
    rpc_url = _required_env("4MICA_RPC_URL")
    auth_url = os.getenv("4MICA_AUTH_URL") or rpc_url
    private_key = _required_private_key()
    bearer_token = await _resolve_bearer_token(auth_url, private_key)

    cfg = (
        ConfigBuilder()
        .from_env()
        .rpc_url(rpc_url)
        .wallet_private_key(private_key)
        .bearer_token(bearer_token)
        .build()
    )

    client = await Client.new(cfg)
    try:
        user_address = Account.from_key(private_key).address
        asset = os.getenv("ASSET_ADDRESS", "0x0000000000000000000000000000000000000000")
        try:
            await client.rpc.get_user_asset_balance(user_address, asset)
        except RpcError as exc:
            if exc.status_code == 401:
                raise
    finally:
        await client.aclose()
