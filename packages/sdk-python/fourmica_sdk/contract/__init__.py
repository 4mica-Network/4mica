"""Async web3 gateway for the Core4Mica and ClearingHouse contracts.

ABI JSON under ``abi/`` is vendored from the ``4mica-core`` repo's forge
artifacts — refresh with ``scripts/refresh_abis.sh``, never edit by hand.
"""

from __future__ import annotations

import asyncio
import time
import warnings
from typing import Any, Dict, List, Optional, Type

from eth_utils import keccak

# web3 pulls in websockets.legacy when importing its websocket provider classes.
# We only use the HTTP provider, so silence that third-party deprecation warning
# during import until web3 switches to the new asyncio websockets API.
with warnings.catch_warnings():
    warnings.filterwarnings(
        "ignore",
        category=DeprecationWarning,
        module="websockets\\.legacy",
    )
    try:
        from web3 import AsyncHTTPProvider, AsyncWeb3
    except ImportError:  # pragma: no cover - unexpected layout
        from web3 import AsyncWeb3

        AsyncHTTPProvider = None  # type: ignore

if AsyncHTTPProvider is None:  # type: ignore[truthy-bool]
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            category=DeprecationWarning,
            module="websockets\\.legacy",
        )
        try:  # pragma: no cover - compatibility path
            from web3.providers.rpc.async_rpc import AsyncHTTPProvider  # type: ignore
        except ImportError:
            from web3.providers.async_rpc import AsyncHTTPProvider  # type: ignore

try:
    # Web3>=6.x had async_geth_poa_middleware under geth_poa; removed in 7.x.
    from web3.middleware.geth_poa import async_geth_poa_middleware
except ImportError:  # pragma: no cover - compatibility path or removed
    try:
        from web3.middleware import async_geth_poa_middleware  # type: ignore
    except ImportError:
        async_geth_poa_middleware = None  # type: ignore

from ..errors import (
    AaveNotConfiguredError,
    AmountZeroError,
    ContractError,
    GracePeriodNotElapsedError,
    InsufficientAvailableError,
    NoWithdrawalRequestedError,
    RevertedOnChainError,
    StablecoinWithdrawShortfallError,
    TransferFailedError,
    UnsupportedAssetError,
    ValueMismatchError,
    ZeroCollateralCreditError,
)
from ..models import TxReceiptWaitOptions
from ..ssl_utils import ensure_ssl_certs, get_web3_ssl_context
from ..utils import load_abi, normalize_address, parse_u256

DEFAULT_RECEIPT_TIMEOUT_SECS = 60
DEFAULT_RECEIPT_POLL_LATENCY_SECS = 2
_DEFAULT_WAIT = TxReceiptWaitOptions()

# Decoded custom errors that map to a dedicated exception; everything else
# surfaces as ContractError carrying the decoded name (see error.rs's
# impl_from_alloy_error tables).
_REVERT_EXCEPTIONS: Dict[str, Type[ContractError]] = {
    "AmountZero": AmountZeroError,
    "InsufficientAvailable": InsufficientAvailableError,
    "NoWithdrawalRequested": NoWithdrawalRequestedError,
    "GracePeriodNotElapsed": GracePeriodNotElapsedError,
    "TransferFailed": TransferFailedError,
    "UnsupportedAsset": UnsupportedAssetError,
    "StablecoinWithdrawShortfall": StablecoinWithdrawShortfallError,
    "AaveNotConfigured": AaveNotConfiguredError,
    "ValueMismatch": ValueMismatchError,
    "ZeroCollateralCredit": ZeroCollateralCreditError,
}


