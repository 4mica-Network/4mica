"""A transaction the wallet sends itself whose fate is unknown is not a failure:
the caller must check before sending it again."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import aiohttp
import pytest
from stubs import CONTRACT_ADDRESS, TEST_PRIVATE_KEY, TOKEN_ADDRESS
from web3.exceptions import RequestTimedOut, TimeExhausted, Web3RPCError

from fourmica_sdk.contract import ContractGateway
from fourmica_sdk.errors import (
    ContractError,
    OutcomeUnknownError,
    RevertedOnChainError,
    SponsorshipError,
    TransactionOutcomeUnknownError,
)

TX_HASH = bytes.fromhex("ab" * 32)


def gateway_with(send=None, receipt=None) -> ContractGateway:
    gateway = ContractGateway(
        eth_rpc_url="http://localhost:8545/",
        private_key=TEST_PRIVATE_KEY,
        contract_address=CONTRACT_ADDRESS,
        chain_id=84532,
    )
    gateway.account = SimpleNamespace(
        address=gateway.account.address,
        sign_transaction=lambda txn: SimpleNamespace(raw_transaction=b"\x01"),
    )
    gateway.w3 = SimpleNamespace(
        eth=SimpleNamespace(
            send_raw_transaction=send or AsyncMock(return_value=TX_HASH),
            wait_for_transaction_receipt=receipt
            or AsyncMock(return_value={"status": 1}),
        )
    )
    return gateway


def response_error(status: int) -> aiohttp.ClientResponseError:
    return aiohttp.ClientResponseError(
        request_info=MagicMock(), history=(), status=status, message="gateway"
    )


def rpc_error(code: int) -> Web3RPCError:
    return Web3RPCError(
        "node error",
        rpc_response={"jsonrpc": "2.0", "id": 1, "error": {"code": code}},
    )


def test_an_unknown_transaction_is_caught_as_any_unknown_outcome():
    assert issubclass(TransactionOutcomeUnknownError, OutcomeUnknownError)
    assert issubclass(TransactionOutcomeUnknownError, SponsorshipError)
    assert not issubclass(TransactionOutcomeUnknownError, ContractError)


async def test_a_mined_transaction_returns_its_receipt_with_the_hash():
    receipt = await gateway_with()._build_and_send({})
    assert receipt["transactionHash"] == "0x" + "ab" * 32


async def test_a_reverted_transaction_is_a_failure():
    gateway = gateway_with(receipt=AsyncMock(return_value={"status": 0}))
    with pytest.raises(RevertedOnChainError):
        await gateway._build_and_send({})


@pytest.mark.parametrize(
    "error",
    [
        aiohttp.ServerDisconnectedError(),
        aiohttp.ClientConnectionError("reset by peer"),
        asyncio.TimeoutError(),
        response_error(502),
        response_error(503),
        response_error(408),
        rpc_error(-32603),
        RequestTimedOut("request timed out"),
    ],
    ids=lambda e: type(e).__name__ + getattr(e, "message", ""),
)
async def test_a_broadcast_with_no_usable_answer_is_an_unknown_outcome(error):
    gateway = gateway_with(send=AsyncMock(side_effect=error))
    with pytest.raises(TransactionOutcomeUnknownError) as raised:
        await gateway._build_and_send({})
    assert raised.value.stage == "broadcast"
    assert raised.value.tx_hash is None


@pytest.mark.parametrize(
    "error",
    [response_error(400), response_error(429), rpc_error(-32000), ValueError("x")],
    ids=["http-400", "http-429", "rpc-refusal", "other"],
)
async def test_a_broadcast_the_node_refused_is_a_failure(error):
    gateway = gateway_with(send=AsyncMock(side_effect=error))
    with pytest.raises(ContractError):
        await gateway._build_and_send({})


@pytest.mark.parametrize(
    "error", [TimeExhausted("not mined"), aiohttp.ServerDisconnectedError()]
)
async def test_a_receipt_that_does_not_come_is_an_unknown_outcome(error):
    gateway = gateway_with(receipt=AsyncMock(side_effect=error))
    with pytest.raises(TransactionOutcomeUnknownError) as raised:
        await gateway._build_and_send({})
    assert raised.value.stage == "receipt"
    assert raised.value.tx_hash == "0x" + "ab" * 32


def approving_gateway(sends) -> ContractGateway:
    gateway = gateway_with()
    token = SimpleNamespace(
        functions=SimpleNamespace(
            allowance=lambda owner, spender: SimpleNamespace(
                call=AsyncMock(return_value=0)
            ),
            approve=lambda spender, value: ("approve", value),
        )
    )
    gateway._erc20 = lambda address: token
    gateway._send = AsyncMock(side_effect=sends)
    gateway._wait_for_erc20_allowance = AsyncMock(return_value=5)
    return gateway


async def test_an_approval_with_an_unknown_outcome_is_not_reset_and_resent():
    unknown = TransactionOutcomeUnknownError("lost", stage="broadcast")
    gateway = approving_gateway([unknown])
    with pytest.raises(TransactionOutcomeUnknownError):
        await gateway.approve_erc20(TOKEN_ADDRESS, 5)
    assert [call.args[0] for call in gateway._send.await_args_list] == [("approve", 5)]


async def test_a_refused_approval_is_reset_to_zero_and_sent_again():
    gateway = approving_gateway([ContractError("USDT"), {"status": 1}, {"ok": 1}])
    assert await gateway.approve_erc20(TOKEN_ADDRESS, 5) == {"ok": 1}
    assert [call.args[0] for call in gateway._send.await_args_list] == [
        ("approve", 5),
        ("approve", 0),
        ("approve", 5),
    ]
