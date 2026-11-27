import asyncio
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from eth_account import Account
from facade_helpers import KEY, SELLER, USDC, FakeClient

from fourmica_sdk import Client, FourMica, SpendLimits
from fourmica_sdk.amounts import Token
from fourmica_sdk.errors import (
    ClientError,
    ConfigError,
    InvalidParamsError,
    SpendLimitError,
)
from fourmica_sdk.facade.models import Balance, RawBalance
from fourmica_sdk.networks import NETWORKS
from fourmica_sdk.signing import LocalAccountSigner

ADDRESS = Account.from_key(KEY).address
URL = "https://api.example.com/data"


@pytest.fixture
def core(monkeypatch):
    """Stands in for ``Client.connect``: records each config and hands back a
    fake client for its network."""
    state = SimpleNamespace(configs=[], clients=[], fail_next=None)

    async def connect(cfg):
        if state.fail_next is not None:
            error, state.fail_next = state.fail_next, None
            raise error
        state.configs.append(cfg)
        hosted = next((n for n in NETWORKS.values() if n.rpc_url == cfg.rpc_url), None)
        fake = FakeClient(chain_id=hosted.chain_id if hosted else 84532)
        fake.signer_address = ADDRESS
        state.clients.append(fake)
        return fake

    monkeypatch.setattr(Client, "connect", connect)
    return state


# --- connect --------------------------------------------------------------------


async def test_connects_the_default_network_with_its_hosted_facilitator(core):
    client = await FourMica.connect(private_key=KEY)
    assert client.address == ADDRESS
    assert client.network == "base-sepolia"
    cfg = core.configs[0]
    assert cfg.rpc_url == NETWORKS["base-sepolia"].rpc_url
    assert cfg.facilitator_url == "https://testnet.payment.4mica.io/"
    await client.aclose()


async def test_takes_network_rpc_url_and_facilitator_url_from_the_options(core):
    hosted = await FourMica.connect(private_key=KEY, network="eip155:8453")
    assert core.configs[0].rpc_url == NETWORKS["base"].rpc_url
    assert hosted.network == "base"

    self_hosted = await FourMica.connect(
        private_key=KEY,
        rpc_url="https://core.example/",
        facilitator_url="https://facilitator.example/",
    )
    assert core.configs[1].rpc_url == "https://core.example/"
    assert core.configs[1].facilitator_url == "https://facilitator.example/"
    assert self_hosted.network == "eip155:84532"
    assert await self_hosted.low_level("eip155:84532") is core.clients[1]
    await asyncio.gather(hosted.aclose(), self_hosted.aclose())


async def test_reads_the_environment_when_no_signer_is_passed(core, monkeypatch):
    env = {"FOURMICA_WALLET_PRIVATE_KEY": KEY, "FOURMICA_NETWORK": "base"}
    client = await FourMica.connect(env=env)
    assert client.network == "base"
    assert core.configs[0].wallet_private_key == KEY

    # An explicit network wins over the environment's.
    other = await FourMica.connect(env=env, network="base-sepolia")
    assert core.configs[1].rpc_url == NETWORKS["base-sepolia"].rpc_url

    # Without `env`, the process environment is read.
    monkeypatch.setenv("FOURMICA_WALLET_PRIVATE_KEY", KEY)
    monkeypatch.setenv("FOURMICA_NETWORK", "ethereum-sepolia")
    ambient = await FourMica.connect()
    assert ambient.network == "ethereum-sepolia"
    await asyncio.gather(client.aclose(), other.aclose(), ambient.aclose())


async def test_an_explicit_key_means_the_environment_is_not_read(core, monkeypatch):
    monkeypatch.setenv("FOURMICA_NETWORK", "base")
    monkeypatch.setenv("FOURMICA_FACILITATOR_URL", "https://env.example/")
    client = await FourMica.connect(private_key=KEY)
    assert client.network == "base-sepolia"
    assert core.configs[0].facilitator_url == "https://testnet.payment.4mica.io/"
    await client.aclose()


async def test_says_how_to_supply_a_signer_when_there_is_none(core):
    with pytest.raises(
        ConfigError, match="pass private_key or signer.*FOURMICA_WALLET_PRIVATE_KEY"
    ):
        await FourMica.connect(env={})
    assert core.configs == []


async def test_refuses_conflicting_or_unknown_options_before_connecting(core):
    with pytest.raises(ConfigError, match="not both"):
        await FourMica.connect(private_key=KEY, signer=LocalAccountSigner(KEY))
    with pytest.raises(ConfigError, match='unknown payment protocol "mpp"'):
        await FourMica.connect(private_key=KEY, protocols=["mpp"])
    with pytest.raises(ConfigError, match='unknown network "solana"'):
        await FourMica.connect(private_key=KEY, network="solana")
    with pytest.raises(InvalidParamsError, match="amount and its asset"):
        await FourMica.connect(private_key=KEY, spend=SpendLimits(per_payment="1"))
    assert core.configs == []


