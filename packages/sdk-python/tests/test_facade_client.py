"""The facade over a real ``Client``: core is mocked at the HTTP layer and the
facilitator and chain behind it are stubbed, so every call the facade makes on
``Client`` is the real one."""

import base64
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from eth_account import Account
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    MOCK_CORE_CHAIN_ID,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    TOKEN_ADDRESS,
    TOKEN_DOMAIN,
    MockCore,
    attach_facilitator,
    ok,
)

import fourmica_sdk.client.ctx as ctx_module
from fourmica_sdk import FourMica
from fourmica_sdk.client.model import Route, TokenRoute
from fourmica_sdk.errors import InsufficientBalanceError
from fourmica_sdk.guarantee import clearing_house_domain_separator
from fourmica_sdk.models import ZERO_ADDRESS, PaymentRequest
from fourmica_sdk.rpc import RpcProxy

CAIP2 = f"eip155:{MOCK_CORE_CHAIN_ID}"
SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
URL = "https://api.example.com/data"
TX_HASH = "0x" + "cd" * 32
BALANCE_PATH = f"/core/users/{TEST_ADDRESS}/assets/{TOKEN_ADDRESS}"
NATIVE_BALANCE_PATH = f"/core/users/{TEST_ADDRESS}/assets/{ZERO_ADDRESS}"


class Stack:
    def __init__(self) -> None:
        self.total = 2_000_000
        self.facilitator_calls = []
        self.core = MockCore(
            {
                ("GET", "/core/tokens"): lambda r: ok(
                    {
                        "chain_id": MOCK_CORE_CHAIN_ID,
                        "tokens": [
                            {
                                "symbol": "USDC",
                                "address": TOKEN_ADDRESS,
                                "decimals": 6,
                                "domain_separator": TOKEN_DOMAIN,
                            }
                        ],
                    }
                ),
                ("GET", BALANCE_PATH): lambda r: ok(
                    {
                        "user_address": TEST_ADDRESS,
                        "asset_address": TOKEN_ADDRESS,
                        "total": str(self.total),
                        "locked": "500000",
                        "version": 1,
                        "updated_at": 0,
                    }
                ),
                # Core answers null for an asset the user holds nothing in.
                ("GET", NATIVE_BALANCE_PATH): lambda r: httpx.Response(
                    200, content=b"null"
                ),
                ("GET", "/core/cycles/active"): lambda r: ok(
                    {
                        "cycle_id": "0x" + "11" * 32,
                        "cycle_id_text": "t",
                        "asset_address": r.url.params["asset"],
                        "period_start": 1_700_000_000,
                        "period_end": int(time.time()) + 86_400,
                    }
                ),
            }
        )
        self.gateway = SimpleNamespace(
            erc20_balance=AsyncMock(return_value=100_000_000),
            native_balance=AsyncMock(return_value=10**18),
            withdrawal_grace_period=AsyncMock(return_value=3600),
            get_user_assets=AsyncMock(return_value=[]),
            aclose=AsyncMock(return_value=None),
        )

    def facilitator(self, request: httpx.Request) -> httpx.Response:
        self.facilitator_calls.append((request.url.path, json.loads(request.content)))
        # The facilitator's transaction lands, and core counts it.
        if request.url.path == "/deposit":
            self.total += 5_000_000
        return httpx.Response(200, json={"success": True, "transaction": TX_HASH})


@pytest.fixture
async def stack(monkeypatch):
    stack = Stack()
    transport = httpx.MockTransport(stack.core)
    monkeypatch.setattr(
        ctx_module, "RpcProxy", lambda url: RpcProxy(url, transport=transport)
    )
    return stack


async def connect(stack: Stack, http: httpx.AsyncClient = None) -> FourMica:
    client = await FourMica.connect(
        env={
            "FOURMICA_WALLET_PRIVATE_KEY": TEST_PRIVATE_KEY,
            "FOURMICA_RPC_URL": "https://core.example/",
            "FOURMICA_BEARER_TOKEN": "test-token",
        },
        http_client=http,
    )
    ctx = (await client.low_level())._ctx
    attach_facilitator(ctx, stack.facilitator)
    ctx._gateway = stack.gateway
    return client


