import asyncio
from typing import ClassVar

import pytest
from eth_utils import to_checksum_address
from stubs import (
    CONTRACT_ADDRESS,
    OPERATOR_PRIVATE_KEY,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    TOKEN_ADDRESS,
    FakeRpc,
    make_ctx,
    make_public_params,
)

import fourmica_sdk.client.ctx as ctx_module
from fourmica_sdk.client.ctx import ActiveCycle, ClientCtx
from fourmica_sdk.config import Config, ConfigBuilder
from fourmica_sdk.digest import core_domain_separator
from fourmica_sdk.errors import (
    ChainRpcUnavailableError,
    ClientError,
    ClientInitializationError,
    MissingTokenDomainSeparatorError,
)
from fourmica_sdk.models import (
    ActiveCycleResponse,
    CorePublicParameters,
    SupportedTokenInfo,
    SupportedTokensResponse,
)
from fourmica_sdk.signing import LocalAccountSigner

ASSET = "0x036cbd53842c5426634e7929541ec2318f3dcf7e"
OTHER_TOKEN = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a"
SEPARATOR = "0x" + "AB" * 32
CYCLE = "0x" + "11" * 32
NEXT_CYCLE = "0x" + "22" * 32


def cycle_response(
    cycle_id: str = CYCLE, period_end: int = 2**40, server_time: int = 0
) -> ActiveCycleResponse:
    return ActiveCycleResponse(
        cycle_id=cycle_id,
        cycle_id_text="text",
        asset_address=TOKEN_ADDRESS,
        period_start=1_700_000_000,
        period_end=period_end,
        server_time=server_time,
    )


class CountingRpc(FakeRpc):
    def __init__(self, cycles=(), tokens=None) -> None:
        super().__init__()
        self.cycles = list(cycles)
        self.tokens = tokens
        self.closed = False

    async def get_active_cycle(self, asset):
        self.calls.append(("active_cycle", asset))
        return self.cycles.pop(0)

    async def get_supported_tokens(self):
        self.calls.append(("supported_tokens",))
        await asyncio.sleep(0)
        return self.tokens

    async def aclose(self) -> None:
        self.closed = True


def tokens(*infos) -> SupportedTokensResponse:
    return SupportedTokensResponse(chain_id=84532, tokens=list(infos))


def info(address: str, separator) -> SupportedTokenInfo:
    return SupportedTokenInfo(
        symbol="T", address=address, decimals=6, domain_separator=separator
    )


def clock(monkeypatch, seconds: float) -> None:
    monkeypatch.setattr(ctx_module, "_local_now_ms", lambda: int(seconds * 1000))


def test_the_local_clock_is_in_milliseconds(monkeypatch):
    monkeypatch.setattr(ctx_module.time, "time", lambda: 1_700_000_000.1234)
    assert ctx_module._local_now_ms() == 1_700_000_000_123


def test_a_core_advertised_domain_separator_is_used_verbatim():
    params = make_public_params(core_domain_separator="0x" + "cd" * 32)
    ctx = make_ctx(public_params=params)
    assert ctx.core_domain_separator == bytes.fromhex("cd" * 32)


def test_without_an_advertised_separator_the_core_domain_is_derived():
    ctx = make_ctx()
    assert ctx.core_domain_separator == core_domain_separator(84532, CONTRACT_ADDRESS)


def test_the_signer_address_is_checksummed():
    assert make_ctx().signer_address == TEST_ADDRESS


