"""Client-facing models: assets, routes, receipts, positions."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional, Union

from ..errors import InvalidParamsError
from ..models import ZERO_ADDRESS
from ..utils import normalize_address, parse_u256


@dataclass(frozen=True)
class Asset:
    """Which asset an operation moves. The contract names the asset by its
    token address, with the zero address standing for native ETH."""

    address: str

    @classmethod
    def native(cls) -> "Asset":
        return cls(ZERO_ADDRESS)

    @classmethod
    def erc20(cls, token: str) -> "Asset":
        return cls(normalize_address(token))

    @classmethod
    def coerce(cls, value: Union["Asset", str, None]) -> "Asset":
        """Accepts an :class:`Asset`, a token address string, or ``None`` /
        the zero address for native ETH."""
        if value is None:
            return cls.native()
        if isinstance(value, Asset):
            return value
        return cls(normalize_address(value))

    @property
    def is_native(self) -> bool:
        return self.address.lower() == ZERO_ADDRESS

    @property
    def erc20_token(self) -> Optional[str]:
        """The token address, or ``None`` for native ETH — the shape the
        contract gateway's optional-token parameters take."""
        return None if self.is_native else self.address


class Route(str, Enum):
    """How a contract-verified operation reached the chain."""

    GASLESS = "gasless"
    SELF_FUNDED = "self_funded"


class TokenRoute(str, Enum):
    """How a token-moving operation reached the chain. Unlike :class:`Route`,
    the authorization scheme matters here — it decides which tokens qualify."""

    EIP3009 = "eip3009"
    PERMIT2 = "permit2"
    SPONSORED_PERMIT2 = "sponsored_permit2"
    SELF_FUNDED = "self_funded"


@dataclass
class AssetPosition:
    """The signer's standing in one asset, as the contract records it."""

    asset: str
    collateral: int
    withdrawal_request_amount: int
    withdrawal_request_timestamp: int

    @classmethod
    def from_gateway(cls, raw: Dict[str, Any]) -> "AssetPosition":
        return cls(
            asset=normalize_address(raw["asset"]),
            collateral=parse_u256(raw["collateral"]),
            withdrawal_request_amount=parse_u256(raw["withdrawal_request_amount"]),
            withdrawal_request_timestamp=int(raw["withdrawal_request_timestamp"]),
        )


@dataclass
class StablecoinPosition:
    """The signer's full position in a yield-bearing stablecoin."""

    asset: str
    principal: int
    guarantee_capacity: int
    gross_yield: int
    protocol_yield_share: int
    user_net_yield: int
    withdrawable_balance: int
    total_user_scaled_balance: int
    protocol_scaled_balance: int
    surplus_scaled_balance: int
    contract_scaled_a_token_balance: int
    stablecoin_a_token: str


@dataclass
class DepositReceipt:
    """Outcome of a deposit, whichever route delivered it."""

    tx_hash: str
    route: TokenRoute
    account: str
    """The account credited — always whoever signed, never a facilitator."""
    asset: str
    amount: int
    network: Optional[str] = None
    raw: Optional[Dict[str, Any]] = field(default=None, repr=False)


@dataclass
class WithdrawReceipt:
    """Outcome of a withdrawal request, cancellation or finalization."""

    tx_hash: str
    route: Route
    account: str
    asset: str
    network: Optional[str] = None
    raw: Optional[Dict[str, Any]] = field(default=None, repr=False)


@dataclass
class PayReceipt:
    """Outcome of a net-debit payment. The debit always comes out of the
    debtor's wallet, whichever route ran."""

    tx_hash: str
    route: TokenRoute
    account: str
    network: Optional[str] = None
    raw: Optional[Dict[str, Any]] = field(default=None, repr=False)


@dataclass
class ClaimReceipt:
    """Outcome of a net-credit claim. The payout goes to the address the
    committed Merkle leaf names, never the submitter."""

    tx_hash: str
    route: Route
    account: str
    network: Optional[str] = None
    raw: Optional[Dict[str, Any]] = field(default=None, repr=False)


def confirm_echoed(field_name: str, raw: Optional[str], expected: str) -> str:
    """Checks a value a server echoed back against what was asked for, taking
    the request's own value when the echo is omitted. An echo that disagrees —
    or cannot be read — means the response describes something nobody asked
    for, and is refused."""
    if raw is None:
        return expected
    if str(raw).lower() == expected.lower():
        return expected
    raise InvalidParamsError(f"server echoed {field_name} {raw}, expected {expected}")