async def test_takes_one_protocol_as_a_plain_string(core):
    async with await FourMica.connect(private_key=KEY, protocols="x402") as client:
        assert [protocol.name for protocol in client._protocols] == ["x402"]


async def test_a_remote_signer_is_used_on_every_network(core):
    signer = LocalAccountSigner(KEY)
    client = await FourMica.connect(signer=signer)
    await client.low_level("base")
    assert [cfg.evm_signer for cfg in core.configs] == [signer, signer]
    assert [cfg.wallet_private_key for cfg in core.configs] == [None, None]
    await client.aclose()


# --- sessions -------------------------------------------------------------------


async def test_connects_another_network_once_on_first_use(core):
    client = await FourMica.connect(private_key=KEY)
    a, b = await asyncio.gather(
        client.low_level("base"), client.low_level("eip155:8453")
    )
    assert a is b
    assert [cfg.rpc_url for cfg in core.configs] == [
        NETWORKS["base-sepolia"].rpc_url,
        NETWORKS["base"].rpc_url,
    ]
    assert core.configs[1].wallet_private_key == KEY
    assert await client.low_level() is core.clients[0]
    assert await client.low_level("base-sepolia") is core.clients[0]
    with pytest.raises(ConfigError, match='unknown network "solana"'):
        await client.low_level("solana")
    await client.aclose()


async def test_retries_a_network_whose_connect_failed(core):
    client = await FourMica.connect(private_key=KEY)
    core.fail_next = RuntimeError("core down")
    with pytest.raises(RuntimeError, match="core down"):
        await client.low_level("base")
    assert await client.low_level("base") is core.clients[1]
    await client.aclose()


async def test_aclose_closes_every_network_once_then_refuses_work(core):
    client = await FourMica.connect(private_key=KEY)
    await client.low_level("base")
    await client.aclose()
    await client.aclose()
    for fake in core.clients:
        fake.aclose.assert_awaited_once()
    for work in (client.low_level(), client.deposit("1 USDC"), client.fetch(URL)):
        with pytest.raises(ClientError, match="closed"):
            await work


async def test_concurrent_aclose_calls_wait_on_the_same_cleanup(core):
    client = await FourMica.connect(private_key=KEY)
    release = asyncio.Event()
    finished = []

    async def slow_close():
        await release.wait()
        finished.append("client")

    core.clients[0].aclose = AsyncMock(side_effect=slow_close)

    async def close(label):
        await client.aclose()
        finished.append(label)

    closing = asyncio.gather(close("first"), close("second"))
    await asyncio.sleep(0.01)
    assert finished == []
    release.set()
    await closing
    assert finished[0] == "client"
    core.clients[0].aclose.assert_awaited_once()


async def test_every_aclose_caller_sees_a_failed_cleanup(core):
    client = await FourMica.connect(private_key=KEY)
    await client.low_level("base")
    core.clients[0].aclose = AsyncMock(side_effect=RuntimeError("socket stuck"))
    for _ in range(2):
        with pytest.raises(RuntimeError, match="socket stuck"):
            await client.aclose()
    # The other network was still closed, once.
    core.clients[0].aclose.assert_awaited_once()
    core.clients[1].aclose.assert_awaited_once()
    assert client._http.is_closed


async def test_a_cancelled_aclose_caller_does_not_stop_the_cleanup(core):
    client = await FourMica.connect(private_key=KEY)
    release = asyncio.Event()

    async def slow_close():
        await release.wait()

    core.clients[0].aclose = AsyncMock(side_effect=slow_close)
    impatient = asyncio.ensure_future(client.aclose())
    await asyncio.sleep(0.01)
    impatient.cancel()
    release.set()
    await client.aclose()
    core.clients[0].aclose.assert_awaited_once()
    assert client._http.is_closed


async def test_closes_on_leaving_the_block_even_when_it_raises(core):
    with pytest.raises(RuntimeError, match="boom"):
        async with await FourMica.connect(private_key=KEY) as client:
            raise RuntimeError("boom")
    core.clients[0].aclose.assert_awaited_once()
    with pytest.raises(ClientError, match="closed"):
        await client.balance()


async def test_its_own_http_client_waits_longer_than_httpx_does_by_default(core):
    async with await FourMica.connect(private_key=KEY) as client:
        # httpx's 5 seconds would drop the answer to a request already paid for.
        assert client._http.timeout.read == 300


