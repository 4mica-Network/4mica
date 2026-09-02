"""Reading the signer's own balances and positions."""

from __future__ import annotations

from typing import List, Optional, Union

from ..models import AssetBalanceInfo
from .ctx import ClientCtx
from .model import Asset, AssetPosition, StablecoinPosition


class AccountClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    async def assets(self) -> List[AssetPosition]:
        """The signer's position in every asset the contract knows them by."""
        gateway = await self._ctx.gateway()
        raw = await gateway.get_user_assets(self._ctx.signer_address)
        return [AssetPosition.from_gateway(item) for item in raw]

    async def principal_balance(self, asset: Union[Asset, str, None] = None) -> int:
        """Collateral deposited in *asset*, before any yield."""
        gateway = await self._ctx.gateway()
        return await gateway.principal_balance(
            self._ctx.signer_address, Asset.coerce(asset).address
        )

    async def withdrawable_balance(self, asset: Union[Asset, str, None] = None) -> int:
        """What the signer could withdraw from *asset* right now."""
        gateway = await self._ctx.gateway()
        return await gateway.withdrawable_balance(
            self._ctx.signer_address, Asset.coerce(asset).address
        )

    async def stablecoin_position(self, token: str) -> StablecoinPosition:
        """The signer's full position in a yield-bearing stablecoin: principal,
        yield and how it is split, plus the pool-level totals the split is
        derived from."""
        gateway = await self._ctx.gateway()
        user = self._ctx.signer_address
        token_address = Asset.erc20(token).address

        return StablecoinPosition(
            asset=token_address,
            principal=await gateway.principal_balance(user, token_address),
            guarantee_capacity=await gateway.guarantee_capacity(user, token_address),
            gross_yield=await gateway.gross_yield(user, token_address),
            protocol_yield_share=await gateway.protocol_yield_share(
                user, token_address
            ),
            user_net_yield=await gateway.user_net_yield(user, token_address),
            withdrawable_balance=await gateway.withdrawable_balance(
                user, token_address
            ),
            total_user_scaled_balance=await gateway.total_user_scaled_balance(
                token_address
            ),
            protocol_scaled_balance=await gateway.protocol_scaled_balance(
                token_address
            ),
            surplus_scaled_balance=await gateway.surplus_scaled_balance(token_address),
            contract_scaled_a_token_balance=(
                await gateway.contract_scaled_a_token_balance(token_address)
            ),
            stablecoin_a_token=await gateway.stablecoin_a_token(token_address),
        )

    async def asset_balance(
        self, asset: Union[Asset, str, None] = None
    ) -> Optional[AssetBalanceInfo]:
        """The signer's balance in *asset* as guarantees are accounted against
        it, including how much is currently locked. ``None`` when the signer
        holds nothing in that asset. Lags the chain: a fresh deposit appears
        once it has been observed and confirmed."""
        return await self._ctx.rpc.get_user_asset_balance(
            self._ctx.signer_address, Asset.coerce(asset).address
        )
