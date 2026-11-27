from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from stubs import TEST_ADDRESS, TOKEN_ADDRESS, FakeRpc, make_ctx, supported_tokens

from fourmica_sdk import Client
from fourmica_sdk.client.account import AccountClient
from fourmica_sdk.client.model import Asset, AssetPosition, StablecoinPosition
from fourmica_sdk.client.tokens import TokensClient
from fourmica_sdk.errors import ClientError
from fourmica_sdk.models import (
    AssetBalanceInfo,
    PaymentRequestPayload,
    TxReceiptWaitOptions,
)

ZERO = "0x0000000000000000000000000000000000000000"
RECIPIENT = "0x00000000000000000000000000000000000000Be"
STRATEGY = "0x2222222222222222222222222222222222222222"


def views_gateway(**overrides):
    values = {
        "principal_balance": 11,
        "guarantee_capacity": 12,
        "gross_yield": 13,
        "protocol_yield_share": 14,
        "user_net_yield": 15,
        "withdrawable_balance": 16,
        "user_shares": 17,
        "total_user_shares": 18,
        "protocol_shares": 19,
        "pool_shares": 20,
        "pool_assets": 21,
        "strategy": STRATEGY,
        "get_user_assets": [],
        "approve_erc20": {"transactionHash": "0x" + "ab" * 32},
    }
    values.update(overrides)
    return SimpleNamespace(
        **{name: AsyncMock(return_value=value) for name, value in values.items()}
    )


def account_with(gateway=None, rpc=None):
    gateway = gateway or views_gateway()
    return AccountClient(make_ctx(rpc=rpc, gateway=gateway)), gateway


async def test_assets_are_parsed_from_the_gateway_into_checksummed_positions():
    raw = [
        {
            "asset": TOKEN_ADDRESS.lower(),
            "collateral": "0x10",
            "withdrawal_request_amount": "5",
            "withdrawal_request_timestamp": "1700000000",
        },
        {
            "asset": ZERO,
            "collateral": 2**256 - 1,
            "withdrawal_request_amount": 0,
            "withdrawal_request_timestamp": 0,
        },
    ]
    account, gateway = account_with(views_gateway(get_user_assets=raw))
    positions = await account.assets()
    gateway.get_user_assets.assert_awaited_once_with(TEST_ADDRESS)
    assert positions == [
        AssetPosition(TOKEN_ADDRESS, 16, 5, 1_700_000_000),
        AssetPosition(ZERO, 2**256 - 1, 0, 0),
    ]


async def test_an_account_with_no_assets_has_no_positions():
    account, _ = account_with()
    assert await account.assets() == []


@pytest.mark.parametrize(
    ("field", "value"),
    [("collateral", -1), ("withdrawal_request_amount", "nope"), ("asset", "0x12")],
)
async def test_a_malformed_asset_row_from_the_gateway_is_refused(field, value):
    row = {
        "asset": TOKEN_ADDRESS,
        "collateral": 1,
        "withdrawal_request_amount": 0,
        "withdrawal_request_timestamp": 0,
    }
    row[field] = value
    account, _ = account_with(views_gateway(get_user_assets=[row]))
    with pytest.raises(ValueError, match=r"negative|invalid"):
        await account.assets()


@pytest.mark.parametrize("method", ["principal_balance", "withdrawable_balance"])
@pytest.mark.parametrize(
    ("asset", "expected"),
    [(None, ZERO), (ZERO, ZERO), (TOKEN_ADDRESS.lower(), TOKEN_ADDRESS)],
    ids=["default", "zero", "lowercase"],
)
async def test_balances_are_read_for_the_signer_and_the_coerced_asset(
    method, asset, expected
):
    account, gateway = account_with()
    value = await getattr(account, method)(asset)
    getattr(gateway, method).assert_awaited_once_with(TEST_ADDRESS, expected)
    assert value == {"principal_balance": 11, "withdrawable_balance": 16}[method]


