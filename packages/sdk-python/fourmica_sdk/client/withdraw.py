"""Requesting, cancelling and finalizing withdrawals. Each step is its own
builder so gasless route pins can attach in a later release; today every
terminal is the signer's own transaction."""

from __future__ import annotations

from typing import Optional, Union

from ..errors import AmountZeroError
from ..models import TxReceiptWaitOptions
from .ctx import ClientCtx
from .model import Asset, Route, WithdrawReceipt


class WithdrawClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def request(
        self, asset: Union[Asset, str, None], amount: int
    ) -> "WithdrawStepBuilder":
        """Starts a withdrawal request for *amount* of *asset*. The grace
        period runs from the request; finalize once it elapses."""
        if int(amount) <= 0:
            raise AmountZeroError("withdrawal amount must be positive")
        return WithdrawStepBuilder(
            self._ctx, Asset.coerce(asset), "request", int(amount)
        )

    def cancel(self, asset: Union[Asset, str, None]) -> "WithdrawStepBuilder":
        """Cancels whatever withdrawal request is outstanding for *asset*."""
        return WithdrawStepBuilder(self._ctx, Asset.coerce(asset), "cancel", None)

    def finalize(self, asset: Union[Asset, str, None]) -> "WithdrawStepBuilder":
        """Finalizes the pending withdrawal for *asset* after its grace period."""
        return WithdrawStepBuilder(self._ctx, Asset.coerce(asset), "finalize", None)


class WithdrawStepBuilder:
    def __init__(
        self, ctx: ClientCtx, asset: Asset, step: str, amount: Optional[int]
    ) -> None:
        self._ctx = ctx
        self._asset = asset
        self._step = step
        self._amount = amount

    def self_funded(self) -> "WithdrawStepBuilder":
        """Pins the signer's own transaction (already the only route)."""
        return self

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        token = self._asset.erc20_token
        if self._step == "request":
            receipt = await gateway.request_withdrawal(
                self._amount, token, wait_options=wait_options
            )
        elif self._step == "cancel":
            receipt = await gateway.cancel_withdrawal(token, wait_options=wait_options)
        else:
            receipt = await gateway.finalize_withdrawal(
                token, wait_options=wait_options
            )
        return WithdrawReceipt(
            tx_hash=receipt["transactionHash"],
            route=Route.SELF_FUNDED,
            account=self._ctx.signer_address,
            asset=self._asset.address,
            raw=receipt,
        )
