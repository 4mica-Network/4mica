from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, Union

import httpx

from ..amounts import format_units, parse_amount, to_base_units
from ..errors import SpendLimitError
from .models import AssetRef, PaymentRecord, SpendLimits
from .protocols import PaymentProtocol, PaymentTerms
from .session import NetworkSession, asset_ref


def _as_list(value: Union[str, Sequence[str], None]) -> List[str]:
    if value is None:
        return []
    return [value] if isinstance(value, str) else list(value)


@dataclass(frozen=True)
class Reservation:
    key: str
    amount: int
    asset: AssetRef


class SpendLimiter:
    """Reserves before signing, so concurrent payments cannot overshoot
    ``total``."""

    def __init__(self, limits: Optional[SpendLimits] = None) -> None:
        limits = limits or SpendLimits()
        self._per_payment = _as_list(limits.per_payment)
        self._total = _as_list(limits.total)
        self._pay_to = (
            None
            if limits.pay_to is None
            else {payee.lower() for payee in _as_list(limits.pay_to)}
        )
        self._spent: Dict[str, int] = {}
        for spec in (*self._per_payment, *self._total):
            parse_amount(spec)

    async def reserve(
        self, session: NetworkSession, terms: PaymentTerms, url: str
    ) -> Union[Reservation, SpendLimitError]:
        if self._pay_to is not None and terms.pay_to.lower() not in self._pay_to:
            return SpendLimitError(
                "pay_to", url, f"{terms.pay_to} is not in the allowed payees"
            )
        token = await session.try_token(terms.asset)
        if token is None:
            return SpendLimitError(
                "assets",
                url,
                f"{terms.asset} is not an asset 4Mica accepts on {session.caip2}",
            )
        asset = asset_ref(token)

        def show(amount: int) -> str:
            return f"{format_units(amount, asset.decimals)} {asset.symbol}"

        per_payment = await self._limit_for(session, self._per_payment, asset)
        if per_payment is None:
            return SpendLimitError(
                "assets",
                url,
                f"the seller asks for {asset.symbol}, which no per_payment limit names",
            )
        if terms.amount > per_payment:
            return SpendLimitError(
                "per_payment",
                url,
                f"the seller asks {show(terms.amount)}, over the "
                f"{show(per_payment)} per-payment limit",
            )

        total = await self._limit_for(session, self._total, asset)
        # No await from here to the write, or concurrent payments could overshoot.
        key = f"{session.caip2}:{asset.address.lower()}"
        spent = self._spent.get(key, 0)
        if total is not None and spent + terms.amount > total:
            return SpendLimitError(
                "total",
                url,
                f"{show(spent)} spent so far; {show(terms.amount)} more would "
                f"pass the {show(total)} session limit",
            )
        self._spent[key] = spent + terms.amount
        return Reservation(key=key, amount=terms.amount, asset=asset)

    def release(self, reservation: Reservation) -> None:
        self._spent[reservation.key] -= reservation.amount

    async def _limit_for(
        self, session: NetworkSession, specs: Sequence[str], asset: AssetRef
    ) -> Optional[int]:
        for spec in specs:
            parsed = parse_amount(spec)
            token = await session.try_token(parsed.asset)
            if token and token.address.lower() == asset.address.lower():
                return to_base_units(parsed.amount, token.decimals)
        return None


@dataclass
class FetchContext:
    http: httpx.AsyncClient
    protocols: Sequence[PaymentProtocol]
    session_for: Callable[[str], Optional[NetworkSession]]
    """``None`` where this session does not pay."""
    limiter: SpendLimiter
    record: Callable[[httpx.Response, PaymentRecord], None]


async def paying_fetch(
    ctx: FetchContext, method: str, url: Any, headers: Any = None, **kwargs: Any
) -> httpx.Response:
    response = await ctx.http.request(method, url, headers=headers, **kwargs)
    if response.status_code != 402:
        return response

    options: List[Tuple[PaymentProtocol, PaymentTerms, NetworkSession]] = []
    for protocol in ctx.protocols:
        for terms in protocol.terms(response):
            session = ctx.session_for(terms.network)
            if session is not None:
                options.append((protocol, terms, session))
    if not options:
        return response

    refusal: Optional[SpendLimitError] = None
    for protocol, terms, session in options:
        reservation = await ctx.limiter.reserve(session, terms, str(url))
        if isinstance(reservation, SpendLimitError):
            refusal = refusal or reservation
            continue

        paying = httpx.Headers(headers)
        try:
            paying.update(await protocol.pay(terms, session.client, ctx.http))
        except BaseException:
            # Nothing has left this process.
            ctx.limiter.release(reservation)
            raise
        # Retried once; a second 402 goes back to the caller. If this raises
        # the amount stays reserved: the seller may hold the payment and
        # redeem it.
        paid = await ctx.http.request(method, url, headers=paying, **kwargs)
        if paid.status_code == 402:
            ctx.limiter.release(reservation)
            return paid
        # A seller that says nothing is taken to charge for what it delivered.
        # The amount stays reserved either way: the payment is in its hands.
        settled = protocol.settled(paid)
        if paid.is_success if settled is None else settled:
            ctx.record(
                paid,
                PaymentRecord(
                    protocol=protocol.name,
                    network=terms.network,
                    asset=reservation.asset,
                    amount=format_units(terms.amount, reservation.asset.decimals),
                    amount_raw=terms.amount,
                    pay_to=terms.pay_to,
                ),
            )
        return paid
    assert refusal is not None
    raise refusal
