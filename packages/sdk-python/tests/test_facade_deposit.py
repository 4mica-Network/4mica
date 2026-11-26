import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from facade_helpers import (
    TX_HASH,
    USDC,
    FakeClient,
    fake_builder,
    fake_gateway,
    fake_session,
)

import fourmica_sdk.facade.deposit as deposit_module
from fourmica_sdk.amounts import Token
from fourmica_sdk.client.model import TokenRoute
from fourmica_sdk.errors import (
    AmountPrecisionError,
    AmountZeroError,
    Erc20AllowanceRequiredError,
    FacilitatorNotConfiguredError,
    GasRequiredError,
    InsufficientBalanceError,
    InvalidParamsError,
    OutcomeUnknownError,
    SponsorshipTransportError,
    TokenNotSupportedError,
)
from fourmica_sdk.facade.deposit import deposit
from fourmica_sdk.models import ZERO_ADDRESS


@pytest.fixture(autouse=True)
def fast_polling(monkeypatch):
    monkeypatch.setattr(deposit_module, "_FIRST_POLL_SECS", 0.001)
    monkeypatch.setattr(deposit_module, "_MAX_POLL_SECS", 0.002)


def deposited(client: FakeClient):
    """The (asset address, base units) of each deposit the facade started."""
    return [
        (call.args[0].address, call.args[1]) for call in client.deposit.of.mock_calls
    ]


async def test_deposits_gaslessly_and_waits_until_core_counts_it():
    client = FakeClient(totals=[2_000_000, 2_000_000, 7_000_000])
    result = await deposit(fake_session(client), "5 USDC")

    assert deposited(client) == [(USDC, 5_000_000)]
    client.builder.send.assert_awaited_once()
    client.builder.self_funded.assert_not_called()
    assert result.status == "spendable"
    assert result.tx_hash == TX_HASH
    assert result.route is TokenRoute.EIP3009
    assert (result.amount, result.amount_raw) == ("5", 5_000_000)
    assert result.asset == Token("USDC", USDC, 6)
    assert result.network == "eip155:84532"
    assert result.explorer_url == f"https://sepolia.basescan.org/tx/{TX_HASH}"


async def test_accepts_the_structured_form_and_a_token_address():
    client = FakeClient(totals=[0, 1_500_000])
    result = await deposit(fake_session(client), {"amount": "1.5", "asset": USDC})
    assert deposited(client) == [(USDC, 1_500_000)]
    assert result.asset.symbol == "USDC"


async def test_checks_the_wallet_before_anything_is_signed():
    gateway = fake_gateway(erc20_balance=AsyncMock(return_value=4_000_000))
    client = FakeClient(gateway=gateway)
    with pytest.raises(InsufficientBalanceError) as raised:
        await deposit(fake_session(client), "5 USDC")
    assert (raised.value.asset, raised.value.needed, raised.value.available) == (
        "USDC",
        "5",
        "4",
    )
    client.deposit.of.assert_not_called()


async def test_refuses_rounding_zero_unknown_assets_and_bad_options():
    client = FakeClient()
    session = fake_session(client)
    with pytest.raises(AmountPrecisionError):
        await deposit(session, "0.0000001 USDC")
    with pytest.raises(AmountZeroError):
        await deposit(session, "0 USDC")
    with pytest.raises(TokenNotSupportedError):
        await deposit(session, "5 DAI")
    with pytest.raises(InvalidParamsError):
        await deposit(session, 5)
    with pytest.raises(InvalidParamsError, match="gas must be"):
        await deposit(session, "5 USDC", gas="none")
    with pytest.raises(InvalidParamsError, match="wait must be"):
        await deposit(session, "5 USDC", wait="minded")
    client.deposit.of.assert_not_called()


async def test_falls_back_to_approve_and_deposit_when_no_gasless_route_exists():
    builder = fake_builder()
    builder.send = AsyncMock(
        side_effect=Erc20AllowanceRequiredError(USDC, "0x" + "c0" * 20, 0, 5_000_000)
    )
    client = FakeClient(builder=builder, totals=[0, 5_000_000])
    result = await deposit(fake_session(client), "5 USDC")

    builder.self_funded_builder.approve.assert_awaited_once()
    builder.self_funded_builder.send.assert_awaited_once()
    assert result.route is TokenRoute.SELF_FUNDED
    assert result.status == "spendable"


