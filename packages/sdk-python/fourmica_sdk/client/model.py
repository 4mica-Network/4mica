from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ..errors import InvalidParamsError
from ..models import ZERO_ADDRESS
from ..utils import normalize_address, parse_u256


@dataclass(frozen=True)
class Asset:
    """Named by token address; the zero address is native ETH."""

    address: str

    @classmethod
    def native(cls) -> Asset:
        return cls(ZERO_ADDRESS)

    @classmethod
    def erc20(cls, token: str) -> Asset:
        return cls(normalize_address(token))

    @classmethod
    def coerce(cls, value: Asset | str | None) -> Asset:
        """Accepts an :class:`Asset`, a token address, or ``None`` / the zero
        address for native ETH."""
        if value is None:
            return cls.native()
        if isinstance(value, Asset):
            return value
        return cls(normalize_address(value))

    @property
    def is_native(self) -> bool:
        return self.address.lower() == ZERO_ADDRESS

    @property
    def erc20_token(self) -> str | None:
        """The token address, or ``None`` for native ETH."""
        return None if self.is_native else self.address


class Route(str, Enum):
    GASLESS = "gasless"
    SELF_FUNDED = "self_funded"


class TokenRoute(str, Enum):
    EIP3009 = "eip3009"
    PERMIT2 = "permit2"
    SPONSORED_PERMIT2 = "sponsored_permit2"
    SELF_FUNDED = "self_funded"


@dataclass
class AssetPosition:
    asset: str
    collateral: int
    withdrawal_request_amount: int
    withdrawal_request_timestamp: int

    @classmethod
    def from_gateway(cls, raw: dict[str, Any]) -> AssetPosition:
        return cls(
            asset=normalize_address(raw["asset"]),
            collateral=parse_u256(raw["collateral"]),
            withdrawal_request_amount=parse_u256(raw["withdrawal_request_amount"]),
            withdrawal_request_timestamp=int(raw["withdrawal_request_timestamp"]),
        )


@dataclass
class StablecoinPosition:
    asset: str
    principal: int
    guarantee_capacity: int
    gross_yield: int
    protocol_yield_share: int
    user_net_yield: int
    withdrawable_balance: int
    user_shares: int
    total_user_shares: int
    protocol_shares: int
    pool_shares: int
    pool_assets: int
    strategy: str
    """The zero address while the pool's assets sit idle."""


@dataclass
class DepositReceipt:
    tx_hash: str
    route: TokenRoute
    account: str
    """Always whoever signed, never a facilitator."""
    asset: str
    amount: int
    network: str | None = None
    raw: dict[str, Any] | None = field(default=None, repr=False)


@dataclass
class WithdrawReceipt:
    tx_hash: str
    route: Route
    account: str
    asset: str
    network: str | None = None
    raw: dict[str, Any] | None = field(default=None, repr=False)


@dataclass
class PayReceipt:
    """The debit always comes out of the debtor's wallet, whichever route ran."""

    tx_hash: str
    route: TokenRoute
    account: str
    network: str | None = None
    raw: dict[str, Any] | None = field(default=None, repr=False)


@dataclass
class ClaimReceipt:
    """The payout goes to the address the committed leaf names, never the
    submitter."""

    tx_hash: str
    route: Route
    account: str
    network: str | None = None
    raw: dict[str, Any] | None = field(default=None, repr=False)


def base_units(value: int | str) -> int:
    if isinstance(value, (int, str)) and not isinstance(value, bool):
        try:
            return parse_u256(value)
        except ValueError as exc:
            raise InvalidParamsError(f"invalid amount: {exc}") from exc
    raise InvalidParamsError(
        f"amount must be a whole number of base units, got {value!r}"
    )


def confirm_echoed(field_name: str, raw: str | None, expected: str) -> str:
    if raw is None:
        return expected
    if str(raw).lower() == expected.lower():
        return expected
    raise InvalidParamsError(f"server echoed {field_name} {raw}, expected {expected}")
