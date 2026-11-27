import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import aiohttp
import pytest
from eth_abi import encode
from eth_utils import keccak, to_checksum_address
from hexbytes import HexBytes
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    CONTRACT_ADDRESS,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    TOKEN_ADDRESS,
)
from web3.exceptions import (
    ContractCustomError,
    RequestTimedOut,
    Web3Exception,
    Web3RPCError,
)

import fourmica_sdk.contract as contract_module
from fourmica_sdk.contract import ContractGateway, _lost_broadcast
from fourmica_sdk.errors import (
    AmountZeroError,
    ContractError,
    DepositsDisabledError,
    GracePeriodNotElapsedError,
    InsufficientAvailableError,
    InsufficientLiquidityError,
    NoWithdrawalRequestedError,
    PausedError,
    PoolInsolventError,
    RevertedOnChainError,
    StablecoinDepositsDisabledError,
    TransactionOutcomeUnknownError,
    TransferFailedError,
    UnsupportedAssetError,
    ValueMismatchError,
    ZeroCollateralCreditError,
)
from fourmica_sdk.models import TxReceiptWaitOptions
from fourmica_sdk.utils import ValidationError

USER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
SPENDER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
OTHER_TOKEN = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a"
CYCLE_ID = b"\x11" * 32
PROOF = [b"\x22" * 32, b"\x33" * 32]
TX_HASH = HexBytes(b"\xab" * 32)
TX_HASH_HEX = "0x" + "ab" * 32
CLEARING_HOUSE = to_checksum_address(CLEARING_HOUSE_ADDRESS)


def make_gateway() -> ContractGateway:
    return ContractGateway(
        eth_rpc_url="http://localhost:8545/",
        private_key=TEST_PRIVATE_KEY,
        contract_address=CONTRACT_ADDRESS,
        chain_id=84532,
    )


class FakeEth:
    def __init__(
        self,
        chain_id=84532,
        gas_price=7,
        nonce=3,
        balance=0,
        send=None,
        receipt=None,
    ) -> None:
        self._chain_id = chain_id
        self._gas_price = gas_price
        self.nonce = nonce
        self.balance = balance
        self.sent: list = []
        self.receipt_calls: list = []
        self.send = send
        self.receipt = receipt if receipt is not None else {"status": 1}

    @property
    def chain_id(self):
        async def read():
            if isinstance(self._chain_id, Exception):
                raise self._chain_id
            return self._chain_id

        return read()

    @property
    def gas_price(self):
        async def read():
            if isinstance(self._gas_price, Exception):
                raise self._gas_price
            return self._gas_price

        return read()

    async def get_transaction_count(self, address):
        await asyncio.sleep(0)
        return self.nonce

    async def get_balance(self, address):
        if isinstance(self.balance, Exception):
            raise self.balance
        return self.balance

    async def send_raw_transaction(self, raw):
        self.sent.append(raw)
        if self.send is not None:
            return await self.send(raw)
        self.nonce += 1
        return TX_HASH

    async def wait_for_transaction_receipt(self, tx_hash, timeout, poll_latency):
        self.receipt_calls.append((tx_hash, timeout, poll_latency))
        if isinstance(self.receipt, Exception):
            raise self.receipt
        return self.receipt


def wire(gateway: ContractGateway, eth: FakeEth) -> FakeEth:
    gateway.w3 = SimpleNamespace(eth=eth)
    gateway.account = SimpleNamespace(
        address=gateway.account.address,
        sign_transaction=lambda txn: SimpleNamespace(raw_transaction=b"raw"),
    )
    return eth


class FakeFunc:
    def __init__(
        self, call_error=None, estimate=21_000, built=None, awaitable_build=False
    ):
        self.call_error = call_error
        self.estimate = estimate
        self.built = built
        self.awaitable_build = awaitable_build
        self.call_params: list = []
        self.estimate_params: list = []
        self.build_params: list = []

    async def call(self, params):
        self.call_params.append(params)
        if self.call_error is not None:
            raise self.call_error

    async def estimate_gas(self, params):
        self.estimate_params.append(dict(params))
        if isinstance(self.estimate, BaseException):
            raise self.estimate
        return self.estimate

    def build_transaction(self, tx):
        self.build_params.append(dict(tx))
        result = self.built if self.built is not None else {**tx, "data": "0x"}
        if self.awaitable_build:

            async def finish():
                return result

            return finish()
        return result


class ViewCall:
    def __init__(self, name, args, outcome, log):
        self.name = name
        self.args = args
        self.outcome = outcome
        self.log = log

    async def call(self, *args, **kwargs):
        self.log.append((self.name, self.args, kwargs))
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return self.outcome


class ViewContract:
    def __init__(self, real, outcomes):
        self.real = real
        self.outcomes = outcomes
        self.log: list = []
        self.functions = SimpleNamespace()
        for name in outcomes:
            setattr(self.functions, name, self._factory(name))

    def _factory(self, name):
        def build(*args):
            getattr(self.real.functions, name)(*args)._encode_transaction_data()
            return ViewCall(name, args, self.outcomes[name], self.log)

        return build


def capture_sends(gateway: ContractGateway) -> AsyncMock:
    sender = AsyncMock(return_value={"transactionHash": TX_HASH_HEX, "status": 1})
    gateway._send = sender
    return sender


def custom_error(name: str, types: list, values: list) -> ContractCustomError:
    selector = keccak(text=f"{name}({','.join(types)})")[:4]
    data = "0x" + (selector + encode(types, values)).hex()
    return ContractCustomError(data, data=data)


def response_error(status: int) -> aiohttp.ClientResponseError:
    return aiohttp.ClientResponseError(
        request_info=MagicMock(), history=(), status=status, message="node"
    )


def test_the_contract_address_is_stored_in_checksum_form_whatever_the_input_case():
    gateway = ContractGateway(
        eth_rpc_url="http://localhost:8545/",
        private_key=TEST_PRIVATE_KEY,
        contract_address=CONTRACT_ADDRESS.lower(),
        chain_id=84532,
    )
    assert gateway.contract_address == CONTRACT_ADDRESS
    assert gateway.contract.address == CONTRACT_ADDRESS
    assert gateway.account.address == TEST_ADDRESS
    assert gateway.chain_id == 84532
    assert len(gateway._error_abis) == 3


