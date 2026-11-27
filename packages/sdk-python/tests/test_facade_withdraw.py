import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from facade_helpers import TX_HASH, USDC, USDT, FakeClient, fake_session

from fourmica_sdk.amounts import Token
from fourmica_sdk.client.model import AssetPosition, Route
from fourmica_sdk.errors import (
    AmountZeroError,
    ClientError,
    GracePeriodNotElapsedError,
    NoWithdrawalRequestedError,
    TokenNotSupportedError,
)
from fourmica_sdk.facade.withdraw import (
    cancel_withdrawal,
    finalize_withdrawal,
    pending_withdrawals,
    request_withdrawal,
)
from fourmica_sdk.models import ZERO_ADDRESS

GRACE = 3600


def position(asset: str, amount: int, requested_at: int) -> AssetPosition:
    return AssetPosition(
        asset=asset,
        collateral=10_000_000,
        withdrawal_request_amount=amount,
        withdrawal_request_timestamp=requested_at,
    )


def asked(step) -> list:
    return [
        (call.args[0].address, *call.args[1:]) for call in step.mock_calls if call.args
    ]


async def test_requests_in_base_units_of_the_named_asset():
    client = FakeClient()
    result = await request_withdrawal(fake_session(client), "2.5 USDC")
    assert asked(client.withdraw.request) == [(USDC, 2_500_000)]
    assert result.tx_hash == TX_HASH
    assert result.route is Route.GASLESS
    assert result.asset == Token("USDC", USDC, 6)
    assert result.network == "eip155:84532"
    assert result.explorer_url == f"https://sepolia.basescan.org/tx/{TX_HASH}"

    with pytest.raises(AmountZeroError):
        await request_withdrawal(fake_session(client), "0 USDC")


async def test_withdraws_native_eth_by_symbol():
    client = FakeClient()
    result = await request_withdrawal(fake_session(client), "0.5 ETH")
    assert asked(client.withdraw.request) == [(ZERO_ADDRESS, 5 * 10**17)]
    assert result.asset.symbol == "ETH"


async def test_cancels_by_asset():
    client = FakeClient()
    result = await cancel_withdrawal(fake_session(client), "usdc")
    assert asked(client.withdraw.cancel) == [(USDC,)]
    assert result.asset.symbol == "USDC"


async def test_lists_pending_requests_with_when_they_become_ready():
    now = int(time.time())
    delisted = "0x" + "99" * 20
    client = FakeClient(
        positions=[
            position(USDC, 2_500_000, now - GRACE - 10),
            position(USDT, 1_000_000, now - 60),
            position(ZERO_ADDRESS, 0, 0),
            position(delisted, 42, now),
        ]
    )
    pending = await pending_withdrawals(fake_session(client))

    assert [w.asset.symbol for w in pending] == ["USDC", "USDT", delisted]
    ready, waiting, unknown = pending
    assert (ready.amount, ready.amount_raw, ready.ready) == ("2.5", 2_500_000, True)
    assert ready.requested_at == datetime.fromtimestamp(now - GRACE - 10, timezone.utc)
    assert ready.ready_at == datetime.fromtimestamp(now - 10, timezone.utc)
    assert waiting.ready is False
    assert waiting.ready_at == datetime.fromtimestamp(now - 60 + GRACE, timezone.utc)
    assert waiting.network == "eip155:84532"
    assert (unknown.amount, unknown.asset.decimals) == ("42", 0)


async def test_says_when_an_early_finalize_will_be_possible():
    now = int(time.time())
    client = FakeClient(positions=[position(USDC, 2_500_000, now - 60)])
    with pytest.raises(GracePeriodNotElapsedError, match=r"2\.5 USDC can be finalized"):
        await finalize_withdrawal(fake_session(client), "USDC")
    client.withdraw.finalize.assert_not_called()


async def test_refuses_to_finalize_when_nothing_was_requested():
    client = FakeClient(positions=[position(USDT, 1_000_000, 0)])
    with pytest.raises(NoWithdrawalRequestedError, match="no withdrawal of USDC"):
        await finalize_withdrawal(fake_session(client), "USDC")
    client.withdraw.finalize.assert_not_called()


async def test_finalizes_once_the_grace_period_has_ended():
    now = int(time.time())
    client = FakeClient(positions=[position(USDC, 2_500_000, now - GRACE - 1)])
    result = await finalize_withdrawal(fake_session(client), "USDC")
    assert asked(client.withdraw.finalize) == [(USDC,)]
    assert result.tx_hash == TX_HASH


async def test_a_delisted_asset_is_cancelled_and_finalized_by_its_address():
    now = int(time.time())
    delisted = "0x" + "9a" * 20
    client = FakeClient(positions=[position(delisted, 42, now - GRACE - 1)])
    session = fake_session(client)
    (reported,) = await pending_withdrawals(session)

    result = await finalize_withdrawal(session, reported.asset.address)
    assert [address.lower() for (address,) in asked(client.withdraw.finalize)] == [
        delisted
    ]
    assert result.asset.address.lower() == delisted
    assert result.asset.decimals == 0

    await cancel_withdrawal(session, delisted.upper().replace("0X", "0x"))
    assert [address.lower() for (address,) in asked(client.withdraw.cancel)] == [
        delisted
    ]


async def test_a_delisted_asset_still_waits_out_the_grace_period():
    now = int(time.time())
    delisted = "0x" + "9a" * 20
    client = FakeClient(positions=[position(delisted, 42, now - 60)])
    with pytest.raises(GracePeriodNotElapsedError, match=r"(?i)42 0x9a9a"):
        await finalize_withdrawal(fake_session(client), delisted)
    client.withdraw.finalize.assert_not_called()


@pytest.mark.parametrize("asset", ["DAI", "0x1234", "0x" + "zz" * 20])
async def test_only_an_address_stands_in_for_an_asset_core_does_not_list(asset):
    client = FakeClient()
    session = fake_session(client)
    for step in (cancel_withdrawal, finalize_withdrawal):
        with pytest.raises(TokenNotSupportedError):
            await step(session, asset)
    client.withdraw.cancel.assert_not_called()
    client.withdraw.finalize.assert_not_called()


async def test_a_remote_signer_finalizes_without_the_chain_check():
    client = FakeClient(private_key=None)
    client.ctx.gateway = AsyncMock(side_effect=ClientError("no local key"))
    session = fake_session(client)
    await finalize_withdrawal(session, "USDC")
    assert asked(client.withdraw.finalize) == [(USDC,)]
    with pytest.raises(ClientError, match="no local key"):
        await pending_withdrawals(session)
