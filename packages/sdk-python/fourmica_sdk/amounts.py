"""Amounts written the way people write them, and the assets they name.

The rules match the TypeScript SDK's ``@4mica/sdk/amounts``; the monorepo's
``packages/sdk/amounts.vectors.json`` pins them for both.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence, Union

from .errors import (
    AmbiguousTokenError,
    AmountPrecisionError,
    InvalidParamsError,
    TokenNotSupportedError,
)
from .models import ZERO_ADDRESS

_DECIMAL = re.compile(r"(\d+)(?:\.(\d+))?", re.ASCII)
_ADDRESS = re.compile(r"0x[0-9a-fA-F]{40}")


@dataclass(frozen=True)
class AmountSpec:
    amount: str
    """Decimal string in the asset's own units, e.g. ``"0.10"``."""
    asset: str
    """Symbol, native symbol or token address."""


#: ``"5 USDC"``, ``{"amount": "5", "asset": "USDC"}`` or an :class:`AmountSpec`.
AmountInput = Union[str, AmountSpec, Mapping[str, Any]]


@dataclass(frozen=True)
class Token:
    """An asset as amounts are written in it."""

    symbol: str
    address: str
    decimals: int


@dataclass(frozen=True)
class ResolvedToken(Token):
    native: bool = False


def parse_decimal(value: Any) -> str:
    """A trimmed non-negative decimal string, or :class:`InvalidParamsError`."""
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
    if decimals < 0 or decimals > 255:
        raise InvalidParamsError(f"invalid token decimals: {decimals}")


def parse_amount(value: AmountInput) -> AmountSpec:
    """Checks the shape only; resolve the asset and decimals separately."""
    if isinstance(value, str):
        parts = value.split()
        if len(parts) != 2:
            raise InvalidParamsError(
                f'expected an amount and its asset, such as "5 USDC", got {value!r}'
            )
        return AmountSpec(amount=parse_decimal(parts[0]), asset=parts[1])
    if isinstance(value, AmountSpec):
        amount, asset = value.amount, value.asset
    elif isinstance(value, Mapping):
        amount, asset = value.get("amount"), value.get("asset")
    else:
        amount, asset = None, None
    if not isinstance(asset, str) or not asset.strip():
        raise InvalidParamsError(
            f'expected "5 USDC" or {{"amount": "5", "asset": "USDC"}}, got {value!r}'
        )
    return AmountSpec(amount=parse_decimal(amount), asset=asset.strip())


def to_base_units(amount: str, decimals: int) -> int:
    """Never rounds: more decimal places than *decimals* is an error."""
    _require_decimals(decimals)
    value = parse_decimal(amount)
    whole, _, fraction = value.partition(".")
    fraction = fraction.rstrip("0")
    if len(fraction) > decimals:
        raise AmountPrecisionError(value, decimals)
    return int(whole) * 10**decimals + int(fraction.ljust(decimals, "0") or "0")


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
    tokens: Sequence[Any],
    value: str,
    native_symbol: str = "ETH",
    network: Optional[str] = None,
) -> ResolvedToken:
    """Matches a symbol (ignoring case) or an address against core's token
    list, each entry with ``symbol``, ``address`` and ``decimals``. The native
    symbol or the zero address is the native asset, which core never lists.
    Symbols come from the token contracts, so two can collide."""
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