def test_the_provider_is_given_the_ssl_context_when_one_is_available():
    gateway = make_gateway()
    assert set(gateway.w3.provider._request_kwargs) == {"ssl"}
    assert gateway.w3.provider.endpoint_uri == "http://localhost:8545/"


def test_a_malformed_contract_address_is_rejected_at_construction():
    with pytest.raises(ValidationError, match="invalid address"):
        ContractGateway(
            eth_rpc_url="http://localhost:8545/",
            private_key=TEST_PRIVATE_KEY,
            contract_address="0x1234",
            chain_id=84532,
        )


def test_a_malformed_private_key_is_rejected_at_construction():
    with pytest.raises(ValueError):  # noqa: PT011
        ContractGateway(
            eth_rpc_url="http://localhost:8545/",
            private_key="0x1234",
            contract_address=CONTRACT_ADDRESS,
            chain_id=84532,
        )


async def test_a_matching_chain_id_passes_verification():
    gateway = make_gateway()
    wire(gateway, FakeEth(chain_id=84532))
    await gateway.verify_chain_id()


async def test_a_chain_id_configured_as_text_still_matches_the_numeric_answer():
    gateway = make_gateway()
    gateway.chain_id = "84532"
    wire(gateway, FakeEth(chain_id=84532))
    await gateway.verify_chain_id()


async def test_a_provider_on_another_chain_fails_verification_naming_both_ids():
    gateway = make_gateway()
    wire(gateway, FakeEth(chain_id=1))
    with pytest.raises(ContractError) as raised:
        await gateway.verify_chain_id()
    assert str(raised.value) == (
        "chain id mismatch between core service (84532) and Ethereum provider (1)"
    )


def test_a_function_is_looked_up_by_its_full_signature_to_pick_an_overload():
    gateway = make_gateway()
    with_token = gateway._fn("requestWithdrawal(address,uint256)")(TOKEN_ADDRESS, 5)
    native = gateway._fn("requestWithdrawal(uint256)")(5)
    assert with_token.abi_element_identifier == "requestWithdrawal(address,uint256)"
    assert native.abi_element_identifier == "requestWithdrawal(uint256)"
    assert native.args == (5,)


def test_a_contract_without_signature_lookup_falls_back_to_indexing_functions():
    gateway = make_gateway()
    real = gateway.contract
    gateway.contract = SimpleNamespace(functions=real.functions)
    func = gateway._fn("cancelWithdrawal(address)")(TOKEN_ADDRESS)
    assert func.abi_element_identifier == "cancelWithdrawal(address)"
    assert func.args == (TOKEN_ADDRESS,)


@pytest.mark.parametrize(
    ("name", "types", "values", "error_type"),
    [
        ("AmountZero", [], [], AmountZeroError),
        ("InsufficientAvailable", [], [], InsufficientAvailableError),
        ("NoWithdrawalRequested", [], [], NoWithdrawalRequestedError),
        ("GracePeriodNotElapsed", [], [], GracePeriodNotElapsedError),
        ("TransferFailed", [], [], TransferFailedError),
        (
            "InsufficientLiquidity",
            ["address", "uint256", "uint256"],
            [TOKEN_ADDRESS, 5, 1],
            InsufficientLiquidityError,
        ),
        ("PoolInsolvent", ["address"], [TOKEN_ADDRESS], PoolInsolventError),
        ("DepositsDisabled", [], [], DepositsDisabledError),
        (
            "StablecoinDepositsDisabled",
            ["address"],
            [TOKEN_ADDRESS],
            StablecoinDepositsDisabledError,
        ),
        ("EnforcedPause", [], [], PausedError),
        ("ValueMismatch", ["uint256", "uint256"], [5, 4], ValueMismatchError),
        (
            "ZeroCollateralCredit",
            ["address", "uint256"],
            [TOKEN_ADDRESS, 1],
            ZeroCollateralCreditError,
        ),
    ],
)
def test_each_known_revert_is_decoded_to_its_typed_error(
    name, types, values, error_type
):
    decoded = make_gateway()._decode_contract_error(custom_error(name, types, values))
    assert type(decoded) is error_type
    assert str(decoded) == f"{name}()"


def test_an_unsupported_asset_revert_becomes_an_unsupported_asset_error():
    decoded = make_gateway()._decode_contract_error(
        custom_error("UnsupportedAsset", ["address"], [TOKEN_ADDRESS])
    )
    assert type(decoded) is UnsupportedAssetError
    assert decoded.asset == "unknown"
    assert str(decoded) == "unsupported asset: unknown"


@pytest.mark.parametrize(
    ("name", "types", "values"),
    [
        ("InvalidProof", [], []),
        ("AlreadyPaid", ["bytes32", "address"], [CYCLE_ID, TEST_ADDRESS]),
        ("ZeroAddress", [], []),
    ],
)
def test_a_revert_in_the_abis_without_a_typed_error_keeps_its_name(name, types, values):
    decoded = make_gateway()._decode_contract_error(custom_error(name, types, values))
    assert type(decoded) is ContractError
    assert str(decoded) == f"{name}()"


def test_a_selector_in_no_abi_is_reported_as_an_unknown_custom_error():
    error = ContractCustomError("0xdeadbeef00", data="0xdeadbeef00")
    decoded = make_gateway()._decode_contract_error(error)
    assert type(decoded) is ContractError
    assert str(decoded) == "unknown custom error: 0xdeadbeef"


def test_a_selector_without_the_hex_prefix_is_still_decoded():
    data = keccak(text="AmountZero()")[:4].hex()
    decoded = make_gateway()._decode_contract_error(ContractCustomError(data))
    assert type(decoded) is AmountZeroError


@pytest.mark.parametrize(
    "error",
    [
        ContractCustomError("0x1234"),
        ContractCustomError(),
        ContractCustomError(b"\x12\x34\x56\x78"),
    ],
    ids=["short-selector", "no-args", "bytes-arg"],
)
def test_a_custom_error_without_a_readable_selector_keeps_its_own_text(error):
    decoded = make_gateway()._decode_contract_error(error)
    assert type(decoded) is ContractError
    assert str(decoded) == str(error)


