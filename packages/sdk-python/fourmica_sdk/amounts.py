from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from .errors import (
    AmbiguousTokenError,
    AmountPrecisionError,
    InvalidParamsError,
    TokenNotSupportedError,
)
from .models import ZERO_ADDRESS

_MAX_DECIMALS = 255

_DECIMAL = re.compile(r"(\d+)(?:\.(\d+))?", re.ASCII)
_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")


@dataclass(frozen=True)
class AmountSpec:
    amount: str
    """Decimal string in the asset's units, e.g. ``"0.10"``; not base units."""
    asset: str
    """Symbol, native symbol or token address."""


AmountInput = str | AmountSpec | Mapping[str, Any]


class TokenLike(Protocol):
    @property
    def symbol(self) -> str: ...

    @property
    def address(self) -> str: ...

    @property
    def decimals(self) -> int: ...


@dataclass(frozen=True)
class Token:
    symbol: str
    address: str
    decimals: int


@dataclass(frozen=True)
class ResolvedToken(Token):
    native: bool = False


def parse_decimal(value: Any) -> str:
    if not isinstance(value, str):
        raise InvalidParamsError(
            'amount must be a decimal string such as "5" or "0.10", got '
            f"{value!r}; numbers are refused because base units and whole "
            "units would be indistinguishable"
        )
    trimmed = value.strip()
    if not _DECIMAL.fullmatch(trimmed):
        raise InvalidParamsError(
            'amount must be a non-negative decimal such as "5" or "0.10", got '
            f"{value!r}"
        )
    return trimmed


def _require_decimals(decimals: Any) -> None:
    if isinstance(decimals, bool) or not isinstance(decimals, int):
        raise InvalidParamsError(f"invalid token decimals: {decimals!r}")
    if decimals < 0 or decimals > _MAX_DECIMALS:
        raise InvalidParamsError(f"invalid token decimals: {decimals}")


def parse_amount(value: AmountInput) -> AmountSpec:
    if isinstance(value, str):
        try:
            written, symbol = value.split()
        except ValueError:
            raise InvalidParamsError(
                f'expected an amount and its asset, such as "5 USDC", got {value!r}'
            ) from None
        return AmountSpec(amount=parse_decimal(written), asset=symbol)
    raw: object = value
    amount: Any = None
    asset: Any = None
    if isinstance(raw, AmountSpec):
        amount, asset = raw.amount, raw.asset
    elif isinstance(raw, Mapping):
        amount, asset = raw.get("amount"), raw.get("asset")
    if not isinstance(asset, str) or not asset.strip():
        raise InvalidParamsError(
            f'expected "5 USDC" or {{"amount": "5", "asset": "USDC"}}, got {value!r}'
        )
    return AmountSpec(amount=parse_decimal(amount), asset=asset.strip())


def to_base_units(amount: str, decimals: int) -> int:
    _require_decimals(decimals)
    value = parse_decimal(amount)
    whole, _, fraction = value.partition(".")
    fraction = fraction.rstrip("0")
    if len(fraction) > decimals:
        raise AmountPrecisionError(value, decimals)
    scale: int = 10**decimals
    return int(whole) * scale + int(fraction.ljust(decimals, "0") or "0")


def format_units(raw: int, decimals: int) -> str:
    _require_decimals(decimals)
    if decimals == 0:
        return str(raw)
    digits = str(abs(raw)).rjust(decimals + 1, "0")
    whole, fraction = digits[:-decimals], digits[-decimals:].rstrip("0")
    sign = "-" if raw < 0 else ""
    return f"{sign}{whole}.{fraction}" if fraction else f"{sign}{whole}"


def is_native_asset(value: str, native_symbol: str = "ETH") -> bool:
    wanted = value.strip()
    return wanted.lower() == ZERO_ADDRESS or wanted.upper() == native_symbol.upper()


def resolve_token(
    tokens: Sequence[TokenLike],
    value: str,
    native_symbol: str = "ETH",
    network: str | None = None,
) -> ResolvedToken:
    wanted = value.strip()
    if is_native_asset(wanted, native_symbol):
        return ResolvedToken(
            symbol=native_symbol, address=ZERO_ADDRESS, decimals=18, native=True
        )

    key = "address" if _ADDRESS.fullmatch(wanted) else "symbol"
    matches = [t for t in tokens if getattr(t, key).lower() == wanted.lower()]
    if not matches:
        raise TokenNotSupportedError(wanted, tokens, network)
    if len(matches) > 1:
        raise AmbiguousTokenError(wanted, matches)
    match = matches[0]
    return ResolvedToken(
        symbol=match.symbol, address=match.address, decimals=match.decimals
    )