@pytest.mark.parametrize("method", ["principal_balance", "withdrawable_balance"])
async def test_a_balance_for_a_malformed_asset_is_refused_before_reading(method):
    account, gateway = account_with()
    with pytest.raises(ValueError, match="invalid address"):
        await getattr(account, method)("0xabc")
    getattr(gateway, method).assert_not_awaited()


async def test_a_stablecoin_position_gathers_every_view_for_the_token():
    account, gateway = account_with()
    position = await account.stablecoin_position(TOKEN_ADDRESS.lower())
    assert position == StablecoinPosition(
        asset=TOKEN_ADDRESS,
        principal=11,
        guarantee_capacity=12,
        gross_yield=13,
        protocol_yield_share=14,
        user_net_yield=15,
        withdrawable_balance=16,
        user_shares=17,
        total_user_shares=18,
        protocol_shares=19,
        pool_shares=20,
        pool_assets=21,
        strategy=STRATEGY,
    )
    for per_user in (
        "principal_balance",
        "guarantee_capacity",
        "gross_yield",
        "protocol_yield_share",
        "user_net_yield",
        "withdrawable_balance",
        "user_shares",
    ):
        getattr(gateway, per_user).assert_awaited_once_with(TEST_ADDRESS, TOKEN_ADDRESS)
    for per_pool in (
        "total_user_shares",
        "protocol_shares",
        "pool_shares",
        "pool_assets",
        "strategy",
    ):
        getattr(gateway, per_pool).assert_awaited_once_with(TOKEN_ADDRESS)


async def test_an_idle_pool_reports_the_zero_address_as_its_strategy():
    account, _ = account_with(views_gateway(strategy=ZERO, pool_assets=0))
    position = await account.stablecoin_position(TOKEN_ADDRESS)
    assert position.strategy == ZERO
    assert position.pool_assets == 0


@pytest.mark.parametrize("token", ["", "0x1", "USDC"])
async def test_a_stablecoin_position_for_a_malformed_token_is_refused(token):
    account, gateway = account_with()
    with pytest.raises(ValueError, match="invalid address"):
        await account.stablecoin_position(token)
    gateway.principal_balance.assert_not_awaited()


async def test_a_view_failure_aborts_the_stablecoin_position():
    gateway = views_gateway()
    gateway.gross_yield = AsyncMock(side_effect=RuntimeError("node down"))
    account, _ = account_with(gateway)
    with pytest.raises(RuntimeError, match="node down"):
        await account.stablecoin_position(TOKEN_ADDRESS)
    gateway.user_net_yield.assert_not_awaited()


@pytest.mark.parametrize(
    ("asset", "expected"),
    [(None, ZERO), (Asset.erc20(TOKEN_ADDRESS.lower()), TOKEN_ADDRESS)],
    ids=["native", "erc20"],
)
async def test_an_asset_balance_is_asked_of_core_for_the_signer(asset, expected):
    info = AssetBalanceInfo(TEST_ADDRESS, expected, 5, 1, 2, 3)
    rpc = FakeRpc(asset_balance=info)
    account, _ = account_with(rpc=rpc)
    assert await account.asset_balance(asset) is info
    assert rpc.calls == [("asset_balance", TEST_ADDRESS, expected)]


async def test_an_asset_balance_is_none_when_the_signer_holds_nothing():
    account, _ = account_with(rpc=FakeRpc(asset_balance=None))
    assert await account.asset_balance(TOKEN_ADDRESS) is None


async def test_supported_tokens_come_straight_from_core():
    tokens = supported_tokens()
    client = TokensClient(make_ctx(rpc=FakeRpc(supported_tokens=tokens)))
    assert await client.supported() is tokens


async def test_a_token_approval_is_forwarded_with_its_wait_options():
    gateway = views_gateway()
    client = TokensClient(make_ctx(gateway=gateway))
    options = TxReceiptWaitOptions(timeout_secs=4)
    receipt = await client.approve(TOKEN_ADDRESS, 2**256 - 1, options)
    gateway.approve_erc20.assert_awaited_once_with(
        TOKEN_ADDRESS, 2**256 - 1, wait_options=options
    )
    assert receipt == {"transactionHash": "0x" + "ab" * 32}