def test_a_plain_exception_is_wrapped_with_its_message():
    decoded = make_gateway()._decode_contract_error(RuntimeError("execution reverted"))
    assert type(decoded) is ContractError
    assert str(decoded) == "execution reverted"


@pytest.mark.parametrize(
    ("error", "lost"),
    [
        (response_error(500), True),
        (response_error(503), True),
        (response_error(408), True),
        (response_error(302), True),
        (response_error(400), False),
        (response_error(404), False),
        (response_error(429), False),
        (response_error(499), False),
        (aiohttp.ClientConnectionError("reset"), True),
        (aiohttp.ServerDisconnectedError(), True),
        (asyncio.TimeoutError(), True),
        (TimeoutError(), True),
        (RequestTimedOut("timed out"), True),
        (
            Web3RPCError("x", rpc_response={"error": {"code": -32603}}),
            True,
        ),
        (
            Web3RPCError("x", rpc_response={"error": {"code": -32000}}),
            False,
        ),
        (Web3RPCError("x", rpc_response={"error": "internal"}), False),
        (Web3RPCError("x", rpc_response=None), False),
        (Web3RPCError("x", rpc_response={}), False),
        (ValueError("bad"), False),
        (ContractCustomError("0xdeadbeef"), False),
    ],
)
def test_only_answers_that_may_hide_an_accepted_broadcast_count_as_lost(error, lost):
    assert _lost_broadcast(error) is lost


def test_a_web3_rpc_error_with_a_non_mapping_response_is_not_lost():
    error = Web3RPCError("x")
    error.rpc_response = ["not", "a", "mapping"]
    assert _lost_broadcast(error) is False


async def test_a_provider_with_an_async_disconnect_is_awaited_on_close():
    gateway = make_gateway()
    disconnect = AsyncMock()
    close = AsyncMock()
    gateway.w3 = SimpleNamespace(
        provider=SimpleNamespace(disconnect=disconnect, aclose=close)
    )
    await gateway.aclose()
    disconnect.assert_awaited_once()
    close.assert_not_called()


async def test_a_provider_with_a_sync_disconnect_is_called_without_awaiting():
    gateway = make_gateway()
    disconnect = MagicMock(return_value=None)
    close = MagicMock()
    gateway.w3 = SimpleNamespace(
        provider=SimpleNamespace(disconnect=disconnect, close=close)
    )
    await gateway.aclose()
    disconnect.assert_called_once_with()
    close.assert_not_called()


async def test_a_provider_without_disconnect_is_closed_through_aclose():
    gateway = make_gateway()
    close = AsyncMock()
    sync_close = MagicMock()
    gateway.w3 = SimpleNamespace(
        provider=SimpleNamespace(disconnect=None, aclose=close, close=sync_close)
    )
    await gateway.aclose()
    close.assert_awaited_once()
    sync_close.assert_not_called()


async def test_a_provider_with_only_a_sync_close_is_closed_with_it():
    gateway = make_gateway()
    close = MagicMock(return_value=None)
    gateway.w3 = SimpleNamespace(provider=SimpleNamespace(close=close))
    await gateway.aclose()
    close.assert_called_once_with()


async def test_a_provider_with_only_an_async_close_is_awaited():
    gateway = make_gateway()
    close = AsyncMock()
    gateway.w3 = SimpleNamespace(provider=SimpleNamespace(close=close))
    await gateway.aclose()
    close.assert_awaited_once()


async def test_a_provider_with_nothing_to_close_is_left_alone():
    gateway = make_gateway()
    gateway.w3 = SimpleNamespace(provider=SimpleNamespace(close="not callable"))
    await gateway.aclose()


async def test_a_missing_provider_makes_close_a_no_op():
    gateway = make_gateway()
    gateway.w3 = SimpleNamespace()
    await gateway.aclose()


async def test_closing_a_real_gateway_disconnects_its_http_provider():
    gateway = make_gateway()
    await gateway.aclose()
    await gateway.aclose()


async def test_a_transaction_that_cannot_be_signed_is_a_contract_error():
    gateway = make_gateway()
    wire(gateway, FakeEth())

    def refuse(txn):
        raise TypeError("missing gas")

    gateway.account.sign_transaction = refuse
    with pytest.raises(ContractError, match="missing gas") as raised:
        await gateway._build_and_send({})
    assert isinstance(raised.value.__cause__, TypeError)


async def test_a_legacy_signed_transaction_with_camel_case_raw_bytes_is_sent():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    gateway.account.sign_transaction = lambda txn: SimpleNamespace(
        rawTransaction=b"legacy"
    )
    receipt = await gateway._build_and_send({})
    assert eth.sent == [b"legacy"]
    assert receipt["transactionHash"] == TX_HASH_HEX


async def test_a_signed_transaction_without_raw_bytes_is_never_broadcast():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    gateway.account.sign_transaction = lambda txn: SimpleNamespace()
    with pytest.raises(ContractError, match="missing raw_transaction"):
        await gateway._build_and_send({})
    assert eth.sent == []


async def test_a_broadcast_refused_with_a_custom_error_is_decoded():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    eth.send = AsyncMock(side_effect=custom_error("EnforcedPause", [], []))
    with pytest.raises(PausedError):
        await gateway._build_and_send({})


async def test_a_lost_broadcast_names_the_underlying_failure():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    eth.send = AsyncMock(side_effect=response_error(502))
    with pytest.raises(TransactionOutcomeUnknownError) as raised:
        await gateway._build_and_send({})
    assert "502" in str(raised.value)
    assert "may or may not have been accepted" in str(raised.value)
    assert isinstance(raised.value.__cause__, aiohttp.ClientResponseError)


@pytest.mark.parametrize(
    ("tx_hash", "expected"),
    [
        (TX_HASH, TX_HASH_HEX),
        (bytes(TX_HASH), TX_HASH_HEX),
        (TX_HASH_HEX, TX_HASH_HEX),
        ("ab" * 32, TX_HASH_HEX),
    ],
    ids=["hexbytes", "bytes", "prefixed-text", "bare-text"],
)
async def test_the_receipt_carries_the_hash_with_exactly_one_hex_prefix(
    tx_hash, expected
):
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    eth.send = AsyncMock(return_value=tx_hash)
    receipt = await gateway._build_and_send({})
    assert receipt["transactionHash"] == expected
    assert eth.receipt_calls[0][0] == tx_hash


