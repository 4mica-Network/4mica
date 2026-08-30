import pytest

from fourmica_sdk.config import ConfigBuilder
from fourmica_sdk.errors import ConfigError


def test_config_builder_reads_from_env(monkeypatch):
    monkeypatch.setenv("4MICA_RPC_URL", "https://example.com")
    monkeypatch.setenv("4MICA_WALLET_PRIVATE_KEY", "11" * 32)
    cfg = ConfigBuilder().from_env().build()
    assert cfg.rpc_url == "https://example.com"
    assert cfg.wallet_private_key.startswith("0x11")


def test_config_builder_resolves_base_network():
    by_name = ConfigBuilder().network("base").wallet_private_key("11" * 32).build()
    by_caip2 = (
        ConfigBuilder().network("eip155:8453").wallet_private_key("11" * 32).build()
    )

    assert by_name.rpc_url == "https://base.api.4mica.xyz/"
    assert by_caip2.rpc_url == "https://base.api.4mica.xyz/"


def test_config_builder_network_env_takes_precedence(monkeypatch):
    monkeypatch.setenv("4MICA_NETWORK", "base")
    monkeypatch.setenv("4MICA_RPC_URL", "https://example.com")
    monkeypatch.setenv("4MICA_WALLET_PRIVATE_KEY", "11" * 32)

    cfg = ConfigBuilder().from_env().build()

    assert cfg.rpc_url == "https://base.api.4mica.xyz/"


def test_config_builder_requires_private_key(monkeypatch):
    monkeypatch.delenv("4MICA_WALLET_PRIVATE_KEY", raising=False)
    builder = ConfigBuilder().from_env()
    with pytest.raises(ConfigError):
        builder.build()


def test_config_builder_rejects_invalid_private_key():
    builder = ConfigBuilder().wallet_private_key("0x1234")
    with pytest.raises(ConfigError):
        builder.build()


def test_config_builder_auth_defaults_to_rpc_url():
    cfg = (
        ConfigBuilder()
        .rpc_url("https://example.com")
        .wallet_private_key("11" * 32)
        .enable_auth()
        .build()
    )
    assert cfg.auth is not None
    assert cfg.auth.auth_url == "https://example.com"
    assert cfg.auth.refresh_margin_secs == 60


def test_config_builder_reads_auth_env(monkeypatch):
    monkeypatch.setenv("4MICA_RPC_URL", "https://example.com")
    monkeypatch.setenv("4MICA_WALLET_PRIVATE_KEY", "11" * 32)
    monkeypatch.setenv("4MICA_BEARER_TOKEN", "token")
    monkeypatch.setenv("4MICA_AUTH_URL", "https://auth.example.com")
    monkeypatch.setenv("4MICA_AUTH_REFRESH_MARGIN_SECS", "120")
    cfg = ConfigBuilder().from_env().build()
    assert cfg.bearer_token == "token"
    assert cfg.auth is not None
    assert cfg.auth.auth_url == "https://auth.example.com"
    assert cfg.auth.refresh_margin_secs == 120


def test_config_builder_reads_bearer_token_from_env(monkeypatch):
    monkeypatch.setenv("4MICA_RPC_URL", "https://example.com")
    monkeypatch.setenv("4MICA_WALLET_PRIVATE_KEY", "11" * 32)
    monkeypatch.setenv("4MICA_BEARER_TOKEN", "my-static-token")
    monkeypatch.delenv("4MICA_AUTH_URL", raising=False)
    cfg = ConfigBuilder().from_env().build()
    assert cfg.bearer_token == "my-static-token"
