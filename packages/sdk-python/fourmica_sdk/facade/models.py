"""What the :class:`~fourmica_sdk.FourMica` facade takes and returns."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Awaitable, Callable, Dict, Optional, Sequence, Union

from ..amounts import Token
from ..client.model import Route, TokenRoute

AssetRef = Token

DEFAULT_DEPOSIT_TIMEOUT_SECS = 60.0


@dataclass(frozen=True)
class SpendLimits:
    """Amounts are written like deposits, ``"1 USDC"``. A payment is only
    allowed in an asset a ``per_payment`` entry names."""

    per_payment: Union[str, Sequence[str]] = "1 USDC"
    total: Union[str, Sequence[str], None] = None
    """Counted in memory by this session only; processes sharing a wallet each
    get their own."""
    pay_to: Optional[Sequence[str]] = None
    """When set, the only payees the session pays."""


@dataclass(frozen=True)
class DepositResult:
    status: str
    """``"spendable"``, ``"mined"``, or ``"pending"``: mined, but not yet
    counted by core when the wait ended."""
    tx_hash: str
    route: TokenRoute
    amount: str
    amount_raw: int
    asset: AssetRef
    network: str
    """CAIP-2 id."""
    explorer_url: Optional[str]
    _wait: Callable[[float], Awaitable["DepositResult"]] = field(
        repr=False, compare=False
    )

    async def spendable(
        self, timeout_secs: float = DEFAULT_DEPOSIT_TIMEOUT_SECS
    ) -> "DepositResult":
        """Waits again for core to count the deposit."""
        return await self._wait(timeout_secs)


@dataclass(frozen=True)
class RawBalance:
    total: int
    locked: int
    available: int


@dataclass(frozen=True)
class Balance:
    asset: AssetRef
    total: str
    locked: str
    available: str
    raw: RawBalance


#: Keyed by symbol, or by address where two assets share one.
Balances = Dict[str, Balance]


@dataclass(frozen=True)
class WithdrawResult:
    tx_hash: str
    route: Route
    asset: AssetRef
    network: str
    explorer_url: Optional[str]


@dataclass(frozen=True)
class PendingWithdrawal:
    asset: AssetRef
    amount: str
    amount_raw: int
    requested_at: datetime
    ready_at: datetime
    ready: bool
    network: str


@dataclass(frozen=True)
class PaymentRecord:
    protocol: str
    network: str
    asset: AssetRef
    amount: str
    amount_raw: int
    pay_to: str