async def test_custom_wait_options_reach_the_receipt_poll():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    await gateway._build_and_send(
        {}, TxReceiptWaitOptions(timeout_secs=5, poll_latency_secs=1)
    )
    assert eth.receipt_calls == [(TX_HASH, 5, 1)]


async def test_the_default_wait_options_reach_the_receipt_poll():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    await gateway._build_and_send({})
    assert eth.receipt_calls == [(TX_HASH, 60, 2)]


@pytest.mark.parametrize("status", [0, "0x0", False])
async def test_every_encoding_of_a_failed_status_is_a_revert(status):
    gateway = make_gateway()
    wire(gateway, FakeEth(receipt={"status": status}))
    with pytest.raises(RevertedOnChainError) as raised:
        await gateway._build_and_send({})
    assert raised.value.tx_hash == TX_HASH_HEX
    assert str(raised.value) == f"transaction {TX_HASH_HEX} reverted on-chain"


@pytest.mark.parametrize("receipt", [{"status": 1}, {"status": "0x1"}, {}])
async def test_a_receipt_without_a_failed_status_is_returned_with_its_fields(
    receipt,
):
    gateway = make_gateway()
    wire(gateway, FakeEth(receipt={**receipt, "blockNumber": 9}))
    result = await gateway._build_and_send({})
    assert result == {**receipt, "blockNumber": 9, "transactionHash": TX_HASH_HEX}


async def test_a_missing_receipt_reports_the_hash_that_may_still_be_mined():
    gateway = make_gateway()
    wire(gateway, FakeEth(receipt=TimeoutError("slow")))
    with pytest.raises(TransactionOutcomeUnknownError) as raised:
        await gateway._build_and_send({})
    assert raised.value.stage == "receipt"
    assert raised.value.tx_hash == TX_HASH_HEX
    assert TX_HASH_HEX in str(raised.value)


async def test_a_preflight_without_value_simulates_from_the_signer_only():
    gateway = make_gateway()
    wire(gateway, FakeEth(nonce=4, gas_price=9))
    func = FakeFunc(estimate=100_000)
    tx = await gateway._prepare_tx(func)
    assert func.call_params == [{"from": TEST_ADDRESS}]
    assert tx == {
        "from": TEST_ADDRESS,
        "nonce": 4,
        "chainId": 84532,
        "value": 0,
        "gas": 120_000,
        "gasPrice": 9,
    }
    assert func.estimate_params == [
        {"from": TEST_ADDRESS, "nonce": 4, "chainId": 84532, "value": 0}
    ]


async def test_a_preflight_with_value_simulates_and_sends_that_value():
    gateway = make_gateway()
    wire(gateway, FakeEth())
    func = FakeFunc(estimate=10)
    tx = await gateway._prepare_tx(func, value=5)
    assert func.call_params == [{"from": TEST_ADDRESS, "value": 5}]
    assert tx["value"] == 5
    assert tx["gas"] == 12


async def test_a_gas_estimate_with_a_fraction_is_rounded_down_after_headroom():
    gateway = make_gateway()
    wire(gateway, FakeEth())
    tx = await gateway._prepare_tx(FakeFunc(estimate=21_001))
    assert tx["gas"] == int(21_001 * 1.2)


async def test_a_reverting_simulation_is_decoded_and_reads_no_nonce():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth())
    eth.get_transaction_count = AsyncMock(return_value=0)
    func = FakeFunc(call_error=custom_error("InsufficientAvailable", [], []))
    with pytest.raises(InsufficientAvailableError):
        await gateway._prepare_tx(func)
    eth.get_transaction_count.assert_not_called()
    assert func.estimate_params == []


@pytest.mark.parametrize(
    "error",
    [ValueError("estimate"), Web3Exception("node"), asyncio.TimeoutError()],
)
async def test_a_failed_gas_estimate_falls_back_to_a_fixed_limit(error):
    gateway = make_gateway()
    wire(gateway, FakeEth())
    tx = await gateway._prepare_tx(FakeFunc(estimate=error))
    assert tx["gas"] == 300_000


async def test_an_unexpected_estimate_failure_is_not_swallowed():
    gateway = make_gateway()
    wire(gateway, FakeEth())
    with pytest.raises(RuntimeError, match="bug"):
        await gateway._prepare_tx(FakeFunc(estimate=RuntimeError("bug")))


@pytest.mark.parametrize(
    "error", [ValueError("no price"), aiohttp.ClientConnectionError("down")]
)
async def test_an_unreadable_gas_price_leaves_pricing_to_the_node(error):
    gateway = make_gateway()
    wire(gateway, FakeEth(gas_price=error))
    tx = await gateway._prepare_tx(FakeFunc())
    assert "gasPrice" not in tx
    assert tx["gas"] == 25_200


async def test_a_synchronous_transaction_builder_is_used_as_is():
    gateway = make_gateway()
    func = FakeFunc(built={"data": "0x01"})
    assert await gateway._build_tx(func, {"nonce": 1}) == {"data": "0x01"}
    assert func.build_params == [{"nonce": 1}]


async def test_an_asynchronous_transaction_builder_is_awaited():
    gateway = make_gateway()
    func = FakeFunc(built={"data": "0x02"}, awaitable_build=True)
    assert await gateway._build_tx(func, {"nonce": 1}) == {"data": "0x02"}


async def test_a_send_simulates_builds_signs_and_waits_in_order():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth(nonce=11, gas_price=3))
    signed = []
    gateway.account.sign_transaction = lambda txn: (
        signed.append(txn) or SimpleNamespace(raw_transaction=b"signed")
    )
    func = FakeFunc(estimate=1_000)
    receipt = await gateway._send(
        func, value=2, wait_options=TxReceiptWaitOptions(timeout_secs=9)
    )
    assert signed == [
        {
            "from": TEST_ADDRESS,
            "nonce": 11,
            "chainId": 84532,
            "value": 2,
            "gas": 1_200,
            "gasPrice": 3,
            "data": "0x",
        }
    ]
    assert eth.sent == [b"signed"]
    assert eth.receipt_calls == [(TX_HASH, 9, 2)]
    assert receipt["transactionHash"] == TX_HASH_HEX


