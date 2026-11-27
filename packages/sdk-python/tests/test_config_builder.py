import pytest
from stubs import TEST_ADDRESS, TEST_PRIVATE_KEY

from fourmica_sdk.config import DEFAULT_RPC_URL, ConfigBuilder, read_env
from fourmica_sdk.errors import ConfigError
from fourmica_sdk.signing import LocalAccountSigner

CONTRACT = "0x00000000000000000000000000000000c04e4a1c"
CONTRACT_CHECKSUM = "0x00000000000000000000000000000000C04E4a1c"


def builder() -> ConfigBuilder:
    return ConfigBuilder().wallet_private_key(TEST_PRIVATE_KEY)


def test_read_env_prefers_the_new_prefix_and_falls_back_to_the_legacy_one():
    assert read_env({"FOURMICA_X": "a"}, "X") == "a"
    assert read_env({"4MICA_X": "b"}, "X") == "b"
    assert read_env({"FOURMICA_X": "a", "4MICA_X": "a"}, "X") == "a"
    assert read_env({}, "X") is None
    assert read_env({"FOURMICA_X": "", "4MICA_X": ""}, "X") is None


def test_read_env_refuses_two_prefixes_that_disagree():
    with pytest.raises(ConfigError, match="FOURMICA_X and 4MICA_X"):
        read_env({"FOURMICA_X": "a", "4MICA_X": "b"}, "X")


def test_contract_address_is_checksummed():
    cfg = builder().contract_address(CONTRACT).build()
    assert cfg.contract_address == CONTRACT_CHECKSUM


def test_a_malformed_contract_address_is_a_config_error():
    with pytest.raises(ConfigError, match="invalid address"):
        builder().contract_address("0x1234").build()


def test_an_explicit_ethereum_endpoint_is_kept_and_a_malformed_one_refused():
    cfg = builder().ethereum_http_rpc_url("http://localhost:8545/").build()
    assert cfg.ethereum_http_rpc_url == "http://localhost:8545/"
    with pytest.raises(ConfigError, match="invalid URL"):
        builder().ethereum_http_rpc_url("localhost:8545").build()


def test_the_private_key_is_normalised_to_lowercase_with_a_prefix():
    raw = TEST_PRIVATE_KEY.removeprefix("0x").upper()
    cfg = ConfigBuilder().wallet_private_key(raw).build()
    assert cfg.wallet_private_key == TEST_PRIVATE_KEY


@pytest.mark.parametrize(
    "key", ["0x1234", "0x" + "zz" * 32, "0x" + "ab" * 33, TEST_PRIVATE_KEY + " "]
)
def test_a_malformed_private_key_is_a_config_error(key):
    with pytest.raises(ConfigError, match="invalid private key"):
        ConfigBuilder().wallet_private_key(key).build()


def test_an_evm_signer_alone_is_enough_to_build():
    signer = LocalAccountSigner(TEST_PRIVATE_KEY)
    cfg = ConfigBuilder().evm_signer(signer).build()
    assert cfg.evm_signer is signer
    assert cfg.wallet_private_key is None
    assert signer.address == TEST_ADDRESS


def test_an_empty_rpc_url_is_reported_as_missing():
    with pytest.raises(ConfigError, match="missing rpc_url"):
        builder().rpc_url("").build()


def test_the_missing_signer_is_reported_before_the_missing_rpc_url():
    with pytest.raises(ConfigError, match="wallet_private_key or evm_signer"):
        ConfigBuilder().rpc_url("").build()


def test_enable_auth_turns_siwe_back_on_after_disable_auth():
    cfg = builder().disable_auth().enable_auth().build()
    assert cfg.auth is not None
    assert cfg.auth.auth_url == DEFAULT_RPC_URL


def test_a_bearer_token_wins_even_when_auth_is_enabled_explicitly():
    cfg = builder().enable_auth().bearer_token("t").build()
    assert cfg.auth is None
    assert cfg.bearer_token == "t"


def test_auth_url_overrides_the_rpc_url_for_siwe():
    cfg = builder().auth_url("https://auth.example/").build()
    assert cfg.auth is not None
    assert cfg.auth.auth_url == "https://auth.example/"
    assert cfg.rpc_url == DEFAULT_RPC_URL


def test_a_malformed_auth_url_is_a_config_error():
    with pytest.raises(ConfigError, match="invalid URL"):
        builder().auth_url("auth.example").build()


def test_a_malformed_auth_url_is_ignored_when_auth_is_disabled():
    cfg = builder().auth_url("auth.example").disable_auth().build()
    assert cfg.auth is None


@pytest.mark.parametrize(
    ("value", "expected"),
    [(0, 0), (1, 1), (3600, 3600), (10**12, 10**12), ("45", 45), (" 7 ", 7)],
)
def test_the_refresh_margin_accepts_non_negative_integers(value, expected):
    cfg = builder().auth_refresh_margin_secs(value).build()
    assert cfg.auth is not None
    assert cfg.auth.refresh_margin_secs == expected