async def test_gas_self_approves_and_sends_the_wallets_own_transaction():
    client = FakeClient(totals=[0, 5_000_000])
    result = await deposit(fake_session(client), "5 USDC", gas="self")
    client.builder.send.assert_not_awaited()
    client.builder.self_funded_builder.approve.assert_awaited_once()
    assert result.route is TokenRoute.SELF_FUNDED


async def test_approves_and_sends_its_own_transaction_where_no_facilitator_is_hosted():
    client = FakeClient(gasless=False, totals=[0, 5_000_000])
    result = await deposit(fake_session(client), "5 USDC")
    # The low-level send() would go out with no allowance.
    client.builder.send.assert_not_awaited()
    client.builder.self_funded_builder.approve.assert_awaited_once()
    client.builder.self_funded_builder.send.assert_awaited_once()
    assert result.route is TokenRoute.SELF_FUNDED

    broke = FakeClient(
        gasless=False,
        gateway=fake_gateway(native_balance=AsyncMock(return_value=0)),
    )
    with pytest.raises(GasRequiredError, match="needs ETH for gas"):
        await deposit(fake_session(broke), "5 USDC")


@pytest.mark.parametrize(
    "refusal",
    [
        FacilitatorNotConfiguredError("gas sponsorship is not enabled"),
        SponsorshipTransportError("facilitator request failed: connection refused"),
    ],
)
async def test_sends_its_own_transaction_when_nothing_was_sponsored(refusal):
    builder = fake_builder()
    builder.send = AsyncMock(side_effect=refusal)
    client = FakeClient(builder=builder, totals=[0, 5_000_000])
    result = await deposit(fake_session(client), "5 USDC")
    builder.self_funded_builder.approve.assert_awaited_once()
    assert result.route is TokenRoute.SELF_FUNDED


async def test_never_sends_a_second_deposit_after_an_unknown_outcome():
    builder = fake_builder()
    builder.send = AsyncMock(side_effect=OutcomeUnknownError("timed out"))
    client = FakeClient(builder=builder)
    with pytest.raises(OutcomeUnknownError):
        await deposit(fake_session(client), "5 USDC")
    builder.self_funded.assert_not_called()


async def test_gas_self_needs_gas_money():
    gateway = fake_gateway(native_balance=AsyncMock(return_value=0))
    client = FakeClient(gateway=gateway)
    with pytest.raises(GasRequiredError, match="needs ETH for gas"):
        await deposit(fake_session(client), "5 USDC", gas="self")
    client.builder.self_funded_builder.approve.assert_not_awaited()


async def test_deposits_native_eth_as_the_wallets_own_transaction():
    client = FakeClient(tokens=[], totals=[0, 10**16])
    result = await deposit(fake_session(client), "0.01 ETH")

    assert deposited(client) == [(ZERO_ADDRESS, 10**16)]
    client.builder.self_funded_builder.send.assert_awaited_once()
    client.builder.self_funded_builder.approve.assert_not_awaited()
    client.tokens.supported.assert_not_awaited()
    assert result.asset == Token("ETH", ZERO_ADDRESS, 18)
    assert result.amount == "0.01"


async def test_refuses_a_native_deposit_that_leaves_nothing_for_gas():
    gateway = fake_gateway(native_balance=AsyncMock(return_value=10**16))
    client = FakeClient(gateway=gateway)
    with pytest.raises(GasRequiredError, match="leaves nothing for gas"):
        await deposit(fake_session(client), "0.01 ETH")
    client.deposit.of.assert_not_called()


async def test_wait_mined_returns_at_once_and_spendable_still_waits_for_this_deposit():
    # 2 was there before; the deposit is counted on the third read.
    client = FakeClient(totals=[2_000_000, 2_000_000, 7_000_000])
    result = await deposit(fake_session(client), "5 USDC", wait="mined")
    assert result.status == "mined"
    assert client.account.asset_balance.await_count == 1

    later = await result.spendable()
    assert later.status == "spendable"
    assert later.tx_hash == result.tx_hash