async def test_concurrent_sends_are_serialised_so_each_gets_its_own_nonce():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth(nonce=0))
    signed = []
    gateway.account.sign_transaction = lambda txn: (
        signed.append(txn["nonce"]) or SimpleNamespace(raw_transaction=b"raw")
    )
    await asyncio.gather(*(gateway._send(FakeFunc()) for _ in range(3)))
    assert sorted(signed) == [0, 1, 2]
    assert eth.nonce == 3


async def test_a_failed_send_releases_the_lock_for_the_next_one():
    gateway = make_gateway()
    wire(gateway, FakeEth())
    with pytest.raises(AmountZeroError):
        await gateway._send(FakeFunc(call_error=custom_error("AmountZero", [], [])))
    assert not gateway._send_lock.locked()
    receipt = await gateway._send(FakeFunc())
    assert receipt["transactionHash"] == TX_HASH_HEX


def test_token_contracts_are_cached_by_checksum_address():
    gateway = make_gateway()
    first = gateway._erc20(TOKEN_ADDRESS.lower())
    assert gateway._erc20(TOKEN_ADDRESS) is first
    assert first.address == TOKEN_ADDRESS
    assert gateway._erc20(OTHER_TOKEN) is not first
    assert set(gateway._erc20_cache) == {TOKEN_ADDRESS, OTHER_TOKEN}


def test_a_malformed_token_address_is_rejected_before_any_contract_is_built():
    gateway = make_gateway()
    with pytest.raises(ValidationError):
        gateway._erc20("0xnot-an-address")
    assert gateway._erc20_cache == {}


def test_clearing_house_contracts_are_cached_by_checksum_address():
    gateway = make_gateway()
    first = gateway._clearing_house(CLEARING_HOUSE_ADDRESS.lower())
    assert gateway._clearing_house(CLEARING_HOUSE_ADDRESS) is first
    assert first.address == CLEARING_HOUSE
    assert "payNetDebit" in {fn["name"] for fn in first.abi if "name" in fn}


def token_with(gateway, allowance=0, balance=0):
    calls = []

    def allowance_fn(owner, spender):
        calls.append(("allowance", owner, spender))
        value = allowance.pop(0) if isinstance(allowance, list) else allowance
        return SimpleNamespace(call=AsyncMock(return_value=value))

    def balance_fn(owner):
        calls.append(("balanceOf", owner))
        return SimpleNamespace(call=AsyncMock(return_value=balance))

    def approve_fn(spender, value):
        calls.append(("approve", spender, value))
        return ("approve", spender, value)

    token = SimpleNamespace(
        functions=SimpleNamespace(
            allowance=allowance_fn, balanceOf=balance_fn, approve=approve_fn
        )
    )
    gateway._erc20 = lambda address: token
    return token, calls


async def test_the_allowance_is_read_for_the_signer_and_a_checksummed_spender():
    gateway = make_gateway()
    _, calls = token_with(gateway, allowance="42")
    assert await gateway.erc20_allowance(TOKEN_ADDRESS, SPENDER.lower()) == 42
    assert calls == [("allowance", TEST_ADDRESS, SPENDER)]


async def test_the_token_balance_is_read_for_the_signer_in_base_units():
    gateway = make_gateway()
    _, calls = token_with(gateway, balance=10**30)
    assert await gateway.erc20_balance(TOKEN_ADDRESS) == 10**30
    assert calls == [("balanceOf", TEST_ADDRESS)]


async def test_a_failing_token_balance_read_is_decoded():
    gateway = make_gateway()
    token, _ = token_with(gateway)
    token.functions.balanceOf = lambda owner: SimpleNamespace(
        call=AsyncMock(side_effect=RuntimeError("no code at address"))
    )
    with pytest.raises(ContractError, match="no code at address"):
        await gateway.erc20_balance(TOKEN_ADDRESS)


async def test_the_native_balance_is_read_in_wei():
    gateway = make_gateway()
    wire(gateway, FakeEth(balance=12 * 10**18))
    assert await gateway.native_balance() == 12 * 10**18


async def test_a_failing_native_balance_read_is_a_contract_error():
    gateway = make_gateway()
    wire(gateway, FakeEth(balance=aiohttp.ClientConnectionError("down")))
    with pytest.raises(ContractError) as raised:
        await gateway.native_balance()
    assert str(raised.value) == "native balance read failed: down"


class Clock:
    def __init__(self):
        self.now = 0.0
        self.sleeps: list = []

    def monotonic(self):
        return self.now

    async def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += max(seconds, 0.5)


@pytest.fixture
def clock(monkeypatch):
    fake = Clock()
    monkeypatch.setattr(
        contract_module, "time", SimpleNamespace(monotonic=fake.monotonic)
    )
    monkeypatch.setattr(
        contract_module, "asyncio", SimpleNamespace(sleep=fake.sleep, Lock=asyncio.Lock)
    )
    return fake


def allowance_contract(values, clock=None, step=0.0):
    seen = []

    def allowance(owner, spender):
        async def call():
            seen.append((owner, spender))
            if clock is not None:
                clock.now += step
            return values.pop(0) if len(values) > 1 else values[0]

        return SimpleNamespace(call=call)

    return SimpleNamespace(functions=SimpleNamespace(allowance=allowance)), seen


async def test_an_allowance_already_at_target_returns_without_sleeping(clock):
    gateway = make_gateway()
    contract, seen = allowance_contract([7])
    assert await gateway._wait_for_erc20_allowance(contract, SPENDER, 5) == 7
    assert seen == [(TEST_ADDRESS, SPENDER)]
    assert clock.sleeps == []


async def test_an_allowance_is_polled_until_it_reaches_the_target(clock):
    gateway = make_gateway()
    contract, seen = allowance_contract([0, 3, 5])
    assert await gateway._wait_for_erc20_allowance(contract, SPENDER, 5, 60, 2) == 5
    assert len(seen) == 3
    assert clock.sleeps == [2, 2]


async def test_an_allowance_that_never_arrives_returns_the_last_value_seen(clock):
    gateway = make_gateway()
    contract, seen = allowance_contract([1, 2, 3, 4])
    assert await gateway._wait_for_erc20_allowance(contract, SPENDER, 9, 5, 2) == 4
    assert clock.sleeps == [2, 2, 1, 0]
    assert len(seen) == 4