async def test_a_token_approval_already_covered_returns_none():
    gateway = views_gateway(approve_erc20=None)
    client = TokensClient(make_ctx(gateway=gateway))
    assert await client.approve(TOKEN_ADDRESS, 1) is None
    gateway.approve_erc20.assert_awaited_once_with(TOKEN_ADDRESS, 1, wait_options=None)


def client_with(auth_session=None, gateway=None):
    ctx = make_ctx(gateway=gateway)
    ctx.auth_session = auth_session
    return Client(ctx), ctx


def test_a_client_exposes_its_context_and_signer():
    client, ctx = client_with()
    assert client.ctx is ctx
    assert client.rpc is ctx.rpc
    assert client.signer_address == TEST_ADDRESS
    assert client.public_params is ctx.public_params
    assert client.deposit._ctx is ctx
    assert client.withdraw._ctx is ctx
    assert client.tokens._ctx is ctx
    assert client.account._ctx is ctx


async def test_login_without_auth_configured_is_refused():
    client, _ = client_with()
    with pytest.raises(ClientError, match="auth is not configured"):
        await client.login()


async def test_login_returns_the_tokens_from_the_auth_session():
    session = SimpleNamespace(login=AsyncMock(return_value="tokens"))
    client, _ = client_with(session)
    assert await client.login() == "tokens"
    session.login.assert_awaited_once_with()


async def test_logout_without_auth_configured_is_a_no_op():
    client, _ = client_with()
    assert await client.logout() is None


async def test_logout_ends_the_auth_session():
    session = SimpleNamespace(logout=AsyncMock(return_value=None))
    client, _ = client_with(session)
    await client.logout()
    session.logout.assert_awaited_once_with()


async def test_new_payment_delegates_with_the_asset_defaulting_to_native():
    client, _ = client_with()
    client.payment.new_payment = AsyncMock(return_value="payload")
    assert await client.new_payment(RECIPIENT, 5) == "payload"
    assert await client.new_payment(RECIPIENT, 6, TOKEN_ADDRESS) == "payload"
    assert [call.args for call in client.payment.new_payment.await_args_list] == [
        (RECIPIENT, 5, None),
        (RECIPIENT, 6, TOKEN_ADDRESS),
    ]


async def test_sign_payment_matches_signing_through_the_payment_client():
    client, _ = client_with()
    payload = PaymentRequestPayload.new(
        user_address=TEST_ADDRESS,
        recipient_address=RECIPIENT,
        cycle_id="0x" + "11" * 32,
        req_id=1,
        amount=10,
        timestamp=1_700_000_000,
        salt=b"\x01" * 32,
    )
    signed = await client.sign_payment(payload)
    assert signed.payload is payload
    assert signed.signature == (await client.payment.sign_request(payload)).signature


async def test_leaving_the_context_closes_every_resource():
    session = SimpleNamespace(aclose=AsyncMock())
    gateway = SimpleNamespace(aclose=AsyncMock())
    client, ctx = client_with(session, gateway)
    ctx.rpc.aclose = AsyncMock()
    ctx.facilitator.aclose = AsyncMock()
    async with client as entered:
        assert entered is client
    ctx.rpc.aclose.assert_awaited_once()
    ctx.facilitator.aclose.assert_awaited_once()
    session.aclose.assert_awaited_once()
    gateway.aclose.assert_awaited_once()


async def test_leaving_the_context_on_an_error_still_closes_and_reraises():
    client, ctx = client_with()
    ctx.rpc.aclose = AsyncMock()
    ctx.facilitator.aclose = AsyncMock()
    with pytest.raises(KeyError):
        async with client:
            raise KeyError("boom")
    ctx.rpc.aclose.assert_awaited_once()
