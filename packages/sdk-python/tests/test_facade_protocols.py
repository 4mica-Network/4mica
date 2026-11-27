import asyncio
from fractions import Fraction
from types import SimpleNamespace

import pytest
from facade_helpers import KEY, SELLER, USDC, FakeClient, fake_session

from fourmica_sdk import Client, FourMica, SpendLimits
from fourmica_sdk.client.model import confirm_echoed
from fourmica_sdk.errors import ClientError, ConfigError, InvalidParamsError
from fourmica_sdk.facade.fetch import SpendLimiter
from fourmica_sdk.facade.protocols import PaymentTerms
from fourmica_sdk.networks import NETWORKS

SELF_HOSTED_CHAIN = 31337
SELF_HOSTED_CAIP2 = f"eip155:{SELF_HOSTED_CHAIN}"
URL = "https://api.example.com/data"


@pytest.fixture
def core(monkeypatch):
    state = SimpleNamespace(configs=[], clients=[])

    async def connect(cfg):
        state.configs.append(cfg)
        hosted = next((n for n in NETWORKS.values() if n.rpc_url == cfg.rpc_url), None)
        fake = FakeClient(chain_id=hosted.chain_id if hosted else SELF_HOSTED_CHAIN)
        state.clients.append(fake)
        return fake

    monkeypatch.setattr(Client, "connect", connect)
    return state


@pytest.mark.parametrize("named", [SELF_HOSTED_CAIP2, f" EIP155:{SELF_HOSTED_CHAIN} "])
async def test_a_self_hosted_core_is_found_by_its_own_caip2_id(core, named):
    client = await FourMica.connect(private_key=KEY, rpc_url="https://core.example/")
    assert client.network == SELF_HOSTED_CAIP2
    assert await client.low_level(named) is core.clients[0]
    assert len(core.configs) == 1
    await client.aclose()


async def test_another_unknown_caip2_id_is_refused_without_connecting(core):
    client = await FourMica.connect(private_key=KEY, rpc_url="https://core.example/")
    with pytest.raises(ConfigError, match='unknown network "eip155:999"'):
        await client.low_level("eip155:999")
    assert len(core.configs) == 1
    await client.aclose()


async def test_a_network_still_connecting_when_the_session_closes_is_never_opened(core):
    client = await FourMica.connect(private_key=KEY)
    await client._lock.acquire()
    pending = asyncio.create_task(client.low_level("base"))
    await asyncio.sleep(0)
    closing = asyncio.create_task(client.aclose())
    await asyncio.sleep(0)
    client._lock.release()
    with pytest.raises(ClientError, match="this FourMica session is closed"):
        await pending
    await closing
    assert [cfg.rpc_url for cfg in core.configs] == [NETWORKS["base-sepolia"].rpc_url]
    core.clients[0].aclose.assert_awaited_once()


async def test_cancels_a_withdrawal_on_the_named_network(core):
    client = await FourMica.connect(private_key=KEY)
    result = await client.cancel_withdrawal("usdc", network="base")
    base = core.clients[1]
    step = base.withdraw.cancel
    assert step.call_count == 1
    assert step.call_args.args[0].erc20_token == USDC
    assert core.clients[0].withdraw.cancel.call_count == 0
    assert result.asset.symbol == "USDC"
    assert result.network == "eip155:8453"
    await client.aclose()


def terms(amount: int) -> PaymentTerms:
    return PaymentTerms(
        protocol="x402",
        network="eip155:84532",
        asset=USDC,
        amount=amount,
        pay_to=SELLER,
        offer=None,
    )


async def test_releasing_a_reservation_with_no_total_limit_changes_nothing():
    limiter = SpendLimiter(SpendLimits(per_payment="1 USDC"))
    session = fake_session(FakeClient())
    reservation = await limiter.reserve(session, terms(400_000), URL)
    assert reservation.budget is None
    assert reservation.units == Fraction(2, 5)
    limiter.release(reservation)
    assert limiter._spent == []
    again = await limiter.reserve(session, terms(1_000_000), URL)
    assert again.units == 1


async def test_releasing_a_reservation_under_a_total_returns_its_units():
    limiter = SpendLimiter(SpendLimits(per_payment="1 USDC", total="1 USDC"))
    session = fake_session(FakeClient())
    first = await limiter.reserve(session, terms(700_000), URL)
    assert limiter._spent == [Fraction(7, 10)]
    limiter.release(first)
    assert limiter._spent == [0]
    assert (await limiter.reserve(session, terms(1_000_000), URL)).budget == 0


@pytest.mark.parametrize("expected", [SELLER, SELLER.lower()])
def test_an_echo_the_server_left_out_is_taken_as_the_expected_value(expected):
    assert confirm_echoed("participant", None, expected) == expected


def test_an_echo_matching_in_another_case_returns_the_expected_spelling():
    assert confirm_echoed("participant", SELLER.lower(), SELLER) == SELLER


@pytest.mark.parametrize("raw", ["", "0x" + "00" * 20, SELLER + " "])
def test_an_echo_that_differs_is_refused(raw):
    with pytest.raises(InvalidParamsError, match=f"server echoed participant {raw}"):
        confirm_echoed("participant", raw, SELLER)
