from __future__ import annotations

import asyncio
import contextlib
import ssl
import time
from typing import Any, cast

import aiohttp
import certifi
from eth_utils import keccak
from web3 import AsyncHTTPProvider, AsyncWeb3
from web3.contract import AsyncContract
from web3.contract.async_contract import AsyncContractFunction
from web3.exceptions import (
    ContractCustomError,
    RequestTimedOut,
    Web3Exception,
    Web3RPCError,
)
from web3.types import TxParams, Wei

from ..errors import (
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
from ..models import TxReceiptWaitOptions
from ..utils import load_abi, normalize_address, parse_u256, refused_status

DEFAULT_RECEIPT_TIMEOUT_SECS = 60
DEFAULT_RECEIPT_POLL_LATENCY_SECS = 2
_DEFAULT_WAIT = TxReceiptWaitOptions()

_JSON_RPC_INTERNAL_ERROR = -32603
_SELECTOR_HEX_LENGTH = 8
_GAS_HEADROOM = 1.2
_FALLBACK_GAS_LIMIT = 300_000
_NODE_ERRORS = (
    Web3Exception,
    aiohttp.ClientError,
    asyncio.TimeoutError,
    TimeoutError,
    ValueError,
)


def _lost_broadcast(exc: BaseException) -> bool:
    if isinstance(exc, aiohttp.ClientResponseError):
        return not refused_status(exc.status)
    if isinstance(exc, (aiohttp.ClientError, asyncio.TimeoutError, TimeoutError)):
        return True
    if isinstance(exc, RequestTimedOut):
        return True
    if isinstance(exc, Web3RPCError):
        response = exc.rpc_response or {}
        error = response.get("error") if isinstance(response, dict) else None
        return isinstance(error, dict) and error.get("code") == _JSON_RPC_INTERNAL_ERROR
    return False


_REVERT_EXCEPTIONS: dict[str, type[ContractError]] = {
    "AmountZero": AmountZeroError,
    "InsufficientAvailable": InsufficientAvailableError,
    "NoWithdrawalRequested": NoWithdrawalRequestedError,
    "GracePeriodNotElapsed": GracePeriodNotElapsedError,
    "TransferFailed": TransferFailedError,
    "UnsupportedAsset": UnsupportedAssetError,
    "InsufficientLiquidity": InsufficientLiquidityError,
    "PoolInsolvent": PoolInsolventError,
    "DepositsDisabled": DepositsDisabledError,
    "StablecoinDepositsDisabled": StablecoinDepositsDisabledError,
    "EnforcedPause": PausedError,
    "ValueMismatch": ValueMismatchError,
    "ZeroCollateralCredit": ZeroCollateralCreditError,
}


class ContractGateway:
    def __init__(
        self,
        eth_rpc_url: str,
        private_key: str,
        contract_address: str,
        chain_id: int,
    ) -> None:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        self.w3 = AsyncWeb3(
            AsyncHTTPProvider(eth_rpc_url, request_kwargs={"ssl": ssl_context})
        )
        self.account = self.w3.eth.account.from_key(private_key)
        self.chain_id = chain_id
        self.contract_address = normalize_address(contract_address)
        self.contract = self.w3.eth.contract(
            address=self.contract_address,
            abi=load_abi("treasury.json"),
        )
        self._clearing_house_abi = load_abi("clearing_house.json")
        self._erc20_cache: dict[str, AsyncContract] = {}
        self._clearing_house_cache: dict[str, AsyncContract] = {}
        # Serialised: concurrent sends would read the same nonce.
        self._send_lock = asyncio.Lock()
        self._error_abis = [
            self.contract.abi,
            self._clearing_house_abi,
            load_abi("erc20.json"),
        ]

    async def verify_chain_id(self) -> None:
        actual = await self.w3.eth.chain_id
        if int(actual) != int(self.chain_id):
            raise ContractError(
                f"chain id mismatch between core service ({self.chain_id}) and "
                f"Ethereum provider ({actual})"
            )

    def _fn(self, signature: str) -> AsyncContractFunction:
        getter = getattr(self.contract, "get_function_by_signature", None)
        if getter:
            return cast(AsyncContractFunction, getter(signature))
        return self.contract.functions[signature]

    def _decode_contract_error(self, exc: Exception) -> ContractError:
        if not isinstance(exc, ContractCustomError):
            return ContractError(str(exc))
        raw = exc.args[0] if exc.args else ""
        selector = (raw if isinstance(raw, str) else "").replace("0x", "")[:8]
        if len(selector) != _SELECTOR_HEX_LENGTH:
            return ContractError(str(exc))
        for abi in self._error_abis:
            for entry in abi:
                if entry.get("type") != "error":
                    continue
                name = entry.get("name", "")
                inputs = entry.get("inputs", [])
                sig = f"{name}({','.join(i['type'] for i in inputs)})"
                if keccak(text=sig).hex()[:8] != selector:
                    continue
                exc_cls = _REVERT_EXCEPTIONS.get(name)
                if exc_cls is UnsupportedAssetError:
                    return UnsupportedAssetError("unknown")
                if exc_cls is not None:
                    return exc_cls(f"{name}()")
                return ContractError(f"{name}()")
        return ContractError(f"unknown custom error: 0x{selector}")

    async def aclose(self) -> None:
        provider = getattr(self.w3, "provider", None)
        if provider is None:
            return
        disconnect = getattr(provider, "disconnect", None)
        if callable(disconnect):
            result = disconnect()
            if hasattr(result, "__await__"):
                await result
            return
        close = getattr(provider, "aclose", None) or getattr(provider, "close", None)
        if callable(close):
            result = close()
            if hasattr(result, "__await__"):
                await result

    async def _build_and_send(
        self,
        txn: TxParams,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        opts = wait_options or _DEFAULT_WAIT
        try:
            signed = self.account.sign_transaction(txn)
        except Exception as exc:
            raise ContractError(str(exc)) from exc
        raw_tx = getattr(signed, "raw_transaction", None)
        if raw_tx is None:
            raw_tx = getattr(signed, "rawTransaction", None)
        if raw_tx is None:
            raise ContractError("SignedTransaction missing raw_transaction")

        try:
            tx_hash = await self.w3.eth.send_raw_transaction(raw_tx)
        except Exception as exc:
            if _lost_broadcast(exc):
                raise TransactionOutcomeUnknownError(
                    "the transaction was sent and no usable answer came back "
                    f"({exc}); it may or may not have been accepted",
                    stage="broadcast",
                ) from exc
            raise self._decode_contract_error(exc) from exc
        tx_hash_hex = "0x" + (
            tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
        ).removeprefix("0x")

        try:
            receipt = await self.w3.eth.wait_for_transaction_receipt(
                tx_hash,
                timeout=opts.timeout_secs,
                poll_latency=opts.poll_latency_secs,
            )
        except Exception as exc:
            raise TransactionOutcomeUnknownError(
                f"transaction {tx_hash_hex} was sent, but its receipt was not "
                f"seen ({exc}); it may still be mined",
                stage="receipt",
                tx_hash=tx_hash_hex,
            ) from exc
        receipt_dict = dict(receipt)
        if receipt_dict.get("status") in (0, "0x0", False):
            raise RevertedOnChainError(tx_hash_hex)
        receipt_dict["transactionHash"] = tx_hash_hex
        return receipt_dict

    async def _prepare_tx(
        self, func: AsyncContractFunction, value: int = 0
    ) -> TxParams:
        call_params: TxParams = {"from": self.account.address}
        if value:
            call_params["value"] = Wei(value)
        try:
            await func.call(call_params)
        except Exception as exc:
            raise self._decode_contract_error(exc) from exc

        nonce = await self.w3.eth.get_transaction_count(self.account.address)
        base: TxParams = {
            "from": self.account.address,
            "nonce": nonce,
            "chainId": self.chain_id,
            "value": Wei(value),
        }
        try:
            base["gas"] = int(await func.estimate_gas(base) * _GAS_HEADROOM)
        except _NODE_ERRORS:
            base["gas"] = _FALLBACK_GAS_LIMIT
        with contextlib.suppress(*_NODE_ERRORS):
            base["gasPrice"] = await self.w3.eth.gas_price
        return base

    async def _build_tx(self, func: AsyncContractFunction, tx: TxParams) -> TxParams:
        built: object = func.build_transaction(tx)
        if hasattr(built, "__await__"):
            built = await built
        return cast(TxParams, built)

    async def _send(
        self,
        func: AsyncContractFunction,
        value: int = 0,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        async with self._send_lock:
            tx = await self._prepare_tx(func, value=value)
            built = await self._build_tx(func, tx)
            return await self._build_and_send(built, wait_options)

    def _erc20(self, token_address: str) -> AsyncContract:
        checksum = normalize_address(token_address)
        if checksum not in self._erc20_cache:
            self._erc20_cache[checksum] = self.w3.eth.contract(
                address=checksum, abi=load_abi("erc20.json")
            )
        return self._erc20_cache[checksum]

    async def erc20_allowance(self, token_address: str, spender: str) -> int:
        contract = self._erc20(token_address)
        return int(
            await contract.functions.allowance(
                self.account.address, normalize_address(spender)
            ).call()
        )

    async def erc20_balance(self, token_address: str) -> int:
        """In base units."""
        contract = self._erc20(token_address)
        return int(await self._view(contract.functions.balanceOf(self.account.address)))

    async def native_balance(self) -> int:
        """In wei."""
        try:
            return int(await self.w3.eth.get_balance(self.account.address))
        except Exception as exc:
            raise ContractError(f"native balance read failed: {exc}") from exc

    async def _wait_for_erc20_allowance(
        self,
        contract: Any,
        spender: str,
        target: int,
        timeout: int = DEFAULT_RECEIPT_TIMEOUT_SECS,
        poll_latency: int = DEFAULT_RECEIPT_POLL_LATENCY_SECS,
    ) -> int:
        deadline = time.monotonic() + timeout
        actual = 0
        while time.monotonic() <= deadline:
            actual = int(
                await contract.functions.allowance(self.account.address, spender).call()
            )
            if actual >= target:
                return actual
            await asyncio.sleep(min(poll_latency, max(0, deadline - time.monotonic())))
        return actual

    async def approve_erc20(
        self,
        token_address: str,
        amount: int,
        spender: str | None = None,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any] | None:
        """*spender* defaults to the Core4Mica contract. ``None`` when the
        standing allowance already covers *amount*."""
        opts = wait_options or _DEFAULT_WAIT
        spender_address = normalize_address(spender or self.contract_address)
        contract = self._erc20(token_address)
        target = parse_u256(amount)
        current = int(
            await contract.functions.allowance(
                self.account.address, spender_address
            ).call()
        )
        if current >= target:
            return None

        async def send_approve(value: int) -> dict[str, Any]:
            func = contract.functions.approve(spender_address, value)
            return await self._send(func, wait_options=opts)

        try:
            receipt = await send_approve(target)
        except TransactionOutcomeUnknownError:
            # The approval may be out: never reset or re-approve on top of it.
            raise
        except ContractError:
            # USDT-style tokens revert on non-zero over non-zero: reset to 0 first.
            await send_approve(0)
            receipt = await send_approve(target)

        actual = await self._wait_for_erc20_allowance(
            contract, spender_address, target, opts.timeout_secs, opts.poll_latency_secs
        )
        if actual < target:
            raise ContractError(
                f"ERC20 allowance verification failed: on-chain allowance is "
                f"{actual} but expected {target}. Try calling approve again."
            )
        return receipt

    async def deposit(
        self,
        amount: int,
        erc20_token: str | None = None,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        if erc20_token:
            func = self.contract.functions.depositStablecoin(
                normalize_address(erc20_token), parse_u256(amount)
            )
            return await self._send(func, wait_options=wait_options)
        func = self.contract.functions.deposit()
        return await self._send(
            func, value=parse_u256(amount), wait_options=wait_options
        )

    async def request_withdrawal(
        self,
        amount: int,
        erc20_token: str | None,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        if erc20_token:
            func = self._fn("requestWithdrawal(address,uint256)")(
                normalize_address(erc20_token), parse_u256(amount)
            )
        else:
            func = self._fn("requestWithdrawal(uint256)")(parse_u256(amount))
        return await self._send(func, wait_options=wait_options)

    async def cancel_withdrawal(
        self,
        erc20_token: str | None,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        if erc20_token:
            func = self._fn("cancelWithdrawal(address)")(normalize_address(erc20_token))
        else:
            func = self._fn("cancelWithdrawal()")()
        return await self._send(func, wait_options=wait_options)

    async def finalize_withdrawal(
        self,
        erc20_token: str | None,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        if erc20_token:
            func = self._fn("finalizeWithdrawal(address)")(
                normalize_address(erc20_token)
            )
        else:
            func = self._fn("finalizeWithdrawal()")()
        return await self._send(func, wait_options=wait_options)

    async def finalize_withdrawal_for(
        self,
        user: str,
        erc20_token: str,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        func = self.contract.functions.finalizeWithdrawalFor(
            normalize_address(user), normalize_address(erc20_token)
        )
        return await self._send(func, wait_options=wait_options)

    async def get_user_assets(
        self, user: str | None = None, block_number: int | None = None
    ) -> list[dict[str, Any]]:
        call_kwargs: dict[str, Any] = {}
        if block_number is not None:
            call_kwargs["block_identifier"] = block_number
        try:
            result = await self.contract.functions.getUserAllAssets(
                normalize_address(user or self.account.address)
            ).call(**call_kwargs)
        except Exception as exc:
            raise self._decode_contract_error(exc) from exc

        return [
            {
                "asset": asset[0],
                "collateral": parse_u256(asset[1]),
                "withdrawal_request_timestamp": int(asset[2]),
                "withdrawal_request_amount": parse_u256(asset[3]),
            }
            for asset in result
        ]

    async def _view(self, func: AsyncContractFunction) -> Any:
        try:
            return await func.call()
        except Exception as exc:
            raise self._decode_contract_error(exc) from exc

    async def withdrawal_grace_period(self) -> int:
        """In seconds."""
        return int(await self._view(self.contract.functions.withdrawalGracePeriod()))

    async def principal_balance(self, user: str, asset: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.principalBalance(
                    normalize_address(user), normalize_address(asset)
                )
            )
        )

    async def withdrawable_balance(self, user: str, asset: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.withdrawableBalance(
                    normalize_address(user), normalize_address(asset)
                )
            )
        )

    async def guarantee_capacity(self, user: str, asset: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.guaranteeCapacity(
                    normalize_address(user), normalize_address(asset)
                )
            )
        )

    async def gross_yield(self, user: str, asset: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.grossYield(
                    normalize_address(user), normalize_address(asset)
                )
            )
        )

    async def protocol_yield_share(self, user: str, asset: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.protocolYieldShare(
                    normalize_address(user), normalize_address(asset)
                )
            )
        )

    async def user_net_yield(self, user: str, asset: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.userNetYield(
                    normalize_address(user), normalize_address(asset)
                )
            )
        )

    async def user_shares(self, user: str, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.userShares(
                    normalize_address(user), normalize_address(token)
                )
            )
        )

    async def total_user_shares(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.totalUserShares(normalize_address(token))
            )
        )

    async def protocol_shares(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.protocolShares(normalize_address(token))
            )
        )

    async def pool_shares(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.poolShares(normalize_address(token))
            )
        )

    async def pool_assets(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.poolAssets(normalize_address(token))
            )
        )

    async def strategy(self, token: str) -> str:
        """The zero address while the pool's assets sit idle."""
        return normalize_address(
            await self._view(self.contract.functions.strategy(normalize_address(token)))
        )

    def _clearing_house(self, address: str) -> AsyncContract:
        checksum = normalize_address(address)
        if checksum not in self._clearing_house_cache:
            self._clearing_house_cache[checksum] = self.w3.eth.contract(
                address=checksum, abi=self._clearing_house_abi
            )
        return self._clearing_house_cache[checksum]

    async def pay_net_debit(
        self,
        clearing_house: str,
        cycle_id: bytes,
        amount: int,
        proof: list[bytes],
        payable_value: int = 0,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        contract = self._clearing_house(clearing_house)
        func = contract.functions.payNetDebit(cycle_id, parse_u256(amount), proof)
        return await self._send(
            func, value=parse_u256(payable_value), wait_options=wait_options
        )

    async def claim_net_credit_for(
        self,
        clearing_house: str,
        creditor: str,
        cycle_id: bytes,
        amount: int,
        proof: list[bytes],
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any]:
        contract = self._clearing_house(clearing_house)
        func = contract.functions.claimNetCreditFor(
            normalize_address(creditor), cycle_id, parse_u256(amount), proof
        )
        return await self._send(func, wait_options=wait_options)
