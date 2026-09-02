"""Token utilities shared by the deposit and settlement flows."""

from __future__ import annotations

from typing import Any, Dict, Optional

from ..models import SupportedTokensResponse, TxReceiptWaitOptions
from .ctx import ClientCtx


class TokensClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    async def supported(self) -> SupportedTokensResponse:
        """The assets that can be deposited, with the metadata needed to sign
        for them."""
        return await self._ctx.rpc.get_supported_tokens()

    async def approve(
        self,
        token: str,
        amount: int,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Optional[Dict[str, Any]]:
        """Allows the 4Mica contract to spend *amount* of *token* on the
        signer's behalf. Only self-funded deposits need this. For the contract
        that settles a clearing cycle, use
        ``settlement.pay(...).self_funded().approve()`` instead."""
        gateway = await self._ctx.gateway()
        return await gateway.approve_erc20(token, amount, wait_options=wait_options)
