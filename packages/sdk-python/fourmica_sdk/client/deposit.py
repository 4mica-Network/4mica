"""Depositing collateral. ``deposit.of(asset, amount)`` captures the intent, a
route pin narrows how, and a terminal does it. Facilitator-sponsored gasless
routes (EIP-3009 / Permit2) arrive in a later release; until then the auto
route is the signer's own transaction."""

from __future__ import annotations

from typing import Any, Dict, Optional, Union

from ..errors import AmountZeroError, InvalidParamsError
from ..models import TxReceiptWaitOptions
from .ctx import ClientCtx
from .model import Asset, DepositReceipt, TokenRoute


class DepositClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def of(self, asset: Union[Asset, str, None], amount: int) -> "DepositBuilder":
        """Starts a deposit of *amount* in *asset* (``None`` for native ETH)."""
        return DepositBuilder(self._ctx, Asset.coerce(asset), int(amount))


class DepositBuilder:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        if amount <= 0:
            raise AmountZeroError("deposit amount must be positive")
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    def self_funded(self) -> "SelfFundedDeposit":
        """Pins the signer's own transaction."""
        return SelfFundedDeposit(self._ctx, self._asset, self._amount)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> DepositReceipt:
        return await self.self_funded().send(wait_options)


class SelfFundedDeposit:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    async def approve(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> Optional[Dict[str, Any]]:
        """Grants the Core4Mica contract the allowance a self-funded ERC-20
        deposit pulls. Returns ``None`` when the standing allowance covers it."""
        if self._asset.is_native:
            raise InvalidParamsError(
                "a native deposit needs no approval; its value rides with the "
                "transaction"
            )
        gateway = await self._ctx.gateway()
        return await gateway.approve_erc20(
            self._asset.address, self._amount, wait_options=wait_options
        )

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> DepositReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.deposit(
            self._amount, self._asset.erc20_token, wait_options=wait_options
        )
        return DepositReceipt(
            tx_hash=receipt["transactionHash"],
            route=TokenRoute.SELF_FUNDED,
            account=self._ctx.signer_address,
            asset=self._asset.address,
            amount=self._amount,
            raw=receipt,
        )