async def test_an_active_cycle_is_cached_until_its_period_ends(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = CountingRpc(
        cycles=[cycle_response(period_end=1_010), cycle_response(NEXT_CYCLE)]
    )
    ctx = make_ctx(rpc=rpc)
    first = await ctx.active_cycle(ASSET)
    assert first == ActiveCycle(id=CYCLE, period_start=1_700_000_000, period_end=1_010)
    assert await ctx.active_cycle(ASSET.upper().replace("0X", "0x")) is first
    assert rpc.calls == [("active_cycle", TOKEN_ADDRESS)]
    clock(monkeypatch, 1_010)
    second = await ctx.active_cycle(ASSET)
    assert second.id == NEXT_CYCLE
    assert len(rpc.calls) == 2


async def test_an_active_cycle_read_syncs_the_clock_to_core(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = CountingRpc(cycles=[cycle_response(server_time=5_000)])
    ctx = make_ctx(rpc=rpc)
    await ctx.active_cycle(ASSET)
    assert ctx.core_now() == 5_000
    assert ctx.core_now_ms() == 5_000_000


async def test_forgetting_an_active_cycle_forces_a_fresh_read(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = CountingRpc(cycles=[cycle_response(), cycle_response(NEXT_CYCLE)])
    ctx = make_ctx(rpc=rpc)
    await ctx.active_cycle(ASSET)
    ctx.forget_active_cycle(ASSET)
    ctx.forget_active_cycle(OTHER_TOKEN)
    assert (await ctx.active_cycle(ASSET)).id == NEXT_CYCLE


def test_a_payment_cutoff_only_moves_forward():
    ctx = make_ctx()
    assert ctx.payment_cutoff(ASSET) is None
    ctx.record_payment_cutoff(ASSET, 100)
    ctx.record_payment_cutoff(TOKEN_ADDRESS, 50)
    assert ctx.payment_cutoff(ASSET) == 100
    ctx.record_payment_cutoff(ASSET, "200")
    assert ctx.payment_cutoff(TOKEN_ADDRESS) == 200
    assert ctx.payment_cutoff(OTHER_TOKEN) is None


def test_a_zero_cutoff_is_recorded_as_zero():
    ctx = make_ctx()
    ctx.record_payment_cutoff(ASSET, 0)
    assert ctx.payment_cutoff(ASSET) == 0


def test_a_missing_server_time_leaves_the_clock_alone(monkeypatch):
    clock(monkeypatch, 1_000)
    ctx = make_ctx()
    ctx.record_core_time(900)
    ctx.record_core_time(0)
    assert ctx.core_now() == 900


def test_core_time_behind_and_ahead_of_the_local_clock(monkeypatch):
    clock(monkeypatch, 1_000.5)
    ctx = make_ctx()
    ctx.record_core_time(990)
    assert ctx.core_now_ms() == 990_000
    ctx.record_core_time(2_000)
    assert ctx.core_now() == 2_000


def test_core_time_never_goes_below_zero(monkeypatch):
    clock(monkeypatch, 10)
    ctx = make_ctx()
    ctx._clock_offset_ms = -(10**9)
    assert ctx.core_now_ms() == 0
    assert ctx.core_now() == 0


class FakeContractGateway:
    instances: ClassVar[list["FakeContractGateway"]] = []

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.verified = 0
        self.closed = False
        FakeContractGateway.instances.append(self)

    async def verify_chain_id(self) -> None:
        await asyncio.sleep(0)
        self.verified += 1

    async def aclose(self) -> None:
        self.closed = True


@pytest.fixture
def fake_gateway_class(monkeypatch):
    FakeContractGateway.instances = []
    monkeypatch.setattr(ctx_module, "ContractGateway", FakeContractGateway)
    return FakeContractGateway


async def test_the_gateway_is_built_once_and_verified_against_the_chain(
    fake_gateway_class,
):
    ctx = make_ctx()
    first, second = await asyncio.gather(ctx.gateway(), ctx.gateway())
    assert first is second
    assert await ctx.gateway() is first
    assert len(fake_gateway_class.instances) == 1
    assert first.verified == 1
    assert first.kwargs == {
        "eth_rpc_url": "http://localhost:8545/",
        "private_key": TEST_PRIVATE_KEY,
        "contract_address": CONTRACT_ADDRESS,
        "chain_id": 84532,
    }


async def test_a_gateway_whose_chain_check_fails_is_not_cached(monkeypatch):
    attempts = []

    class Failing(FakeContractGateway):
        async def verify_chain_id(self) -> None:
            attempts.append(self)
            if len(attempts) == 1:
                raise ClientInitializationError("wrong chain")

    monkeypatch.setattr(ctx_module, "ContractGateway", Failing)
    ctx = make_ctx()
    with pytest.raises(ClientInitializationError, match="wrong chain"):
        await ctx.gateway()
    assert ctx._gateway is None
    assert await ctx.gateway() is attempts[1]


async def test_the_gateway_needs_a_local_private_key(fake_gateway_class):
    ctx = make_ctx()
    ctx.cfg = Config(rpc_url="https://core.example/", wallet_private_key=None)
    with pytest.raises(ClientError, match="local wallet_private_key"):
        await ctx.gateway()
    assert fake_gateway_class.instances == []


async def test_the_gateway_needs_an_ethereum_endpoint_before_a_key(
    fake_gateway_class,
):
    ctx = make_ctx()
    ctx.ethereum_http_rpc_url = None
    ctx.cfg = Config(rpc_url="https://core.example/", wallet_private_key=None)
    with pytest.raises(ChainRpcUnavailableError):
        await ctx.gateway()


async def test_a_token_domain_separator_is_read_once_and_normalised():
    rpc = CountingRpc(tokens=tokens(info(ASSET, SEPARATOR)))
    ctx = make_ctx(rpc=rpc)
    first = await ctx.token_domain_separator(TOKEN_ADDRESS)
    assert first == SEPARATOR.lower()
    assert await ctx.token_domain_separator(ASSET) == first
    assert rpc.calls == [("supported_tokens",)]


async def test_concurrent_domain_lookups_share_one_read():
    rpc = CountingRpc(tokens=tokens(info(ASSET, SEPARATOR)))
    ctx = make_ctx(rpc=rpc)
    results = await asyncio.gather(
        *(ctx.token_domain_separator(TOKEN_ADDRESS) for _ in range(5))
    )
    assert set(results) == {SEPARATOR.lower()}
    assert rpc.calls == [("supported_tokens",)]


async def test_one_read_caches_every_token_it_lists():
    other_separator = "0x" + "cd" * 32
    rpc = CountingRpc(
        tokens=tokens(info(OTHER_TOKEN, other_separator), info(ASSET, SEPARATOR))
    )
    ctx = make_ctx(rpc=rpc)
    await ctx.token_domain_separator(TOKEN_ADDRESS)
    assert await ctx.token_domain_separator(OTHER_TOKEN) == other_separator
    assert len(rpc.calls) == 1


@pytest.mark.parametrize(
    "entries",
    [
        [],
        [info(TOKEN_ADDRESS, None)],
        [info(TOKEN_ADDRESS, "")],
        [info(TOKEN_ADDRESS, "0x1234")],
        [info(TOKEN_ADDRESS, "0x" + "zz" * 32)],
        [info("0xnot-an-address", SEPARATOR)],
        [info(OTHER_TOKEN, SEPARATOR)],
    ],
    ids=[
        "empty",
        "null",
        "blank",
        "short",
        "non-hex",
        "bad-address",
        "other-token",
    ],
)
async def test_a_token_without_a_usable_separator_is_missing(entries):
    ctx = make_ctx(rpc=CountingRpc(tokens=tokens(*entries)))
    with pytest.raises(MissingTokenDomainSeparatorError) as raised:
        await ctx.token_domain_separator(ASSET)
    assert raised.value.token == TOKEN_ADDRESS


async def test_a_malformed_entry_does_not_hide_a_good_one():
    rpc = CountingRpc(
        tokens=tokens(info("0xbad", SEPARATOR), info(TOKEN_ADDRESS, SEPARATOR))
    )
    ctx = make_ctx(rpc=rpc)
    assert await ctx.token_domain_separator(TOKEN_ADDRESS) == SEPARATOR.lower()


async def test_a_missing_separator_is_looked_up_again_next_time():
    rpc = CountingRpc(tokens=tokens())
    ctx = make_ctx(rpc=rpc)
    with pytest.raises(MissingTokenDomainSeparatorError):
        await ctx.token_domain_separator(TOKEN_ADDRESS)
    rpc.tokens = tokens(info(TOKEN_ADDRESS, SEPARATOR))
    assert await ctx.token_domain_separator(TOKEN_ADDRESS) == SEPARATOR.lower()
    assert len(rpc.calls) == 2


async def test_a_malformed_token_address_argument_is_refused_before_any_read():
    rpc = CountingRpc(tokens=tokens(info(TOKEN_ADDRESS, SEPARATOR)))
    with pytest.raises(ValueError, match="invalid address"):
        await make_ctx(rpc=rpc).token_domain_separator("0x1234")
    assert rpc.calls == []


class FakeAuthSession:
    def __init__(self) -> None:
        self.events: list = []

    async def login(self):
        self.events.append("login")
        return "tokens"

    async def logout(self) -> None:
        self.events.append("logout")

    async def aclose(self) -> None:
        self.events.append("aclose")


async def test_login_without_auth_is_a_client_error():
    with pytest.raises(ClientError, match="auth is not configured"):
        await make_ctx().login()


async def test_login_and_logout_go_through_the_auth_session():
    ctx = make_ctx()
    session = FakeAuthSession()
    ctx.auth_session = session
    assert await ctx.login() == "tokens"
    await ctx.logout()
    assert session.events == ["login", "logout"]


async def test_logout_without_auth_does_nothing():
    await make_ctx().logout()


async def test_aclose_closes_everything_the_context_opened(fake_gateway_class):
    rpc = CountingRpc()
    ctx = make_ctx(rpc=rpc)
    session = FakeAuthSession()
    ctx.auth_session = session
    gateway = await ctx.gateway()
    await ctx.aclose()
    assert rpc.closed
    assert ctx.facilitator._client.is_closed
    assert session.events == ["aclose"]
    assert gateway.closed


async def test_aclose_without_auth_or_gateway_closes_rpc_and_facilitator():
    rpc = CountingRpc()
    ctx = make_ctx(rpc=rpc)
    await ctx.aclose()
    assert rpc.closed
    assert ctx.facilitator._client.is_closed


class ParamsProxy:
    def __init__(self, params) -> None:
        self.params = params
        self.closed = False
        self.bearer = None

    async def get_public_params(self):
        return self.params

    def with_token_provider(self, provider):
        return self

    def with_bearer_token(self, token):
        self.bearer = token
        return self

    async def aclose(self) -> None:
        self.closed = True


def use_proxy(monkeypatch, params: CorePublicParameters) -> ParamsProxy:
    proxy = ParamsProxy(params)
    monkeypatch.setattr(ctx_module, "RpcProxy", lambda url: proxy)
    return proxy


async def test_connect_with_only_an_evm_signer_uses_it(monkeypatch):
    use_proxy(monkeypatch, make_public_params())
    signer = LocalAccountSigner(OPERATOR_PRIVATE_KEY)
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .evm_signer(signer)
        .disable_auth()
        .build()
    )
    ctx = await ClientCtx.create(cfg)
    assert ctx.signer is signer
    assert ctx.auth_session is None


async def test_connect_with_neither_a_key_nor_a_signer_is_refused(monkeypatch):
    proxy = use_proxy(monkeypatch, make_public_params())
    cfg = Config(rpc_url="https://core.example/", wallet_private_key=None)
    with pytest.raises(ClientInitializationError, match="neither"):
        await ClientCtx.create(cfg)
    assert not proxy.closed


async def test_connect_with_a_bearer_token_attaches_it(monkeypatch):
    proxy = use_proxy(monkeypatch, make_public_params())
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .bearer_token("tok")
        .build()
    )
    ctx = await ClientCtx.create(cfg)
    assert proxy.bearer == "tok"
    assert ctx.auth_session is None


async def test_a_contract_address_in_config_wins_over_core(monkeypatch):
    use_proxy(monkeypatch, make_public_params())
    other = "0x" + "12" * 20
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .contract_address(other)
        .disable_auth()
        .build()
    )
    ctx = await ClientCtx.create(cfg)
    assert ctx.contract_address == "0x1212121212121212121212121212121212121212"