async def test_returns_pending_when_core_is_slow_and_spendable_waits_again():
    client = FakeClient(totals=[0])
    result = await deposit(fake_session(client), "5 USDC", timeout_secs=0.02)
    assert result.status == "pending"

    client._totals[:] = [5_000_000]
    assert (await result.spendable(timeout_secs=1)).status == "spendable"


async def test_returns_pending_on_time_when_a_core_request_hangs():
    client = FakeClient()
    reads = iter([0])

    async def hangs_after_the_baseline(asset):
        for total in reads:
            return type("Balance", (), {"total": total, "locked": 0})()
        await asyncio.Event().wait()

    client.account.asset_balance = AsyncMock(side_effect=hangs_after_the_baseline)
    started = time.monotonic()
    result = await deposit(fake_session(client), "5 USDC", timeout_secs=0.05)
    assert result.status == "pending"
    assert time.monotonic() - started < 1


async def test_keeps_polling_through_core_errors_once_the_money_has_moved():
    client = FakeClient()
    reads = iter([0, RuntimeError("core is down"), RuntimeError("still down")])

    async def flaky(asset):
        outcome = next(reads, 5_000_000)
        if isinstance(outcome, Exception):
            raise outcome
        return type("Balance", (), {"total": outcome, "locked": 0})()

    client.account.asset_balance = AsyncMock(side_effect=flaky)
    result = await deposit(fake_session(client), "5 USDC")
    assert result.status == "spendable"
    assert client.account.asset_balance.await_count == 4


async def test_a_remote_signer_deposits_gaslessly_without_reading_the_wallet():
    client = FakeClient(private_key=None, totals=[0, 5_000_000])
    result = await deposit(fake_session(client), "5 USDC")
    assert result.status == "spendable"
    client.ctx.gateway.assert_not_awaited()
    client.builder.send.assert_awaited_once()


async def test_two_deposits_at_once_are_not_both_confirmed_by_one_credit():
    """Both would read the same total and wait for the same target, so core
    counting either one would pass for both. Here it counts only the first."""
    core = {"total": 10_000_000, "sent": 0}
    client = FakeClient()

    async def balance(asset):
        return SimpleNamespace(total=core["total"], locked=0)

    async def send():
        await asyncio.sleep(0)
        core["sent"] += 1
        if core["sent"] == 1:
            core["total"] += 5_000_000
        return await sent()

    sent = client.builder.send
    client.builder.send = AsyncMock(side_effect=send)
    client.account.asset_balance = AsyncMock(side_effect=balance)
    session = fake_session(client)

    first, second = await asyncio.gather(
        deposit(session, "5 USDC"),
        deposit(session, "5 USDC", timeout_secs=0.05),
    )
    assert core["sent"] == 2
    assert (first.status, second.status) == ("spendable", "pending")

    # Once core counts the second, waiting again says so.
    core["total"] += 5_000_000
    assert (await second.spendable()).status == "spendable"


async def test_a_failed_deposit_does_not_hold_up_the_next():
    # Each deposit reads the total once before sending.
    client = FakeClient(totals=[0, 0, 5_000_000])
    session = fake_session(client)
    sent = client.builder.send
    client.builder.send = AsyncMock(side_effect=OutcomeUnknownError("lost"))
    with pytest.raises(OutcomeUnknownError):
        await deposit(session, "5 USDC")
    client.builder.send = sent
    assert (await deposit(session, "5 USDC")).status == "spendable"


async def test_deposits_of_different_assets_do_not_wait_for_each_other():
    client = FakeClient(totals=[0])
    session = fake_session(client)
    slow = asyncio.create_task(deposit(session, "5 USDC", timeout_secs=30))
    await asyncio.sleep(0.01)
    # USDC is still waiting for core; USDT goes straight through.
    result = await asyncio.wait_for(deposit(session, "5 USDT", wait="mined"), 1)
    assert result.status == "mined"
    assert not slow.done()
    slow.cancel()
