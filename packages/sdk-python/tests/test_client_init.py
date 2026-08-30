import pytest
from conftest import CONTRACT_ADDRESS, TEST_PRIVATE_KEY

import fourmica_sdk.client.ctx as ctx_module
from fourmica_sdk.client.ctx import ClientCtx
from fourmica_sdk.config import ConfigBuilder
from fourmica_sdk.errors import ChainRpcUnavailableError, ClientInitializationError

PARAMS = {
    "public_key": "0x" + "00" * 48,
    "contract_address": CONTRACT_ADDRESS,
    "eip712_name": "4mica",
    "eip712_version": "1",
    "chain_id": 84532,
    "supported_guarantee_versions": [1],
    "guarantee_domains": [{"version": 1, "domain_separator": "0x" + "11" * 32}],
}


class FakeProxy:
    def __init__(self, params_raw):
        self.params_raw = params_raw

    def with_token_provider(self, provider):
        return self

    def with_bearer_token(self, token):
        return self

    async def get_public_params(self):
        from fourmica_sdk.models import CorePublicParameters

        return CorePublicParameters.from_rpc(self.params_raw)

    async def aclose(self):
        pass


def config():
    return (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .build()
    )


def use_params(monkeypatch, params_raw):
    monkeypatch.setattr(ctx_module, "RpcProxy", lambda url: FakeProxy(params_raw))


async def test_connect_resolves_published_guarantee_domains(monkeypatch):
    use_params(monkeypatch, PARAMS)
    ctx = await ClientCtx.create(config())
    assert ctx.guarantee_domain == b"\x11" * 32
    assert ctx.guarantee_domain_for_version(1) == b"\x11" * 32
    assert ctx.contract_address == CONTRACT_ADDRESS
    assert ctx.chain_id == 84532


async def test_connect_fails_fast_when_core_cannot_take_v1(monkeypatch):
    use_params(monkeypatch, dict(PARAMS, supported_guarantee_versions=[2]))
    with pytest.raises(ClientInitializationError, match="signs guarantee v1"):
        await ClientCtx.create(config())


async def test_connect_rejects_bad_operator_key(monkeypatch):
    use_params(monkeypatch, dict(PARAMS, public_key="0x0102"))
    with pytest.raises(ClientInitializationError, match="operator public key"):
        await ClientCtx.create(config())


async def test_missing_published_domains_without_eth_rpc_is_unavailable(monkeypatch):
    use_params(monkeypatch, dict(PARAMS, guarantee_domains=[]))
    with pytest.raises(ChainRpcUnavailableError):
        await ClientCtx.create(config())


async def test_gateway_needs_an_ethereum_endpoint(monkeypatch):
    use_params(monkeypatch, PARAMS)
    ctx = await ClientCtx.create(config())
    assert ctx.ethereum_http_rpc_url is None
    with pytest.raises(ChainRpcUnavailableError):
        await ctx.gateway()


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