async def test_a_core_advertising_a_malformed_contract_address_is_refused_and_closed(
    monkeypatch,
):
    proxy = use_proxy(monkeypatch, make_public_params(contract_address="0x12"))
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .disable_auth()
        .build()
    )
    with pytest.raises(ValueError, match="invalid address"):
        await ClientCtx.create(cfg)
    assert proxy.closed


async def test_a_core_advertising_an_empty_ethereum_url_leaves_none(monkeypatch):
    use_proxy(monkeypatch, make_public_params(ethereum_http_rpc_url=""))
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .disable_auth()
        .build()
    )
    ctx = await ClientCtx.create(cfg)
    assert ctx.ethereum_http_rpc_url is None


@pytest.mark.parametrize(
    ("field", "label"),
    [
        ("clearing_house_address", "clearing house address"),
        ("guarantee_registry_address", "guarantee registry address"),
        ("guarantee_signer", "guarantee signer"),
    ],
)
def test_a_malformed_signing_address_is_named_in_the_error(field, label):
    params = make_public_params(**{field: "0x" + "zz" * 20})
    with pytest.raises(ClientInitializationError, match=f"^{label}: invalid"):
        ctx_module._signing_addresses(params)


def test_signing_addresses_are_checksummed():
    params = make_public_params(
        clearing_house_address="0x" + "ab" * 20,
        guarantee_registry_address="0X" + "CD" * 20,
        guarantee_signer=" 0x" + "ef" * 20 + " ",
    )
    assert ctx_module._signing_addresses(params) == (
        to_checksum_address("0x" + "ab" * 20),
        to_checksum_address("0x" + "cd" * 20),
        to_checksum_address("0x" + "ef" * 20),
    )


def test_a_ctx_without_a_facilitator_url_is_not_gasless():
    assert not make_ctx().facilitator.is_configured()


def test_active_cycle_is_a_frozen_value():
    cycle = ActiveCycle(id=CYCLE, period_start=1, period_end=2)
    with pytest.raises(AttributeError):
        cycle.id = NEXT_CYCLE
    assert cycle == ActiveCycle(id=CYCLE, period_start=1, period_end=2)
    assert cycle != ActiveCycle(id=CYCLE, period_start=1, period_end=3)
