import pytest

from fourmica_sdk.config import DEFAULT_RPC_URL, ConfigBuilder
from fourmica_sdk.errors import ConfigError

KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"


def test_defaults_enable_siwe_auth():
    cfg = ConfigBuilder().wallet_private_key(KEY).build()
    assert cfg.rpc_url == DEFAULT_RPC_URL
    assert cfg.auth is not None
    assert cfg.auth.auth_url == DEFAULT_RPC_URL
    assert cfg.auth.refresh_margin_secs == 60
    assert cfg.facilitator_url is None


def test_bearer_token_replaces_siwe():
    cfg = ConfigBuilder().wallet_private_key(KEY).bearer_token("token").build()
    assert cfg.bearer_token == "token"
    assert cfg.auth is None


def test_network_shorthand_and_caip2():
    cfg = ConfigBuilder().network("base").wallet_private_key(KEY).build()
    assert cfg.rpc_url == "https://base.api.4mica.xyz/"
    cfg = ConfigBuilder().network("eip155:8453").wallet_private_key(KEY).build()
    assert cfg.rpc_url == "https://base.api.4mica.xyz/"
    with pytest.raises(ConfigError, match="unknown network"):
        ConfigBuilder().network("solana")


def test_missing_signer_is_rejected():
    with pytest.raises(ConfigError, match="wallet_private_key"):
        ConfigBuilder().build()


def test_invalid_urls_are_rejected():
    with pytest.raises(ConfigError):
        ConfigBuilder().rpc_url("not-a-url").wallet_private_key(KEY).build()
    with pytest.raises(ConfigError):
        (ConfigBuilder().wallet_private_key(KEY).facilitator_url("not-a-url").build())


def test_from_env_reads_facilitator_url(monkeypatch):
    monkeypatch.setenv("4MICA_RPC_URL", "https://env.example/")
    monkeypatch.setenv("4MICA_WALLET_PRIVATE_KEY", KEY)
    monkeypatch.setenv("4MICA_FACILITATOR_URL", "https://facilitator.example/")
    cfg = ConfigBuilder().from_env().build()
    assert cfg.rpc_url == "https://env.example/"
    assert cfg.facilitator_url == "https://facilitator.example/"


def test_from_env_network_takes_precedence(monkeypatch):
    monkeypatch.setenv("4MICA_NETWORK", "base-sepolia")
    monkeypatch.setenv("4MICA_RPC_URL", "https://env.example/")
    monkeypatch.setenv("4MICA_WALLET_PRIVATE_KEY", KEY)
    cfg = ConfigBuilder().from_env().build()
    assert cfg.rpc_url == "https://base.sepolia.api.4mica.xyz/"
