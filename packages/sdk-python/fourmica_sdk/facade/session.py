from __future__ import annotations

import asyncio

from ..amounts import ResolvedToken, Token, TokenLike, is_native_asset, resolve_token
from ..client import Client
from ..contract import ContractGateway
from ..errors import TokenNotSupportedError
from ..models import SupportedTokenInfo
from ..networks import NetworkInfo
from .models import AssetRef


class NetworkSession:
    def __init__(
        self, name: str, caip2: str, info: NetworkInfo | None, client: Client
    ) -> None:
        self.name = name
        self.caip2 = caip2
        self.info = info
        self.client = client
        self._tokens: list[SupportedTokenInfo] | None = None
        self._tokens_lock = asyncio.Lock()
        self._deposit_locks: dict[str, asyncio.Lock] = {}

    @property
    def native_symbol(self) -> str:
        return self.info.native_symbol if self.info else "ETH"

    async def tokens(self) -> list[SupportedTokenInfo]:
        async with self._tokens_lock:
            if self._tokens is None:
                self._tokens = (await self.client.tokens.supported()).tokens
            return self._tokens

    async def token(self, value: str) -> ResolvedToken:
        tokens = (
            [] if is_native_asset(value, self.native_symbol) else await self.tokens()
        )
        return resolve_token(tokens, value, self.native_symbol, self.caip2)

    async def try_token(self, value: str) -> ResolvedToken | None:
        try:
            return await self.token(value)
        except TokenNotSupportedError:
            return None

    def deposit_lock(self, asset: str) -> asyncio.Lock:
        return self._deposit_locks.setdefault(asset.lower(), asyncio.Lock())

    async def chain(self) -> ContractGateway | None:
        ctx = self.client.ctx
        if not ctx.cfg.wallet_private_key:
            return None
        return await ctx.gateway()

    def explorer_tx(self, tx_hash: str) -> str | None:
        return f"{self.info.explorer_url}/tx/{tx_hash}" if self.info else None


def asset_ref(token: TokenLike) -> AssetRef:
    return Token(symbol=token.symbol, address=token.address, decimals=token.decimals)
