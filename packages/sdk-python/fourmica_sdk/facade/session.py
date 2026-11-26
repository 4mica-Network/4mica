from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from ..amounts import ResolvedToken, Token, TokenLike, is_native_asset, resolve_token
from ..client import Client
from ..contract import ContractGateway
from ..errors import TokenNotSupportedError
from ..models import SupportedTokenInfo
from ..networks import NetworkInfo
from .models import AssetRef


class NetworkSession:
    """One network of a ``FourMica`` session. ``info`` is ``None`` for a
    self-hosted core."""

    def __init__(
        self, name: str, caip2: str, info: Optional[NetworkInfo], client: Client
    ) -> None:
        self.name = name
        self.caip2 = caip2
        self.info = info
        self.client = client
        self._tokens: Optional[List[SupportedTokenInfo]] = None
        self._tokens_lock = asyncio.Lock()
        self._deposit_locks: Dict[str, asyncio.Lock] = {}

    @property
    def native_symbol(self) -> str:
        return self.info.native_symbol if self.info else "ETH"

    async def tokens(self) -> List[SupportedTokenInfo]:
        async with self._tokens_lock:
            if self._tokens is None:
                self._tokens = (await self.client.tokens.supported()).tokens
            return self._tokens

    async def token(self, value: str) -> ResolvedToken:
        tokens = (
            [] if is_native_asset(value, self.native_symbol) else await self.tokens()
        )
        return resolve_token(tokens, value, self.native_symbol, self.caip2)

    async def try_token(self, value: str) -> Optional[ResolvedToken]:
        """Like :meth:`token`, but ``None`` for an asset core does not list."""
        try:
            return await self.token(value)
        except TokenNotSupportedError:
            return None

    def deposit_lock(self, asset: str) -> asyncio.Lock:
        """Held while a deposit of *asset* is sent and waited for."""
        return self._deposit_locks.setdefault(asset.lower(), asyncio.Lock())

    async def chain(self) -> Optional[ContractGateway]:
        """The chain gateway, or ``None`` for a remote signer: it has no local
        key to read the wallet with or send a transaction from."""
        ctx = self.client.ctx
        if not ctx.cfg.wallet_private_key:
            return None
        return await ctx.gateway()

    def explorer_tx(self, tx_hash: str) -> Optional[str]:
        return f"{self.info.explorer_url}/tx/{tx_hash}" if self.info else None


def asset_ref(token: TokenLike) -> AssetRef:
    return Token(symbol=token.symbol, address=token.address, decimals=token.decimals)
