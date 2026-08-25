"""Server-side 4mica scheme implementation for x402."""

from __future__ import annotations

from typing import Callable, List

from x402.interfaces import SchemeNetworkServer
from x402.schemas import AssetAmount, Network, PaymentRequirements, Price

from .constants import DEFAULT_ASSETS, UnsupportedNetworkError

MoneyParser = Callable[[float, Network], AssetAmount | None]


class FourMicaEvmScheme(SchemeNetworkServer):
    """EVM server-side scheme for 4mica credit payments."""

    scheme = "4mica-credit"

    def __init__(self, advertised_tab_endpoint: str) -> None:
        self._advertised_tab_endpoint = advertised_tab_endpoint
        self._money_parsers: List[MoneyParser] = []

    def register_money_parser(self, parser: MoneyParser) -> "FourMicaEvmScheme":
        self._money_parsers.append(parser)
        return self

    def parse_price(self, price: Price, network: Network) -> AssetAmount:
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
        del supported_kind, extensions
        extra = requirements.extra or {}
        extra["tabEndpoint"] = self._advertised_tab_endpoint
        requirements.extra = extra
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
        asset_info = DEFAULT_ASSETS.get(network)
        if not asset_info:
            raise UnsupportedNetworkError(f"No default asset configured for network {network}")
        token_amount = self._convert_to_token_amount(str(amount), asset_info["decimals"])
        return AssetAmount(
            amount=token_amount,
            asset=asset_info["address"],
            extra={
                "name": asset_info["name"],
                "version": asset_info["version"],
            },
        )

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