async def test_the_poll_sleep_never_goes_negative_when_a_read_overruns(clock):
    gateway = make_gateway()
    contract, _ = allowance_contract([0], clock=clock, step=10)
    assert await gateway._wait_for_erc20_allowance(contract, SPENDER, 1, 5, 2) == 0
    assert clock.sleeps == [0]


async def test_a_zero_timeout_still_reads_the_allowance_once(clock):
    gateway = make_gateway()
    contract, seen = allowance_contract([0])
    assert await gateway._wait_for_erc20_allowance(contract, SPENDER, 1, 0, 2) == 0
    assert len(seen) == 1


async def test_an_allowance_that_covers_the_amount_sends_no_approval():
    gateway = make_gateway()
    _, calls = token_with(gateway, allowance=100)
    gateway._send = AsyncMock()
    assert await gateway.approve_erc20(TOKEN_ADDRESS, 100) is None
    gateway._send.assert_not_called()
    assert calls == [("allowance", TEST_ADDRESS, CONTRACT_ADDRESS)]


async def test_a_zero_approval_is_always_already_covered():
    gateway = make_gateway()
    token_with(gateway, allowance=0)
    gateway._send = AsyncMock()
    assert await gateway.approve_erc20(TOKEN_ADDRESS, 0) is None
    gateway._send.assert_not_called()


async def test_an_approval_defaults_its_spender_to_the_core_contract():
    gateway = make_gateway()
    _, calls = token_with(gateway, allowance=[0, 50])
    gateway._send = AsyncMock(return_value={"status": 1})
    assert await gateway.approve_erc20(TOKEN_ADDRESS, 50) == {"status": 1}
    assert ("approve", CONTRACT_ADDRESS, 50) in calls
    assert gateway._send.await_args.args[0] == ("approve", CONTRACT_ADDRESS, 50)


async def test_an_approval_for_another_spender_is_checksummed_and_verified():
    gateway = make_gateway()
    _, calls = token_with(gateway, allowance=[0, 16])
    gateway._send = AsyncMock(return_value={"status": 1})
    await gateway.approve_erc20(TOKEN_ADDRESS, "0x10", spender=SPENDER.lower())
    assert calls == [
        ("allowance", TEST_ADDRESS, SPENDER),
        ("approve", SPENDER, 16),
        ("allowance", TEST_ADDRESS, SPENDER),
    ]


async def test_an_approval_passes_its_wait_options_to_send_and_verification():
    gateway = make_gateway()
    token_with(gateway, allowance=0)
    options = TxReceiptWaitOptions(timeout_secs=4, poll_latency_secs=1)
    gateway._send = AsyncMock(return_value={"status": 1})
    gateway._wait_for_erc20_allowance = AsyncMock(return_value=5)
    await gateway.approve_erc20(TOKEN_ADDRESS, 5, wait_options=options)
    assert gateway._send.await_args.kwargs == {"wait_options": options}
    assert gateway._wait_for_erc20_allowance.await_args.args[2:] == (5, 4, 1)


async def test_an_approval_the_chain_does_not_reflect_is_reported():
    gateway = make_gateway()
    token_with(gateway, allowance=0)
    gateway._send = AsyncMock(return_value={"status": 1})
    gateway._wait_for_erc20_allowance = AsyncMock(return_value=3)
    with pytest.raises(ContractError) as raised:
        await gateway.approve_erc20(TOKEN_ADDRESS, 5)
    assert str(raised.value) == (
        "ERC20 allowance verification failed: on-chain allowance is 3 but "
        "expected 5. Try calling approve again."
    )


async def test_a_negative_approval_is_rejected_before_any_read():
    gateway = make_gateway()
    _, calls = token_with(gateway)
    with pytest.raises(ValidationError, match="negative"):
        await gateway.approve_erc20(TOKEN_ADDRESS, -1)
    assert calls == []


async def test_a_failing_reset_to_zero_is_raised_without_re_approving():
    gateway = make_gateway()
    token_with(gateway, allowance=1)
    gateway._send = AsyncMock(
        side_effect=[ContractError("USDT"), ContractError("reset refused")]
    )
    with pytest.raises(ContractError, match="reset refused"):
        await gateway.approve_erc20(TOKEN_ADDRESS, 5)
    assert [call.args[0][2] for call in gateway._send.await_args_list] == [5, 0]


async def test_a_failing_re_approval_after_the_reset_is_raised():
    gateway = make_gateway()
    token_with(gateway, allowance=1)
    gateway._send = AsyncMock(
        side_effect=[ContractError("USDT"), {"status": 1}, ContractError("again")]
    )
    gateway._wait_for_erc20_allowance = AsyncMock()
    with pytest.raises(ContractError, match="again"):
        await gateway.approve_erc20(TOKEN_ADDRESS, 5)
    gateway._wait_for_erc20_allowance.assert_not_called()


async def test_an_erc20_deposit_calls_deposit_stablecoin_with_no_value():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    options = TxReceiptWaitOptions(timeout_secs=3)
    receipt = await gateway.deposit(1_000, TOKEN_ADDRESS.lower(), options)
    func = sender.await_args.args[0]
    assert func.fn_name == "depositStablecoin"
    assert func.args == (TOKEN_ADDRESS, 1_000)
    assert sender.await_args.kwargs == {"wait_options": options}
    assert receipt["transactionHash"] == TX_HASH_HEX


async def test_a_native_deposit_sends_the_amount_as_value():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    await gateway.deposit("0x0de0b6b3a7640000")
    func = sender.await_args.args[0]
    assert func.fn_name == "deposit"
    assert func.args == ()
    assert sender.await_args.kwargs == {"value": 10**18, "wait_options": None}


async def test_a_deposit_of_the_largest_u256_is_encoded():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    await gateway.deposit(2**256 - 1, TOKEN_ADDRESS)
    func = sender.await_args.args[0]
    assert func._encode_transaction_data().endswith("f" * 64)


@pytest.mark.parametrize("amount", [-1, "-5", "ten", 1.5])
async def test_an_invalid_deposit_amount_sends_nothing(amount):
    gateway = make_gateway()
    sender = capture_sends(gateway)
    with pytest.raises(ValidationError):
        await gateway.deposit(amount, TOKEN_ADDRESS)
    sender.assert_not_called()


