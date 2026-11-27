"""What the :class:`~fourmica_sdk.FourMica` facade takes and returns."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Awaitable, Callable, Dict, Literal, Optional, Sequence, Union

from ..amounts import Token
from ..client.model import Route, TokenRoute

AssetRef = Token

DEFAULT_DEPOSIT_TIMEOUT_SECS = 60.0

Gas = Literal["auto", "self"]
Wait = Literal["spendable", "mined"]
DepositStatus = Literal["spendable", "pending", "mined"]


@dataclass(frozen=True)
class SpendLimits:
    """Amounts are written like deposits, ``"1 USDC"``. A payment is only
    allowed in an asset a ``per_payment`` entry names."""

    per_payment: Union[str, Sequence[str]] = "1 USDC"
    total: Union[str, Sequence[str], None] = None
    """Each entry is one budget for the whole session, shared by every
    network it pays on: ``"5 USDC"`` is 5 USDC in all, not 5 on each. Once
    set, a payment is only allowed in an asset an entry names. Every payment
    sent to a seller counts, whether or not the seller took it. Counted in
    memory by this session only; processes sharing a wallet each get their
    own."""
    pay_to: Union[str, Sequence[str], None] = None
    """When set, the only payees the session pays."""


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


SettleAction = Literal["pay", "claim"]
SettleStatus = Literal["settled", "skipped", "failed", "unknown"]


@dataclass(frozen=True)
class Position:
    """A net position the wallet can still settle: a debit to pay or a credit
    to claim, for one asset in one settlement cycle. Within a cycle a wallet
    is a debtor or a creditor, never both."""

    cycle: str
    """The cycle, as ``settlement.pay(...)`` and ``settlement.claim(...)`` take it."""
    cycle_id: str
    """The cycle's on-chain bytes32 id."""
    asset: AssetRef
    role: Literal["debtor", "creditor"]
    """A debtor pays ``amount``; a creditor claims it."""
    amount: str
    """The net amount."""
    gross_outgoing: str
    """What the wallet paid others in the cycle, before netting."""
    gross_incoming: str
    """What others paid the wallet in the cycle, before netting."""
    amount_raw: int
    gross_outgoing_raw: int
    gross_incoming_raw: int
    pay_by: datetime
    """A debit has to be paid by this time; the contract refuses it after."""
    final_at: datetime
    """After this time an unpaid debit is taken from the debtor's collateral.
    A credit can be claimed once every debtor in the cycle has paid, and
    otherwise from this time on."""
    commit_confirmed: bool
    """Whether the cycle's commit is final on-chain. Until it is, a payment
    can revert and both times are core's estimate."""
    network: str
    """CAIP-2 id."""


@dataclass(frozen=True)
class SettleResult:
    """What became of one position in a ``settle()`` call.

    - ``"settled"``: paid or claimed; ``tx_hash`` is the transaction.
    - ``"skipped"``: not attempted; ``reason`` says why.
    - ``"failed"``: refused or reverted; ``error`` says why. Nothing moved.
    - ``"unknown"``: sent, and no answer came back (``error`` is an
      ``OutcomeUnknownError``). Check before settling again: it may have
      gone through.
    """

    position: Position
    action: SettleAction
    status: SettleStatus
    tx_hash: Optional[str] = None
    route: Optional[Union[Route, TokenRoute]] = None
    """How it reached the chain: a payment moves a token, so it names the scheme."""
    explorer_url: Optional[str] = None
    reason: Optional[str] = None
    error: Optional[BaseException] = None


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