class ContractGateway:
    """Thin async wrapper around the Core4Mica contract plus the ERC-20 and
    ClearingHouse instances the flows touch. All transactions sign with the
    configured local account."""

    def __init__(
        self,
        eth_rpc_url: str,
        private_key: str,
        contract_address: str,
        chain_id: int,
    ) -> None:
        ensure_ssl_certs()
        ssl_context = get_web3_ssl_context()
        request_kwargs = {"ssl": ssl_context} if ssl_context is not None else {}
        self.w3 = AsyncWeb3(
            AsyncHTTPProvider(eth_rpc_url, request_kwargs=request_kwargs)
        )
        # Support PoA chains used in tests/anvil when middleware is available.
        if async_geth_poa_middleware:
            self.w3.middleware_onion.inject(async_geth_poa_middleware, layer=0)
        self.account = self.w3.eth.account.from_key(private_key)
        self.chain_id = chain_id
        self.contract_address = normalize_address(contract_address)
        self.contract = self.w3.eth.contract(
            address=self.contract_address,
            abi=load_abi("core4mica.json"),
        )
        self._clearing_house_abi = load_abi("clearing_house.json")
        self._erc20_cache: Dict[str, Any] = {}
        self._clearing_house_cache: Dict[str, Any] = {}
        self._error_abis = [
            self.contract.abi,
            self._clearing_house_abi,
            load_abi("erc20.json"),
        ]

    async def verify_chain_id(self) -> None:
        """Fails fast when the Ethereum endpoint serves a different chain than
        the one core signs for."""
        actual = await self.w3.eth.chain_id
        if int(actual) != int(self.chain_id):
            raise ContractError(
                f"chain id mismatch between core service ({self.chain_id}) and "
                f"Ethereum provider ({actual})"
            )

    def _fn(self, signature: str):
        """Fetch a contract function by explicit signature (handles overloads)."""
        getter = getattr(self.contract, "get_function_by_signature", None)
        if getter:
            return getter(signature)
        return self.contract.functions[signature]

    def _decode_contract_error(self, exc: Exception) -> ContractError:
        """Map a ContractCustomError selector to a typed exception, or fall
        back to ContractError with whatever context is available."""
        from web3.exceptions import ContractCustomError

        if not isinstance(exc, ContractCustomError):
            return ContractError(str(exc))
        raw = exc.args[0] if exc.args else ""
        selector = (raw if isinstance(raw, str) else "").replace("0x", "")[:8]
        if len(selector) != 8:
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
        txn: Dict[str, Any],
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
        """Sign, broadcast, and wait for the receipt."""
        opts = wait_options or _DEFAULT_WAIT
        try:
            signed = self.account.sign_transaction(txn)
            raw_tx = getattr(signed, "raw_transaction", None)
            if raw_tx is None:
                raw_tx = getattr(signed, "rawTransaction", None)
            if raw_tx is None:
                raise ContractError("SignedTransaction missing raw_transaction")
            tx_hash = await self.w3.eth.send_raw_transaction(raw_tx)
            receipt = await self.w3.eth.wait_for_transaction_receipt(
                tx_hash,
                timeout=opts.timeout_secs,
                poll_latency=opts.poll_latency_secs,
            )
            receipt_dict = dict(receipt)
            status = receipt_dict.get("status")
            tx_hash_hex = "0x" + (
                tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            ).removeprefix("0x")
            if status in (0, "0x0", False):
                raise RevertedOnChainError(tx_hash_hex)
            receipt_dict["transactionHash"] = tx_hash_hex
            return receipt_dict
        except ContractError:
            raise
        except Exception as exc:
            raise ContractError(str(exc)) from exc

    async def _prepare_tx(self, func, value: int = 0) -> Dict[str, Any]:
        call_params: Dict[str, Any] = {"from": self.account.address}
        if value:
            call_params["value"] = value
        try:
            await func.call(call_params)
        except Exception as exc:
            raise self._decode_contract_error(exc) from exc

        nonce = await self.w3.eth.get_transaction_count(self.account.address)
        base = {
            "from": self.account.address,
            "nonce": nonce,
            "chainId": self.chain_id,
            "value": value,
        }
        try:
            gas_estimate = await func.estimate_gas(base)
            base["gas"] = int(gas_estimate * 1.2)
        except Exception:
            base["gas"] = 300_000
        try:
            base["gasPrice"] = await self.w3.eth.gas_price
        except Exception:
            pass
        return base

    async def _build_tx(self, func, tx: Dict[str, Any]) -> Dict[str, Any]:
        built = func.build_transaction(tx)
        if hasattr(built, "__await__"):
            built = await built
        return built

    async def _send(
        self, func, value: int = 0, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> Dict[str, Any]:
        tx = await self._prepare_tx(func, value=value)
        built = await self._build_tx(func, tx)
        return await self._build_and_send(built, wait_options)

    # --- ERC-20 ---------------------------------------------------------

    def _erc20(self, token_address: str):
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
        spender: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Optional[Dict[str, Any]]:
        """Approve *spender* (the Core4Mica contract by default) to pull
        *amount* of *token_address*. Returns ``None`` when the standing
        allowance already covers it."""
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

        async def send_approve(value: int) -> Dict[str, Any]:
            func = contract.functions.approve(spender_address, value)
            return await self._send(func, wait_options=opts)

        try:
            receipt = await send_approve(target)
        except Exception:
            if target == 0:
                raise
            # Some ERC20s (e.g. USDT) revert when setting a non-zero allowance
            # over an existing non-zero one — reset to 0 first, then re-approve.
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

    # --- Core4Mica writes ------------------------------------------------

    async def deposit(
        self,
        amount: int,
        erc20_token: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
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
        erc20_token: Optional[str],
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
        if erc20_token:
            func = self._fn("requestWithdrawal(address,uint256)")(
                normalize_address(erc20_token), parse_u256(amount)
            )
        else:
            func = self._fn("requestWithdrawal(uint256)")(parse_u256(amount))
        return await self._send(func, wait_options=wait_options)

    async def cancel_withdrawal(
        self,
        erc20_token: Optional[str],
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
        if erc20_token:
            func = self._fn("cancelWithdrawal(address)")(normalize_address(erc20_token))
        else:
            func = self._fn("cancelWithdrawal()")()
        return await self._send(func, wait_options=wait_options)

    async def finalize_withdrawal(
        self,
        erc20_token: Optional[str],
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
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
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
        func = self.contract.functions.finalizeWithdrawalFor(
            normalize_address(user), normalize_address(erc20_token)
        )
        return await self._send(func, wait_options=wait_options)

    # --- Core4Mica reads -------------------------------------------------

    async def get_user_assets(
        self, user: Optional[str] = None, block_number: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        call_kwargs: Dict[str, Any] = {}
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

    async def get_guarantee_version_config(self, version: int) -> Dict[str, Any]:
        try:
            result = await self.contract.functions.getGuaranteeVersionConfig(
                int(version)
            ).call()
        except Exception as exc:
            raise self._decode_contract_error(exc) from exc

        if isinstance(result, dict):
            domain = result.get("domainSeparator")
            decoder = result.get("decoder")
            enabled = result.get("enabled")
        else:
            domain = result[1]
            decoder = result[2]
            enabled = result[3]

        return {
            "domain_separator": bytes(domain),
            "decoder": normalize_address(decoder),
            "enabled": bool(enabled),
        }

    async def _view(self, func) -> Any:
        try:
            return await func.call()
        except Exception as exc:
            raise self._decode_contract_error(exc) from exc

    async def guarantee_domain_separator(self) -> bytes:
        return bytes(
            await self._view(self.contract.functions.guaranteeDomainSeparator())
        )

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

    async def total_user_scaled_balance(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.totalUserScaledBalance(normalize_address(token))
            )
        )

    async def protocol_scaled_balance(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.protocolScaledBalance(normalize_address(token))
            )
        )

    async def surplus_scaled_balance(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.surplusScaledBalance(normalize_address(token))
            )
        )

    async def contract_scaled_a_token_balance(self, token: str) -> int:
        return parse_u256(
            await self._view(
                self.contract.functions.contractScaledATokenBalance(
                    normalize_address(token)
                )
            )
        )

    async def stablecoin_a_token(self, token: str) -> str:
        return normalize_address(
            await self._view(
                self.contract.functions.stablecoinAToken(normalize_address(token))
            )
        )

    # --- ClearingHouse ---------------------------------------------------

    def _clearing_house(self, address: str):
        """A ClearingHouse instance at *address* — the deployment arrives in
        each prepared clearing action, not in config."""
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
        proof: List[bytes],
        payable_value: int = 0,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
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
        proof: List[bytes],
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Dict[str, Any]:
        contract = self._clearing_house(clearing_house)
        func = contract.functions.claimNetCreditFor(
            normalize_address(creditor), cycle_id, parse_u256(amount), proof
        )
        return await self._send(func, wait_options=wait_options)
