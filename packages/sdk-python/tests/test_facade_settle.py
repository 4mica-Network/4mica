from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from facade_helpers import TX_HASH, USDC, FakeClient, fake_gateway, fake_session

from fourmica_sdk.amounts import Token
from fourmica_sdk.client.model import PayReceipt, Route, TokenRoute
from fourmica_sdk.errors import (
    ContractError,
    Erc20AllowanceRequiredError,
    GasRequiredError,
    OutcomeUnknownError,
    TransactionOutcomeUnknownError,
)
from fourmica_sdk.facade.settle import open_positions, settle_all
from fourmica_sdk.models import ClearingParticipantRole, ClearingPosition

DELISTED = "0x" + "99" * 20
PAID = PayReceipt(tx_hash=TX_HASH, route=TokenRoute.EIP3009, account="0x")
CLAIMED = SimpleNamespace(tx_hash=TX_HASH, route=Route.GASLESS)
NO_ALLOWANCE = Erc20AllowanceRequiredError(USDC, "0xc1ea", 0, 2_500_000)


def position(
    cycle: str,
    role: ClearingParticipantRole = ClearingParticipantRole.NET_DEBTOR,
    asset: str = USDC,
    amount: int = 2_500_000,
    confirmed: bool = True,
) -> ClearingPosition:
    return ClearingPosition(
        cycle_id="0x" + "aa" * 32,
        cycle_id_text=cycle,
        asset_address=asset,
        role=role,
        amount=amount,
        gross_outgoing=3_000_000,
        gross_incoming=500_000,
        payment_submission_deadline=1_700_003_600,
        payment_finality_deadline=1_700_007_200,
        commit_confirmed=confirmed,
    )


def pay_builder(send=None, own_send=None):
    own = SimpleNamespace(
        approve=AsyncMock(return_value=None),
        send=own_send or AsyncMock(return_value=PAID),
    )
    return SimpleNamespace(
        send=send or AsyncMock(return_value=PAID),
        self_funded=MagicMock(return_value=own),
        own=own,
    )


def settling(positions, pay=None, claim_send=None, **client_options):
    client = FakeClient(**client_options)
    client.settlement = SimpleNamespace(
        positions=AsyncMock(return_value=positions),
        pay=MagicMock(return_value=pay or pay_builder()),
        claim=MagicMock(
            return_value=SimpleNamespace(
                send=claim_send or AsyncMock(return_value=CLAIMED)
            )
        ),
    )
    return client, fake_session(client)


async def test_lists_positions_in_whole_units_with_their_deadlines():
    _, session = settling(
        [
            position("c1"),
            position("c2", ClearingParticipantRole.NET_CREDITOR, DELISTED, 42, False),
        ]
    )
    debit, credit = await open_positions(session)

    assert debit.cycle == "c1"
    assert debit.role == "debtor"
    assert debit.asset == Token("USDC", USDC, 6)
    assert (debit.amount, debit.gross_outgoing, debit.gross_incoming) == (
        "2.5",
        "3",
        "0.5",
    )
    assert debit.amount_raw == 2_500_000
    assert debit.pay_by == datetime.fromtimestamp(1_700_003_600, timezone.utc)
    assert debit.final_at == datetime.fromtimestamp(1_700_007_200, timezone.utc)
    assert debit.network == "eip155:84532"

    # An asset core no longer lists is still reported, in base units.
    assert credit.role == "creditor"
    assert credit.asset == Token(DELISTED, DELISTED, 0)
    assert credit.amount == "42"
    assert credit.commit_confirmed is False


async def test_pays_debits_and_claims_credits():
    client, session = settling(
        [position("c1"), position("c2", ClearingParticipantRole.NET_CREDITOR)]
    )
    paid, claimed = await settle_all(session, None)

    assert (paid.action, paid.status, paid.route) == (
        "pay",
        "settled",
        TokenRoute.EIP3009,
    )
    assert paid.explorer_url == f"https://sepolia.basescan.org/tx/{TX_HASH}"
    assert (claimed.action, claimed.status) == ("claim", "settled")
    client.settlement.pay.assert_called_once_with("c1")
    client.settlement.claim.assert_called_once_with("c2")


@pytest.mark.parametrize("only,settled", [("pay", ["c1"]), ("claim", ["c2"])])
async def test_only_settles_one_side(only, settled):
    _, session = settling(
        [position("c1"), position("c2", ClearingParticipantRole.NET_CREDITOR)]
    )
    results = await settle_all(session, only)
    assert [r.position.cycle for r in results] == settled


async def test_skips_a_cycle_whose_commit_is_not_confirmed():
    client, session = settling([position("c1", confirmed=False)])
    (result,) = await settle_all(session, None)
    assert result.status == "skipped"
    assert "not confirmed" in result.reason
    client.settlement.pay.assert_not_called()


async def test_a_debit_the_clearing_house_may_not_pull_is_approved_then_paid():
    pay = pay_builder(send=AsyncMock(side_effect=NO_ALLOWANCE))
    _, session = settling([position("c1")], pay=pay)
    (result,) = await settle_all(session, None)
    assert result.status == "settled"
    pay.own.approve.assert_awaited_once()
    pay.own.send.assert_awaited_once()


async def test_an_approval_needs_gas_the_wallet_does_not_have():
    pay = pay_builder(send=AsyncMock(side_effect=NO_ALLOWANCE))
    _, session = settling(
        [position("c1")],
        pay=pay,
        gateway=fake_gateway(native_balance=AsyncMock(return_value=0)),
    )
    (result,) = await settle_all(session, None)
    assert result.status == "failed"
    assert isinstance(result.error, GasRequiredError)
    pay.own.approve.assert_not_awaited()


async def test_a_remote_signer_cannot_approve_so_the_debit_fails():
    pay = pay_builder(send=AsyncMock(side_effect=NO_ALLOWANCE))
    _, session = settling([position("c1")], pay=pay, private_key=None)
    (result,) = await settle_all(session, None)
    assert result.status == "failed"
    assert isinstance(result.error, Erc20AllowanceRequiredError)


@pytest.mark.parametrize(
    "error",
    [
        OutcomeUnknownError("facilitator went quiet"),
        TransactionOutcomeUnknownError("lost", stage="receipt", tx_hash=TX_HASH),
    ],
)
async def test_an_unknown_outcome_is_reported_as_unknown(error):
    _, session = settling(
        [position("c1")], pay=pay_builder(send=AsyncMock(side_effect=error))
    )
    (result,) = await settle_all(session, None)
    assert result.status == "unknown"
    assert result.error is error


async def test_one_failure_does_not_stop_the_others():
    _, session = settling(
        [position("c1"), position("c2", ClearingParticipantRole.NET_CREDITOR)],
        pay=pay_builder(send=AsyncMock(side_effect=ContractError("reverted"))),
    )
    results = await settle_all(session, None)
    assert [(r.position.cycle, r.status) for r in results] == [
        ("c1", "failed"),
        ("c2", "settled"),
    ]