async def test_closes_its_own_http_client_but_not_one_it_was_given(core):
    own = await FourMica.connect(private_key=KEY)
    await own.aclose()
    assert own._http.is_closed

    async with httpx.AsyncClient() as http:
        given = await FourMica.connect(private_key=KEY, http_client=http)
        await given.aclose()
        assert not http.is_closed


async def test_deposits_on_another_network_through_that_networks_client(core):
    async with await FourMica.connect(private_key=KEY) as client:
        result = await client.deposit("1 USDC", network="base", wait="mined")
    assert result.network == "eip155:8453"
    assert result.explorer_url.startswith("https://basescan.org/tx/")
    core.clients[1].deposit.of.assert_called_once()
    core.clients[0].deposit.of.assert_not_called()


async def test_lists_and_settles_positions_on_the_network_asked_for(core):
    async with await FourMica.connect(private_key=KEY) as client:
        assert await client.positions() == []
        assert await client.settle(only="pay") == []
        assert await client.positions(network="base") == []
    assert core.clients[0].settlement.positions.await_count == 2
    assert core.clients[1].settlement.positions.await_count == 1


async def test_settle_refuses_a_side_that_is_not_pay_or_claim(core):
    async with await FourMica.connect(private_key=KEY) as client:
        with pytest.raises(InvalidParamsError, match="only must be"):
            await client.settle(only="both")


# --- balance --------------------------------------------------------------------


async def test_reports_held_assets_in_their_own_units(core):
    async with await FourMica.connect(private_key=KEY) as client:

        async def held(asset):
            if asset != USDC:
                return None
            return SimpleNamespace(total=5_000_000, locked=1_250_000)

        core.clients[0].account.asset_balance = AsyncMock(side_effect=held)
        usdc = Balance(
            asset=Token("USDC", USDC, 6),
            total="5",
            locked="1.25",
            available="3.75",
            raw=RawBalance(total=5_000_000, locked=1_250_000, available=3_750_000),
        )
        assert await client.balance() == {"USDC": usdc}
        assert await client.balance("usdc") == usdc
        eth = await client.balance("ETH")
        assert (eth.total, eth.raw.available) == ("0", 0)


async def test_keys_a_repeated_symbol_by_address(core):
    twin = "0x" + "22" * 20
    async with await FourMica.connect(private_key=KEY) as client:
        core.clients[0].tokens.supported.return_value = SimpleNamespace(
            tokens=[Token("USDC", USDC, 6), Token("USDC", twin, 18)]
        )
        core.clients[0].account.asset_balance = AsyncMock(
            return_value=SimpleNamespace(total=10**6, locked=0)
        )
        balances = await client.balance()
    assert set(balances) == {"ETH", "USDC", twin}


# --- fetch ----------------------------------------------------------------------


def challenge(amount: str) -> httpx.Response:
    required = {
        "x402Version": 2,
        "resource": {"url": URL},
        "accepts": [
            {
                "scheme": "4mica-credit",
                "network": "eip155:84532",
                "asset": USDC,
                "amount": amount,
                "payTo": SELLER,
            }
        ],
    }
    header = base64.b64encode(json.dumps(required).encode()).decode()
    return httpx.Response(402, headers={"PAYMENT-REQUIRED": header})


def seller(amount: str):
    calls = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if "PAYMENT-SIGNATURE" in request.headers:
            return httpx.Response(200, text="data")
        return challenge(amount)

    return calls, httpx.AsyncClient(transport=httpx.MockTransport(handle))


async def test_pays_a_402_on_the_sessions_network_and_reports_it(core):
    calls, http = seller("10000")
    async with await FourMica.connect(private_key=KEY, http_client=http) as client:
        response = await client.fetch(URL, method="POST", json={"q": 1})
        assert response.text == "data"
        assert [c.method for c in calls] == ["POST", "POST"]
        assert json.loads(calls[1].content) == {"q": 1}
        payment = client.payment_for(response)
        assert (payment.protocol, payment.amount, payment.pay_to) == (
            "x402",
            "0.01",
            SELLER,
        )
        assert client.payment_for(httpx.Response(200)) is None
    await http.aclose()


async def test_refuses_over_the_spend_limit_without_signing(core):
    calls, http = seller("2000000")
    async with await FourMica.connect(private_key=KEY, http_client=http) as client:
        with pytest.raises(SpendLimitError):
            await client.fetch(URL)
        assert len(calls) == 1
        core.clients[0].sign_payment.assert_not_awaited()

    raised = SpendLimits(per_payment="5 USDC")
    async with await FourMica.connect(
        private_key=KEY, http_client=http, spend=raised
    ) as client:
        assert (await client.fetch(URL)).status_code == 200
    await http.aclose()
