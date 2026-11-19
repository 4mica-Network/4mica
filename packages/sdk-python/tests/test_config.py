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


def test_disable_auth_runs_unauthenticated():
    cfg = ConfigBuilder().wallet_private_key(KEY).disable_auth().build()
    assert cfg.auth is None
    assert cfg.bearer_token is None


def test_bearer_token_replaces_siwe():
    cfg = ConfigBuilder().wallet_private_key(KEY).bearer_token("token").build()
    assert cfg.bearer_token == "token"
    assert cfg.auth is None


def test_network_shorthand_and_caip2():
    cfg = ConfigBuilder().network("base").wallet_private_key(KEY).build()
    assert cfg.rpc_url == "https://base.api.4mica.io/"
    cfg = ConfigBuilder().network("eip155:8453").wallet_private_key(KEY).build()
    assert cfg.rpc_url == "https://base.api.4mica.io/"
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
    assert cfg.rpc_url == "https://base.sepolia.api.4mica.io/"


def test_from_env_reads_fourmica_variables(monkeypatch):
    monkeypatch.setenv("FOURMICA_NETWORK", "base")
    monkeypatch.setenv("FOURMICA_WALLET_PRIVATE_KEY", KEY)
    monkeypatch.setenv("FOURMICA_FACILITATOR_URL", "https://facilitator.example/")
    cfg = ConfigBuilder().from_env().build()
    assert cfg.rpc_url == "https://base.api.4mica.io/"
    assert cfg.wallet_private_key == KEY
    assert cfg.facilitator_url == "https://facilitator.example/"


def test_from_env_takes_a_mapping_instead_of_the_process_environment(monkeypatch):
    monkeypatch.setenv("FOURMICA_NETWORK", "base")
    env = {"FOURMICA_RPC_URL": "https://env.example/", "4MICA_WALLET_PRIVATE_KEY": KEY}
    cfg = ConfigBuilder().from_env(env).build()
    assert cfg.rpc_url == "https://env.example/"


def test_both_prefixes_may_agree_but_not_differ():
    env = {
        "FOURMICA_WALLET_PRIVATE_KEY": KEY,
        "4MICA_WALLET_PRIVATE_KEY": KEY,
        "FOURMICA_NETWORK": "base",
        "4MICA_NETWORK": "base",
    }
    assert ConfigBuilder().from_env(env).build().rpc_url == "https://base.api.4mica.io/"
    env["4MICA_NETWORK"] = "base-sepolia"
    with pytest.raises(ConfigError, match="FOURMICA_NETWORK and 4MICA_NETWORK"):
        ConfigBuilder().from_env(env)


def test_an_empty_variable_counts_as_unset():
    env = {"FOURMICA_NETWORK": "", "4MICA_NETWORK": "base", "FOURMICA_RPC_URL": ""}
    cfg = ConfigBuilder().wallet_private_key(KEY).from_env(env).build()
    assert cfg.rpc_url == "https://base.api.4mica.io/"


def test_network_brings_its_hosted_facilitator():
    cfg = ConfigBuilder().network("base-sepolia").wallet_private_key(KEY).build()
    assert cfg.facilitator_url == "https://testnet.payment.4mica.io/"
    # No facilitator is hosted for this one.
    cfg = ConfigBuilder().network("ethereum-sepolia").wallet_private_key(KEY).build()
    assert cfg.facilitator_url is None


def test_an_explicit_facilitator_wins_in_either_order():
    for build in (
        lambda b: b.network("base-sepolia").facilitator_url("https://mine.example/"),
        lambda b: b.facilitator_url("https://mine.example/").network("base-sepolia"),
    ):
        cfg = build(ConfigBuilder().wallet_private_key(KEY)).build()
        assert cfg.facilitator_url == "https://mine.example/"


def test_rpc_url_drops_the_hosted_facilitator():
    cfg = (
        ConfigBuilder()
        .network("base-sepolia")
        .rpc_url("https://self-hosted.example/")
        .wallet_private_key(KEY)
        .build()
    )
    assert cfg.facilitator_url is None


def test_secrets_stay_out_of_repr():
    cfg = ConfigBuilder().wallet_private_key(KEY).bearer_token("s3cret").build()
    shown = repr(cfg)
    assert KEY not in shown and KEY[2:] not in shown
    assert "s3cret" not in shown
    assert cfg.rpc_url in shown