async def test_names_a_self_hosted_core_by_its_chain(stack):
    async with await connect(stack) as client:
        assert client.network == CAIP2
        assert client.address == TEST_ADDRESS


async def test_reads_a_balance_from_core(stack):
    async with await connect(stack) as client:
        balance = await client.balance("USDC")
        assert (balance.total, balance.locked, balance.available) == ("2", "0.5", "1.5")
        assert stack.core.count("GET", "/core/tokens") == 1
        # Native ETH is not held, and the token list is not fetched again.
        assert set(await client.balance()) == {"USDC"}
        assert stack.core.count("GET", "/core/tokens") == 1


async def test_deposits_through_the_facilitator_and_waits_for_core(stack):
    async with await connect(stack) as client:
        result = await client.deposit("5 USDC")
    assert result.status == "spendable"
    assert result.route is TokenRoute.EIP3009
    assert result.tx_hash == TX_HASH
    assert result.explorer_url is None
    path, body = stack.facilitator_calls[0]
    assert path == "/deposit"
    assert (body["asset"], body["amount"]) == (TOKEN_ADDRESS, "5000000")
    assert body["authorization"]["from"] == TEST_ADDRESS


async def test_checks_the_wallet_on_chain_before_signing(stack):
    stack.gateway.erc20_balance.return_value = 1_000_000
    async with await connect(stack) as client:
        with pytest.raises(InsufficientBalanceError, match="holds 1 USDC"):
            await client.deposit("5 USDC")
    assert stack.facilitator_calls == []


async def test_requests_and_lists_a_withdrawal(stack):
    now = int(time.time())
    stack.gateway.get_user_assets.return_value = [
        {
            "asset": TOKEN_ADDRESS,
            "collateral": 2_000_000,
            "withdrawal_request_timestamp": now - 7200,
            "withdrawal_request_amount": 1_500_000,
        }
    ]
    async with await connect(stack) as client:
        requested = await client.withdraw("1.5 USDC")
        assert requested.route is Route.GASLESS
        path, body = stack.facilitator_calls[0]
        assert (path, body["action"]) == ("/withdraw", "request")
        assert int(body["authorization"]["amount"], 0) == 1_500_000

        (pending,) = await client.withdrawals()
        assert (pending.asset.symbol, pending.amount, pending.ready) == (
            "USDC",
            "1.5",
            True,
        )
        finalized = await client.finalize_withdrawal("USDC")
        assert finalized.tx_hash == TX_HASH
        assert stack.facilitator_calls[-1][1]["action"] == "finalize"


async def test_pays_a_402_with_a_payment_signed_by_the_wallet(stack):
    paid = []

    def seller(request: httpx.Request) -> httpx.Response:
        header = request.headers.get("PAYMENT-SIGNATURE")
        if header:
            paid.append(json.loads(base64.b64decode(header)))
            return httpx.Response(200, text="data")
        required = {
            "x402Version": 2,
            "resource": {"url": URL},
            "accepts": [
                {
                    "scheme": "4mica-credit",
                    "network": CAIP2,
                    "asset": TOKEN_ADDRESS,
                    "amount": "10000",
                    "payTo": SELLER,
                }
            ],
        }
        encoded = base64.b64encode(json.dumps(required).encode()).decode()
        return httpx.Response(402, headers={"PAYMENT-REQUIRED": encoded})

    async with httpx.AsyncClient(transport=httpx.MockTransport(seller)) as http:
        async with await connect(stack, http) as client:
            response = await client.fetch(URL)
            assert response.text == "data"
            assert client.payment_for(response).amount == "0.01"

    (envelope,) = paid
    signed = PaymentRequest.from_rpc(envelope["payload"])
    payload = signed.payload
    assert payload.user_address == TEST_ADDRESS
    assert payload.recipient_address == SELLER
    assert (payload.amount, payload.asset_address) == (10_000, TOKEN_ADDRESS)
    domain = clearing_house_domain_separator(MOCK_CORE_CHAIN_ID, CLEARING_HOUSE_ADDRESS)
    recovered = Account._recover_hash(
        payload.signing_digest(domain), signature=signed.signature
    )
    assert recovered == TEST_ADDRESS