async def test_a_deposit_with_a_malformed_token_sends_nothing():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    with pytest.raises(ValidationError):
        await gateway.deposit(5, "0x1234")
    sender.assert_not_called()


@pytest.mark.parametrize(
    ("method", "args", "identifier", "expected_args"),
    [
        (
            "request_withdrawal",
            (7, TOKEN_ADDRESS.lower()),
            "requestWithdrawal(address,uint256)",
            (TOKEN_ADDRESS, 7),
        ),
        ("request_withdrawal", (7, None), "requestWithdrawal(uint256)", (7,)),
        (
            "cancel_withdrawal",
            (TOKEN_ADDRESS.lower(),),
            "cancelWithdrawal(address)",
            (TOKEN_ADDRESS,),
        ),
        ("cancel_withdrawal", (None,), "cancelWithdrawal()", ()),
        (
            "finalize_withdrawal",
            (TOKEN_ADDRESS.lower(),),
            "finalizeWithdrawal(address)",
            (TOKEN_ADDRESS,),
        ),
        ("finalize_withdrawal", (None,), "finalizeWithdrawal()", ()),
        (
            "finalize_withdrawal_for",
            (USER.lower(), TOKEN_ADDRESS.lower()),
            "finalizeWithdrawalFor(address,address)",
            (USER, TOKEN_ADDRESS),
        ),
    ],
)
async def test_each_withdrawal_step_calls_the_matching_contract_overload(
    method, args, identifier, expected_args
):
    gateway = make_gateway()
    sender = capture_sends(gateway)
    options = TxReceiptWaitOptions(poll_latency_secs=1)
    receipt = await getattr(gateway, method)(*args, wait_options=options)
    func = sender.await_args.args[0]
    assert func.abi_element_identifier == identifier
    assert func.args == expected_args
    assert sender.await_args.kwargs == {"wait_options": options}
    assert receipt["transactionHash"] == TX_HASH_HEX
    func._encode_transaction_data()


async def test_a_withdrawal_request_with_a_negative_amount_sends_nothing():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    with pytest.raises(ValidationError):
        await gateway.request_withdrawal(-1, TOKEN_ADDRESS)
    sender.assert_not_called()


async def test_finalizing_for_a_malformed_user_sends_nothing():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    with pytest.raises(ValidationError):
        await gateway.finalize_withdrawal_for("0xabc", TOKEN_ADDRESS)
    sender.assert_not_called()


async def test_finalizing_for_another_user_runs_the_full_send_path():
    gateway = make_gateway()
    eth = wire(gateway, FakeEth(nonce=2))
    calls = []

    class Func:
        async def call(self, params):
            calls.append(params)

        async def estimate_gas(self, params):
            return 50_000

        def build_transaction(self, tx):
            return {**tx, "to": CONTRACT_ADDRESS}

    def finalize_for(user, token):
        calls.append((user, token))
        return Func()

    gateway.contract = SimpleNamespace(
        functions=SimpleNamespace(finalizeWithdrawalFor=finalize_for)
    )
    receipt = await gateway.finalize_withdrawal_for(USER, TOKEN_ADDRESS)
    assert calls == [(USER, TOKEN_ADDRESS), {"from": TEST_ADDRESS}]
    assert receipt == {"status": 1, "transactionHash": TX_HASH_HEX}
    assert eth.sent == [b"raw"]


def assets_gateway(outcome):
    gateway = make_gateway()
    gateway.contract = ViewContract(gateway.contract, {"getUserAllAssets": outcome})
    return gateway


async def test_user_assets_default_to_the_signer_at_the_latest_block():
    gateway = assets_gateway(
        [(TOKEN_ADDRESS, 10, 1_700_000_000, 4), (OTHER_TOKEN, "0x5", 0, "0")]
    )
    assets = await gateway.get_user_assets()
    assert gateway.contract.log == [("getUserAllAssets", (TEST_ADDRESS,), {})]
    assert assets == [
        {
            "asset": TOKEN_ADDRESS,
            "collateral": 10,
            "withdrawal_request_timestamp": 1_700_000_000,
            "withdrawal_request_amount": 4,
        },
        {
            "asset": OTHER_TOKEN,
            "collateral": 5,
            "withdrawal_request_timestamp": 0,
            "withdrawal_request_amount": 0,
        },
    ]


@pytest.mark.parametrize("block", [0, 123])
async def test_user_assets_can_be_read_at_a_given_block_including_genesis(block):
    gateway = assets_gateway([])
    assert await gateway.get_user_assets(USER.lower(), block_number=block) == []
    assert gateway.contract.log == [
        ("getUserAllAssets", (USER,), {"block_identifier": block})
    ]


async def test_a_failing_user_assets_read_is_decoded():
    gateway = assets_gateway(custom_error("EnforcedPause", [], []))
    with pytest.raises(PausedError):
        await gateway.get_user_assets()


async def test_a_negative_collateral_from_the_node_is_rejected():
    gateway = assets_gateway([(TOKEN_ADDRESS, -1, 0, 0)])
    with pytest.raises(ValidationError, match="negative"):
        await gateway.get_user_assets()


TWO_ARG_VIEWS = [
    ("principal_balance", "principalBalance"),
    ("withdrawable_balance", "withdrawableBalance"),
    ("guarantee_capacity", "guaranteeCapacity"),
    ("gross_yield", "grossYield"),
    ("protocol_yield_share", "protocolYieldShare"),
    ("user_net_yield", "userNetYield"),
    ("user_shares", "userShares"),
]
ONE_ARG_VIEWS = [
    ("total_user_shares", "totalUserShares"),
    ("protocol_shares", "protocolShares"),
    ("pool_shares", "poolShares"),
    ("pool_assets", "poolAssets"),
]


def view_gateway(name, outcome):
    gateway = make_gateway()
    gateway.contract = ViewContract(gateway.contract, {name: outcome})
    return gateway


@pytest.mark.parametrize(("method", "name"), TWO_ARG_VIEWS)
@pytest.mark.parametrize(
    ("raw", "expected"), [(0, 0), ("0x10", 16), (2**256 - 1, 2**256 - 1)]
)
async def test_each_user_and_asset_view_checksums_its_inputs_and_parses_a_u256(
    method, name, raw, expected
):
    gateway = view_gateway(name, raw)
    result = await getattr(gateway, method)(USER.lower(), TOKEN_ADDRESS.lower())
    assert result == expected
    assert gateway.contract.log == [(name, (USER, TOKEN_ADDRESS), {})]


