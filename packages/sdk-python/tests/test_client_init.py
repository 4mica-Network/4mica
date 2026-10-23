import pytest
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    CONTRACT_ADDRESS,
    GUARANTEE_REGISTRY_ADDRESS,
    OPERATOR_ADDRESS,
    TEST_PRIVATE_KEY,
)

import fourmica_sdk.client.ctx as ctx_module
from fourmica_sdk.client.ctx import ClientCtx
from fourmica_sdk.config import ConfigBuilder
from fourmica_sdk.errors import ChainRpcUnavailableError, ClientInitializationError
from fourmica_sdk.guarantee import (
    clearing_house_domain_separator,
    guarantee_registry_domain_separator,
)

PARAMS = {
    "guarantee_signer": OPERATOR_ADDRESS,
    "contract_address": CONTRACT_ADDRESS,
    "guarantee_registry_address": GUARANTEE_REGISTRY_ADDRESS,
    "clearing_house_address": CLEARING_HOUSE_ADDRESS,
    "eip712_name": "4micaClearingHouse",
    "eip712_version": "1",
    "chain_id": 84532,
    "supported_payment_payload_versions": [1],
}


class FakeProxy:
    def __init__(self, params_raw):
        self.params_raw = params_raw
        self.calls = []
        self.closed = False

    def with_token_provider(self, provider):
        self.calls.append("with_token_provider")
        return self

    def with_bearer_token(self, token):
        self.calls.append("with_bearer_token")
        return self

    async def get_public_params(self):
        from fourmica_sdk.models import CorePublicParameters

        self.calls.append("get_public_params")
        if isinstance(self.params_raw, Exception):
            raise self.params_raw
        return CorePublicParameters.from_rpc(self.params_raw)

    async def aclose(self):
        self.closed = True


def config():
    return (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .build()
    )


def use_params(monkeypatch, params_raw):
    proxy = FakeProxy(params_raw)
    monkeypatch.setattr(ctx_module, "RpcProxy", lambda url: proxy)
    return proxy


async def test_connect_resolves_the_signing_domains_from_core(monkeypatch):
    use_params(monkeypatch, PARAMS)
    ctx = await ClientCtx.create(config())
    assert ctx.clearing_house_domain_separator == clearing_house_domain_separator(
        84532, CLEARING_HOUSE_ADDRESS
    )
    assert ctx.guarantee_domain_separator == guarantee_registry_domain_separator(
        84532, GUARANTEE_REGISTRY_ADDRESS
    )
    assert ctx.guarantee_signer == OPERATOR_ADDRESS
    assert ctx.contract_address == CONTRACT_ADDRESS
    assert ctx.chain_id == 84532


async def test_connect_needs_no_ethereum_endpoint(monkeypatch):
    """Everything resolved at connect comes from core, so constructing a
    client costs no chain access at all."""
    use_params(monkeypatch, PARAMS)
    ctx = await ClientCtx.create(config())
    assert ctx.ethereum_http_rpc_url is None
    assert ctx._gateway is None


async def test_connect_fails_fast_when_core_cannot_take_v1(monkeypatch):
    use_params(monkeypatch, dict(PARAMS, supported_payment_payload_versions=[2]))
    with pytest.raises(ClientInitializationError, match="signs payment payload v1"):
        await ClientCtx.create(config())


async def test_a_core_that_accepts_no_payload_version_is_refused(monkeypatch):
    use_params(monkeypatch, dict(PARAMS, supported_payment_payload_versions=[]))
    with pytest.raises(ClientInitializationError, match="core accepts \\[\\]"):
        await ClientCtx.create(config())


async def test_a_core_that_predates_payload_versions_is_accepted(monkeypatch):
    params = dict(PARAMS)
    del params["supported_payment_payload_versions"]
    use_params(monkeypatch, params)
    await ClientCtx.create(config())


@pytest.mark.parametrize(
    "field,label",
    [
        ("clearing_house_address", "clearing house address"),
        ("guarantee_registry_address", "guarantee registry address"),
        ("guarantee_signer", "guarantee signer"),
    ],
)
async def test_a_core_missing_a_signing_address_is_refused(monkeypatch, field, label):
    """Every payment is signed or verified against these, so a core that
    omits one is refused at connect rather than at the first payment."""
    params = dict(PARAMS)
    del params[field]
    proxy = use_params(monkeypatch, params)
    with pytest.raises(ClientInitializationError, match=label):
        await ClientCtx.create(config())
    assert proxy.closed


async def test_gateway_needs_an_ethereum_endpoint(monkeypatch):
    use_params(monkeypatch, PARAMS)
    ctx = await ClientCtx.create(config())
    assert ctx.ethereum_http_rpc_url is None
    with pytest.raises(ChainRpcUnavailableError):
        await ctx.gateway()


async def test_connect_stays_unauthenticated_until_params_resolve(monkeypatch):
    proxy = use_params(monkeypatch, PARAMS)
    await ClientCtx.create(config())
    assert proxy.calls == ["get_public_params", "with_token_provider"]


async def test_failed_connect_closes_the_proxy(monkeypatch):
    proxy = use_params(monkeypatch, RuntimeError("core is down"))
    with pytest.raises(RuntimeError, match="core is down"):
        await ClientCtx.create(config())
    assert proxy.closed
    assert "with_token_provider" not in proxy.calls


async def test_disabled_auth_attaches_no_credentials(monkeypatch):
    proxy = use_params(monkeypatch, PARAMS)
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .disable_auth()
        .build()
    )
    ctx = await ClientCtx.create(cfg)
    assert ctx.auth_session is None
    assert proxy.calls == ["get_public_params"]


async def test_config_ethereum_url_wins_over_core(monkeypatch):
    use_params(
        monkeypatch, dict(PARAMS, ethereum_http_rpc_url="https://core-advertised/")
    )
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .ethereum_http_rpc_url("https://explicit/")
        .build()
    )
    ctx = await ClientCtx.create(cfg)
    assert ctx.ethereum_http_rpc_url == "https://explicit/"
