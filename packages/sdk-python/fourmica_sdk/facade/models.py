from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from ..amounts import Token
from ..app.client import DEFAULT_APP_BASE_URL
from ..client.model import Route, TokenRoute
from ..errors import SpendAccountingError

AssetRef = Token

DEFAULT_DEPOSIT_TIMEOUT_SECS = 60.0

Gas = Literal["auto", "self"]
Wait = Literal["spendable", "mined"]
DepositStatus = Literal["spendable", "pending", "mined"]


@dataclass(frozen=True)
class SpendLimits:
    """Amounts are written like ``"1 USDC"``. A payment is only allowed in an
    asset a ``per_payment`` entry names."""

    per_payment: str | Sequence[str] = "1 USDC"
    total: str | Sequence[str] | None = None
    """One budget per entry for the whole session, across networks: ``"5 USDC"``
    is 5 in all. Once set, only assets an entry names can be paid, so an empty
    list permits nothing. Counts every payment sent, taken or not, in this
    process only."""
    pay_to: str | Sequence[str] | None = None
    """When set, the only payees the session pays."""


AccountingStatus = Literal["recorded", "pending", "failed"]


@dataclass(frozen=True)
class GovernanceOptions:
    """Asks the 4Mica API before each payment is signed, with a key holding
    the ``SPEND_AUTHORIZE`` scope, and consumes or releases what it granted."""

    api_key: str
    base_url: str = DEFAULT_APP_BASE_URL
    agent_id: str | None = None
    approval_timeout_secs: float = 300.0
    poll_interval_secs: float = 2.0
    on_accounting_error: Callable[[SpendAccountingError], None] | None = None


@dataclass(frozen=True)
class GovernanceOutcome:
    authorization_id: str
    accounting: AccountingStatus
    """``"recorded"``, ``"failed"``, or ``"pending"`` when cancelled while
    retrying."""


@dataclass(frozen=True)
class DepositResult:
    status: DepositStatus
    """``"spendable"``, ``"mined"``, or ``"pending"``: mined, but not yet
    counted by core when the wait ended."""
    tx_hash: str
    route: TokenRoute
    amount: str
    amount_raw: int
    asset: AssetRef
    network: str
    """CAIP-2 id."""
    explorer_url: str | None
    _wait: Callable[[float], Awaitable[DepositResult]] = field(
        repr=False, compare=False
    )

    async def spendable(
        self, timeout_secs: float = DEFAULT_DEPOSIT_TIMEOUT_SECS
    ) -> DepositResult:
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
Balances = dict[str, Balance]


SettleAction = Literal["pay", "claim"]
SettleStatus = Literal["settled", "skipped", "failed", "unknown"]


@dataclass(frozen=True)
class Position:
    cycle: str
    """The text id ``settlement.pay(...)`` and ``settlement.claim(...)`` take."""
    cycle_id: str
    """On-chain bytes32 id."""
    asset: AssetRef
    role: Literal["debtor", "creditor"]
    amount: str
    gross_outgoing: str
    gross_incoming: str
    amount_raw: int
    gross_outgoing_raw: int
    gross_incoming_raw: int
    pay_by: datetime
    """The contract refuses a debit paid after this."""
    final_at: datetime
    """After this an unpaid debit is taken from the debtor's collateral."""
    commit_confirmed: bool
    """Until it is, a payment can revert and both times are core's estimate."""
    network: str
    """CAIP-2 id."""


@dataclass(frozen=True)
class SettleResult:
    """``"failed"`` moved nothing. ``"unknown"`` was sent with no answer:
    check before settling again, it may have gone through."""

    position: Position
    action: SettleAction
    status: SettleStatus
    tx_hash: str | None = None
    route: Route | TokenRoute | None = None
    explorer_url: str | None = None
    reason: str | None = None
    error: BaseException | None = None


@dataclass(frozen=True)
class WithdrawResult:
    tx_hash: str
    route: Route
    asset: AssetRef
    network: str
    explorer_url: str | None


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
