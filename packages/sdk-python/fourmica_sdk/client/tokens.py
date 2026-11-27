from __future__ import annotations

from typing import Any

from ..models import SupportedTokensResponse, TxReceiptWaitOptions
from .ctx import ClientCtx


class TokensClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    async def supported(self) -> SupportedTokensResponse:
        return await self._ctx.rpc.get_supported_tokens()

    async def approve(
        self,
        token: str,
        amount: int,
        wait_options: TxReceiptWaitOptions | None = None,
    ) -> dict[str, Any] | None:
        """Only self-funded deposits need this. For a clearing cycle use
        ``settlement.pay(...).self_funded().approve()``."""
        gateway = await self._ctx.gateway()
        return await gateway.approve_erc20(token, amount, wait_options=wait_options)
