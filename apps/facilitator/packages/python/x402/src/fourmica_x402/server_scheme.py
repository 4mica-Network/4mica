"""Server-side 4mica scheme implementation for x402."""

from __future__ import annotations

from typing import Callable, Dict, List, Mapping, Optional, Tuple

import httpx
from fourmica_sdk import SupportedTokensResponse, resolve_network_rpc_url
from x402.interfaces import SchemeNetworkServer
from x402.payment_flow import (
    AUTHORIZATION_PAYMENT_FLOW,
    SDK_DEFAULT_ASSET_TRANSFER_METHOD,
)
from x402.schemas import AssetAmount, Network, PaymentRequirements, Price

from .constants import UnsupportedNetworkError

MoneyParser = Callable[[float, Network], AssetAmount | None]


class FourMicaEvmScheme(SchemeNetworkServer):
    """EVM server-side scheme for 4mica credit payments.

    A money price (``"$0.10"``) resolves to the stablecoin core lists for the
    network (``GET /core/tokens``), so the advertised asset is always one core
    accepts a guarantee against. The token list is fetched once per network and
    cached for the life of the instance; a failed lookup is not cached.

    *core_urls* points a network at a self-hosted core instead of the hosted
    deployment, and *stablecoin_symbol* names the token a money price is in.
    """

    scheme = "4mica-credit"
    # No on-wire assetTransferMethod: a claim is a claim. The signed payment
    # is verified before the handler runs and settled (guarantee issued) after
    # it — the library's authorization flow.
    default_asset_transfer_method = SDK_DEFAULT_ASSET_TRANSFER_METHOD
    payment_flows = {SDK_DEFAULT_ASSET_TRANSFER_METHOD: AUTHORIZATION_PAYMENT_FLOW}

    def __init__(
        self,
        core_urls: Optional[Mapping[str, str]] = None,
        stablecoin_symbol: str = "USDC",
    ) -> None:
        self._money_parsers: List[MoneyParser] = []
        self._core_urls = dict(core_urls or {})
        self._stablecoin_symbol = stablecoin_symbol
        # network -> (address, decimals)
        self._default_assets: Dict[str, Tuple[str, int]] = {}

    @staticmethod
    def _load_supported_tokens(core_url: str) -> SupportedTokensResponse:
        """Core's token list. Synchronous because x402 parses prices
        synchronously; static so tests can stub the network call."""
        response = httpx.get(f"{core_url.rstrip('/')}/core/tokens", timeout=10)
        response.raise_for_status()
        return SupportedTokensResponse.from_rpc(response.json())

    def register_money_parser(self, parser: MoneyParser) -> "FourMicaEvmScheme":
        self._money_parsers.append(parser)
        return self

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
        # x402 validates route configs into AssetAmount models before asking
        # the scheme; one arriving here is already parsed.
        if isinstance(price, AssetAmount):
            return price
        if isinstance(price, dict) and "amount" in price:
            if not price.get("asset"):
                raise ValueError(f"Asset address must be specified for network {network}")
            return AssetAmount(
                amount=str(price["amount"]),
                asset=str(price["asset"]),
                extra=price.get("extra") or {},
            )

        amount = self._parse_money_to_decimal(price)
        for parser in self._money_parsers:
            result = parser(amount, network)
            if result is not None:
                return result

        return self._default_money_conversion(amount, network)

    def enhance_payment_requirements(
        self,
        requirements: PaymentRequirements,
        supported_kind,
        extensions: list[str],
    ) -> PaymentRequirements:
        # Nothing to add: a 4mica-credit payer needs nothing beyond payTo,
        # asset, amount and the optional extra.validation and extra.rpcUrl, and
        # takes everything else from core.
        del supported_kind, extensions
        return requirements

    def _parse_money_to_decimal(self, money: str | float | int) -> float:
        if isinstance(money, (int, float)):
            return float(money)
        if isinstance(money, str):
            clean = money.replace("$", "").strip()
            try:
                return float(clean)
            except ValueError as exc:
                raise ValueError(f"Invalid money format: {money}") from exc
        raise ValueError(f"Invalid money type: {type(money)}")

    def _default_money_conversion(self, amount: float, network: Network) -> AssetAmount:
        address, decimals = self._default_asset(network)
        return AssetAmount(
            amount=self._convert_to_token_amount(str(amount), decimals),
            asset=address,
            # No EIP-3009 domain hints: a 4mica-credit payer signs against
            # core's ClearingHouse domain, never the token's, and reads it from
            # core.
            extra={},
        )

    def _default_asset(self, network: Network) -> Tuple[str, int]:
        """The stablecoin core lists for *network*, fetched once and cached."""
        cached = self._default_assets.get(network)
        if cached is None:
            cached = self._resolve_default_asset(network)
            self._default_assets[network] = cached
        return cached

    def _resolve_default_asset(self, network: Network) -> Tuple[str, int]:
        core_url = self._core_urls.get(network) or resolve_network_rpc_url(network)
        if not core_url:
            raise UnsupportedNetworkError(
                f"No core API URL known for network {network}; pass one in core_urls"
            )
        tokens = self._load_supported_tokens(core_url).tokens
        wanted = self._stablecoin_symbol.lower()
        token = next((t for t in tokens if t.symbol.lower() == wanted), None)
        if token is None:
            listed = ", ".join(t.symbol for t in tokens) or "none"
            raise UnsupportedNetworkError(
                f"Core at {core_url} lists no {self._stablecoin_symbol} for network "
                f"{network} (listed: {listed})"
            )
        if token.decimals is None:
            raise UnsupportedNetworkError(
                f"Core at {core_url} reports no decimals for {token.symbol} on network {network}"
            )
        return token.address, token.decimals

    def _convert_to_token_amount(self, decimal_amount: str, decimals: int) -> str:
        from decimal import Decimal, InvalidOperation

        try:
            amount = Decimal(decimal_amount)
        except InvalidOperation as exc:
            raise ValueError(f"Invalid amount: {decimal_amount}") from exc
        if amount < 0:
            raise ValueError("Amount must be non-negative")
        token_amount = int(amount * Decimal(10) ** decimals)
        return str(token_amount)
