"""The Treasury as the SDK sees it: the vendored ABI, the reverts it maps to
typed errors, and the pool-share position it reads."""

import re
from pathlib import Path

import pytest
from eth_utils import keccak
from stubs import (
    CONTRACT_ADDRESS,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    TOKEN_ADDRESS,
    make_ctx,
)
from web3.exceptions import ContractCustomError

import fourmica_sdk.contract as contract_module
from fourmica_sdk.client.account import AccountClient
from fourmica_sdk.contract import ContractGateway
from fourmica_sdk.errors import (
    ContractError,
    DepositsDisabledError,
    InsufficientLiquidityError,
    PausedError,
    PoolInsolventError,
    StablecoinDepositsDisabledError,
)
from fourmica_sdk.utils import load_abi

GATEWAY_SOURCE = Path(contract_module.__file__).read_text()


def names(abi, kind):
    return {entry["name"] for entry in abi if entry.get("type") == kind}


def test_every_function_the_gateway_calls_is_in_a_vendored_abi():
    """A function dropped from the contract fails here rather than at the
    first call against a live deployment."""
    called = set(re.findall(r"functions\.([A-Za-z0-9_]+)\(", GATEWAY_SOURCE))
    called |= set(re.findall(r'_fn\(\s*"([A-Za-z0-9_]+)\(', GATEWAY_SOURCE))
    available = (
        names(load_abi("treasury.json"), "function")
        | names(load_abi("clearing_house.json"), "function")
        | names(load_abi("erc20.json"), "function")
    )
    assert called, "found no contract calls to check"
    assert called - available == set()


def test_the_pool_share_views_are_in_the_treasury_abi():
    functions = names(load_abi("treasury.json"), "function")
    for view in (
        "userShares",
        "totalUserShares",
        "protocolShares",
        "poolShares",
        "poolAssets",
        "strategy",
    ):
        assert view in functions
    # The Aave-era views are gone with the contract that had them.
    assert "totalUserScaledBalance" not in functions
    assert "getGuaranteeVersionConfig" not in functions


def test_every_mapped_revert_is_one_the_treasury_can_raise():
    errors = names(load_abi("treasury.json"), "error") | names(
        load_abi("clearing_house.json"), "error"
    )
    assert set(contract_module._REVERT_EXCEPTIONS) - errors == set()


def selector(name: str) -> str:
    for entry in load_abi("treasury.json"):
        if entry.get("type") == "error" and entry["name"] == name:
            types = ",".join(i["type"] for i in entry["inputs"])
            return "0x" + keccak(text=f"{name}({types})").hex()[:8]
    raise AssertionError(f"{name} is not a Treasury error")


@pytest.fixture
def gateway() -> ContractGateway:
    # Construction makes no network calls; only the error decoder is used.
    return ContractGateway(
        eth_rpc_url="http://localhost:8545/",
        private_key=TEST_PRIVATE_KEY,
        contract_address=CONTRACT_ADDRESS,
        chain_id=84532,
    )


@pytest.mark.parametrize(
    "name,expected",
    [
        ("InsufficientLiquidity", InsufficientLiquidityError),
        ("PoolInsolvent", PoolInsolventError),
        ("DepositsDisabled", DepositsDisabledError),
        ("StablecoinDepositsDisabled", StablecoinDepositsDisabledError),
        ("EnforcedPause", PausedError),
    ],
)
def test_treasury_reverts_decode_to_typed_errors(gateway, name, expected):
    err = gateway._decode_contract_error(ContractCustomError(selector(name)))
    assert type(err) is expected
    assert name in str(err)


def test_an_unmapped_treasury_revert_is_named(gateway):
    err = gateway._decode_contract_error(ContractCustomError(selector("PoolEmpty")))
    assert type(err) is ContractError
    assert "PoolEmpty" in str(err)


class PositionGateway:
    """Answers each view with a distinct value so a crossed wire shows."""

    async def principal_balance(self, user, asset):
        return 1

    async def guarantee_capacity(self, user, asset):
        return 2

    async def gross_yield(self, user, asset):
        return 3

    async def protocol_yield_share(self, user, asset):
        return 4

    async def user_net_yield(self, user, asset):
        return 5

    async def withdrawable_balance(self, user, asset):
        return 6

    async def user_shares(self, user, token):
        assert user == TEST_ADDRESS
        return 7

    async def total_user_shares(self, token):
        return 8

    async def protocol_shares(self, token):
        return 9

    async def pool_shares(self, token):
        return 10

    async def pool_assets(self, token):
        return 11

    async def strategy(self, token):
        return "0x0000000000000000000000000000000000004626"

    async def aclose(self):
        pass


async def test_stablecoin_position_reads_the_pool_shares():
    position = await AccountClient(
        make_ctx(gateway=PositionGateway())
    ).stablecoin_position(TOKEN_ADDRESS)

    assert position.asset == TOKEN_ADDRESS
    assert (position.principal, position.withdrawable_balance) == (1, 6)
    assert position.user_shares == 7
    assert position.total_user_shares == 8
    assert position.protocol_shares == 9
    assert position.pool_shares == 10
    assert position.pool_assets == 11
    assert position.strategy == "0x0000000000000000000000000000000000004626"