def test_a_none_refresh_margin_falls_back_to_sixty_seconds():
    cfg = builder().auth_refresh_margin_secs(None).build()
    assert cfg.auth is not None
    assert cfg.auth.refresh_margin_secs == 60


@pytest.mark.parametrize("value", [-1, "-5", -(2**64)])
def test_a_negative_refresh_margin_is_refused(value):
    with pytest.raises(ConfigError, match="cannot be negative"):
        builder().auth_refresh_margin_secs(value).build()


@pytest.mark.parametrize("value", ["abc", "", "1.5", 1.5, "0x10", "  "])
def test_a_non_integer_refresh_margin_is_refused(value):
    with pytest.raises(ConfigError, match="invalid auth_refresh_margin_secs"):
        builder().auth_refresh_margin_secs(value).build()


def test_an_invalid_refresh_margin_is_not_checked_under_a_bearer_token():
    cfg = builder().auth_refresh_margin_secs("abc").bearer_token("t").build()
    assert cfg.auth is None


def test_from_env_reads_every_documented_variable():
    env = {
        "FOURMICA_RPC_URL": "https://core.example/",
        "FOURMICA_WALLET_PRIVATE_KEY": TEST_PRIVATE_KEY,
        "FOURMICA_ETHEREUM_HTTP_RPC_URL": "http://localhost:8545/",
        "FOURMICA_CONTRACT_ADDRESS": CONTRACT,
        "FOURMICA_FACILITATOR_URL": "https://facilitator.example/",
        "FOURMICA_AUTH_URL": "https://auth.example/",
        "FOURMICA_AUTH_REFRESH_MARGIN_SECS": "120",
    }
    cfg = ConfigBuilder().from_env(env).build()
    assert cfg.rpc_url == "https://core.example/"
    assert cfg.wallet_private_key == TEST_PRIVATE_KEY
    assert cfg.ethereum_http_rpc_url == "http://localhost:8545/"
    assert cfg.contract_address == CONTRACT_CHECKSUM
    assert cfg.facilitator_url == "https://facilitator.example/"
    assert cfg.auth is not None
    assert cfg.auth.auth_url == "https://auth.example/"
    assert cfg.auth.refresh_margin_secs == 120


def test_from_env_reads_the_bearer_token():
    env = {"4MICA_WALLET_PRIVATE_KEY": TEST_PRIVATE_KEY, "4MICA_BEARER_TOKEN": "tok"}
    cfg = ConfigBuilder().from_env(env).build()
    assert cfg.bearer_token == "tok"
    assert cfg.auth is None


def test_an_auth_url_in_the_environment_re_enables_auth():
    env = {"FOURMICA_AUTH_URL": "https://auth.example/"}
    cfg = builder().disable_auth().from_env(env).build()
    assert cfg.auth is not None
    assert cfg.auth.auth_url == "https://auth.example/"


def test_a_refresh_margin_in_the_environment_re_enables_auth():
    env = {"FOURMICA_AUTH_REFRESH_MARGIN_SECS": "5"}
    cfg = builder().disable_auth().from_env(env).build()
    assert cfg.auth is not None
    assert cfg.auth.refresh_margin_secs == 5


def test_a_malformed_refresh_margin_in_the_environment_fails_at_build():
    builder_with_env = builder().from_env({"FOURMICA_AUTH_REFRESH_MARGIN_SECS": "x"})
    with pytest.raises(ConfigError, match="invalid auth_refresh_margin_secs"):
        builder_with_env.build()


def test_an_empty_environment_leaves_explicit_settings_alone():
    cfg = (
        builder()
        .rpc_url("https://mine.example/")
        .facilitator_url("https://facilitator.example/")
        .disable_auth()
        .from_env({})
        .build()
    )
    assert cfg.rpc_url == "https://mine.example/"
    assert cfg.facilitator_url == "https://facilitator.example/"
    assert cfg.auth is None


def test_from_env_with_no_mapping_reads_the_process_environment(monkeypatch):
    for name in ("NETWORK", "RPC_URL", "AUTH_URL", "AUTH_REFRESH_MARGIN_SECS"):
        monkeypatch.delenv("FOURMICA_" + name, raising=False)
        monkeypatch.delenv("4MICA_" + name, raising=False)
    monkeypatch.setenv("FOURMICA_BEARER_TOKEN", "from-process")
    cfg = builder().from_env().build()
    assert cfg.bearer_token == "from-process"


def test_an_unknown_network_in_the_environment_is_a_config_error():
    with pytest.raises(ConfigError, match='unknown network "mars"'):
        ConfigBuilder().from_env({"FOURMICA_NETWORK": "mars"})


def test_network_after_rpc_url_replaces_it():
    cfg = builder().rpc_url("https://mine.example/").network("base").build()
    assert cfg.rpc_url == "https://base.api.4mica.io/"
