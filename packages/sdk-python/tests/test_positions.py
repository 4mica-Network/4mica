from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from fourmica_sdk.client.payment import PaymentClient
from fourmica_sdk.client.settlement import SettlementClient
from fourmica_sdk.errors import InvalidParamsError
from fourmica_sdk.models import (
    ClearingParticipantRole,
    ClearingPosition,
    PayerGuaranteesPage,
)
from fourmica_sdk.rpc import RpcProxy

BASE = "https://core.example/"
USER = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"
SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"
CYCLE = "0x" + "aa" * 32

POSITION = {
    "cycle_id": CYCLE,
    "cycle_id_text": f"{USDC.lower()}:1700000000",
    "asset_address": USDC.lower(),
    "role": "NET_DEBTOR",
    "amount": "2500000",
    "gross_outgoing": "3000000",
    "gross_incoming": "500000",
    "payment_submission_deadline": 1_700_003_600,
    "payment_finality_deadline": 1_700_007_200,
    "commit_confirmed": True,
}

PAGE = {
    "cycleId": CYCLE,
    "cycleIdText": f"{USDC.lower()}:1700000000",
    "assetAddress": USDC.lower(),
    "payer": USER.lower(),
    "guarantees": [
        {
            "guaranteeId": "g-1",
            "recipient": SELLER.lower(),
            "reqId": "7",
            "amount": "100",
            "timestamp": 1_700_000_100,
            "status": "NETTED",
        },
        {
            "guarantee_id": "g-2",
            "recipient": SELLER.lower(),
            "req_id": "0x08",
            "amount": 5,
            "timestamp": 1_700_000_200,
            "status": "SOMETHING_NEWER",
        },
    ],
    "nextCursor": "g-2",
}


def proxy_with(handler) -> RpcProxy:
    return RpcProxy(BASE, transport=httpx.MockTransport(handler))


def test_reads_a_position_in_either_spelling():
    snake = ClearingPosition.from_rpc(POSITION)
    camel = ClearingPosition.from_rpc(
        {
            "cycleId": CYCLE,
            "cycleIdText": POSITION["cycle_id_text"],
            "assetAddress": USDC,
            "role": "NET_CREDITOR",
            "amount": 1,
            "grossOutgoing": 0,
            "grossIncoming": 1,
            "paymentSubmissionDeadline": "1700003600",
            "paymentFinalityDeadline": "1700007200",
            "commitConfirmed": False,
        }
    )
    assert snake.role is ClearingParticipantRole.NET_DEBTOR
    assert (snake.amount, snake.gross_outgoing, snake.gross_incoming) == (
        2_500_000,
        3_000_000,
        500_000,
    )
    assert snake.asset_address == USDC
    assert snake.payment_finality_deadline == 1_700_007_200
    assert camel.role is ClearingParticipantRole.NET_CREDITOR
    assert camel.payment_submission_deadline == 1_700_003_600
    assert camel.commit_confirmed is False


@pytest.mark.parametrize(
    ("change", "complaint"),
    [
        ({"amount": None}, "missing amount"),
        ({"gross_incoming": None}, "missing gross_incoming"),
        ({"role": "FLAT"}, "unknown role FLAT"),
        ({"commit_confirmed": "yes"}, "commit_confirmed is not a boolean"),
        ({"payment_submission_deadline": 0}, "is not a time"),
        ({"payment_finality_deadline": "soon"}, "is not a time"),
        ({"payment_finality_deadline": True}, "is not a time"),
        ({"cycle_id": "0x12"}, "invalid clearing position"),
        ({"asset_address": "not-an-address"}, "invalid clearing position"),
    ],
)
def test_refuses_a_position_it_cannot_settle_by(change, complaint):
    raw = dict({**POSITION, **change}.items())
    with pytest.raises(InvalidParamsError, match=complaint):
        ClearingPosition.from_rpc(raw)


def test_reads_a_page_of_guarantees_passing_newer_statuses_through():
    page = PayerGuaranteesPage.from_rpc(PAGE)
    assert page.payer == USER
    assert page.next_cursor == "g-2"
    assert [(g.req_id, g.amount, g.status) for g in page.guarantees] == [
        (7, 100, "NETTED"),
        (8, 5, "SOMETHING_NEWER"),
    ]
    assert page.guarantees[0].recipient == SELLER


def test_the_last_page_has_no_cursor_and_a_bad_page_is_refused():
    last = PayerGuaranteesPage.from_rpc({**PAGE, "nextCursor": ""})
    assert last.next_cursor is None
    with pytest.raises(InvalidParamsError, match="invalid guarantee list"):
        PayerGuaranteesPage.from_rpc({**PAGE, "payer": "nobody"})


async def test_lists_positions_from_core():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        return httpx.Response(200, json={"positions": [POSITION]})

    positions = await proxy_with(handler).list_participant_positions(USER)
    assert seen["path"] == f"/core/participants/{USER}/positions"
    assert [p.amount for p in positions] == [2_500_000]


async def test_an_answer_with_no_positions_lists_none():
    proxy = proxy_with(lambda request: httpx.Response(200, json={}))
    assert await proxy.list_participant_positions(USER) == []


async def test_pages_through_a_payers_guarantees():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.path, dict(request.url.params)))
        return httpx.Response(200, json=PAGE)

    proxy = proxy_with(handler)
    await proxy.list_payer_guarantees(USER, "AA" * 32)
    await proxy.list_payer_guarantees(USER, CYCLE, limit=50, after="g-2")
    assert seen == [
        (f"/core/payers/{USER}/guarantees", {"cycle_id": CYCLE}),
        (
            f"/core/payers/{USER}/guarantees",
            {"cycle_id": CYCLE, "limit": "50", "after": "g-2"},
        ),
    ]


async def test_the_signer_asks_for_its_own_positions_and_guarantees():
    rpc = SimpleNamespace(
        list_participant_positions=AsyncMock(return_value=["position"]),
        list_payer_guarantees=AsyncMock(return_value="page"),
    )
    ctx = SimpleNamespace(rpc=rpc, signer_address=USER)

    assert await SettlementClient(ctx).positions() == ["position"]
    rpc.list_participant_positions.assert_awaited_once_with(USER)

    assert await PaymentClient(ctx).list_issued(CYCLE, limit=10) == "page"
    rpc.list_payer_guarantees.assert_awaited_once_with(
        USER, CYCLE, limit=10, after=None
    )