@pytest.mark.parametrize(("method", "name"), ONE_ARG_VIEWS)
@pytest.mark.parametrize(("raw", "expected"), [(0, 0), ("12", 12)])
async def test_each_pool_view_checksums_the_token_and_parses_a_u256(
    method, name, raw, expected
):
    gateway = view_gateway(name, raw)
    assert await getattr(gateway, method)(TOKEN_ADDRESS.lower()) == expected
    assert gateway.contract.log == [(name, (TOKEN_ADDRESS,), {})]


@pytest.mark.parametrize(("method", "name"), TWO_ARG_VIEWS)
async def test_a_negative_view_answer_is_rejected(method, name):
    gateway = view_gateway(name, -1)
    with pytest.raises(ValidationError):
        await getattr(gateway, method)(USER, TOKEN_ADDRESS)


@pytest.mark.parametrize(("method", "name"), ONE_ARG_VIEWS)
async def test_a_reverting_pool_view_is_decoded(method, name):
    gateway = view_gateway(name, custom_error("PoolInsolvent", ["address"], [USER]))
    with pytest.raises(PoolInsolventError):
        await getattr(gateway, method)(TOKEN_ADDRESS)


async def test_a_view_with_a_malformed_user_is_rejected_before_calling():
    gateway = view_gateway("principalBalance", 1)
    with pytest.raises(ValidationError):
        await gateway.principal_balance("0x12", TOKEN_ADDRESS)
    assert gateway.contract.log == []


async def test_the_withdrawal_grace_period_is_read_in_seconds():
    gateway = view_gateway("withdrawalGracePeriod", 86_400)
    assert await gateway.withdrawal_grace_period() == 86_400
    assert gateway.contract.log == [("withdrawalGracePeriod", (), {})]


async def test_a_failing_grace_period_read_is_decoded():
    gateway = view_gateway("withdrawalGracePeriod", RuntimeError("timeout"))
    with pytest.raises(ContractError, match="timeout"):
        await gateway.withdrawal_grace_period()


async def test_the_strategy_is_returned_in_checksum_form():
    gateway = view_gateway("strategy", SPENDER.lower())
    assert await gateway.strategy(TOKEN_ADDRESS.lower()) == SPENDER
    assert gateway.contract.log == [("strategy", (TOKEN_ADDRESS,), {})]


async def test_an_idle_pool_reports_the_zero_address_as_its_strategy():
    gateway = view_gateway("strategy", "0x" + "00" * 20)
    assert await gateway.strategy(TOKEN_ADDRESS) == to_checksum_address(
        "0x" + "00" * 20
    )


async def test_a_malformed_strategy_address_from_the_node_is_rejected():
    gateway = view_gateway("strategy", "0x1234")
    with pytest.raises(ValidationError):
        await gateway.strategy(TOKEN_ADDRESS)


async def test_paying_a_net_debit_calls_the_clearing_house_with_the_proof():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    options = TxReceiptWaitOptions(timeout_secs=8)
    await gateway.pay_net_debit(
        CLEARING_HOUSE_ADDRESS.lower(), CYCLE_ID, "250", PROOF, 0, options
    )
    func = sender.await_args.args[0]
    assert func.address == CLEARING_HOUSE
    assert func.fn_name == "payNetDebit"
    assert func.args == (CYCLE_ID, 250, PROOF)
    assert sender.await_args.kwargs == {"value": 0, "wait_options": options}
    data = func._encode_transaction_data()
    assert CYCLE_ID.hex() in data
    assert all(node.hex() in data for node in PROOF)


async def test_paying_a_native_net_debit_attaches_the_payable_value():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    await gateway.pay_net_debit(CLEARING_HOUSE_ADDRESS, CYCLE_ID, 5, [], "0x5")
    assert sender.await_args.args[0].args == (CYCLE_ID, 5, [])
    assert sender.await_args.kwargs == {"value": 5, "wait_options": None}


@pytest.mark.parametrize(("amount", "payable"), [(-1, 0), (1, -1)])
async def test_paying_with_a_negative_amount_or_value_sends_nothing(amount, payable):
    gateway = make_gateway()
    sender = capture_sends(gateway)
    with pytest.raises(ValidationError):
        await gateway.pay_net_debit(
            CLEARING_HOUSE_ADDRESS, CYCLE_ID, amount, PROOF, payable
        )
    sender.assert_not_called()


async def test_claiming_a_net_credit_names_the_checksummed_creditor():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    options = TxReceiptWaitOptions(poll_latency_secs=1)
    await gateway.claim_net_credit_for(
        CLEARING_HOUSE_ADDRESS, USER.lower(), CYCLE_ID, 9, PROOF, options
    )
    func = sender.await_args.args[0]
    assert func.address == CLEARING_HOUSE
    assert func.fn_name == "claimNetCreditFor"
    assert func.args == (USER, CYCLE_ID, 9, PROOF)
    assert sender.await_args.kwargs == {"wait_options": options}
    func._encode_transaction_data()


async def test_claiming_for_a_malformed_creditor_sends_nothing():
    gateway = make_gateway()
    sender = capture_sends(gateway)
    with pytest.raises(ValidationError):
        await gateway.claim_net_credit_for(
            CLEARING_HOUSE_ADDRESS, "0xbad", CYCLE_ID, 9, PROOF
        )
    sender.assert_not_called()


async def test_a_claim_reverting_in_simulation_surfaces_the_clearing_house_error():
    gateway = make_gateway()
    wire(gateway, FakeEth())
    clearing = SimpleNamespace(
        functions=SimpleNamespace(
            claimNetCreditFor=lambda *args: FakeFunc(
                call_error=custom_error("InvalidProof", [], [])
            )
        )
    )
    gateway._clearing_house = lambda address: clearing
    with pytest.raises(ContractError) as raised:
        await gateway.claim_net_credit_for(
            CLEARING_HOUSE_ADDRESS, USER, CYCLE_ID, 9, PROOF
        )
    assert type(raised.value) is ContractError
    assert str(raised.value) == "InvalidProof()"
