from __future__ import annotations

from dataclasses import dataclass
from typing import (
    Any,
    Callable,
    Dict,
    Iterable,
    List,
    Optional,
    Sequence,
    Tuple,
    Union,
)

import httpx

from ..amounts import format_units, parse_amount, to_base_units
from ..errors import SpendLimitError
from .models import AssetRef, PaymentRecord, SpendLimits
from .protocols import PaymentProtocol, PaymentTerms
from .session import NetworkSession, asset_ref


def _as_list(value: Union[str, Sequence[str], None]) -> List[str]:
    if value is None:
        return []
    # Anything that is not a collection is one entry, for `parse_amount` to
    # accept or refuse with a message that names it.
    if isinstance(value, str) or not isinstance(value, Iterable):
        return [value]
    return list(value)


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
    ) -> Reservation:
        """Counts *terms* against the limits, or raises
        :class:`SpendLimitError`."""
        if self._pay_to is not None and terms.pay_to.lower() not in self._pay_to:
            raise SpendLimitError(
                "pay_to", url, f"{terms.pay_to} is not in the allowed payees"
            )
        token = await session.try_token(terms.asset)
        if token is None:
            raise SpendLimitError(
                "assets",
                url,
                f"{terms.asset} is not an asset 4Mica accepts on {session.caip2}",
            )
        asset = asset_ref(token)

        def show(amount: int) -> str:
            return f"{format_units(amount, asset.decimals)} {asset.symbol}"

        per_payment = await self._limit_for(session, self._per_payment, asset)
        if per_payment is None:
            raise SpendLimitError(
                "assets",
                url,
                f"the seller asks for {asset.symbol}, which no per_payment limit names",
            )
        if terms.amount > per_payment:
            raise SpendLimitError(
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
            raise SpendLimitError(
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
    ctx: FetchContext, method: str, url: Union[str, httpx.URL], **kwargs: Any
) -> httpx.Response:
    send_options = {
        name: kwargs.pop(name)
        for name in ("auth", "follow_redirects")
        if name in kwargs
    }
    request = ctx.http.build_request(method, url, **kwargs)
    # Read once, so the retry carries the same bytes whatever the body was
    # built from: a file or a generator would be spent by the first send.
    body = await request.aread()
    response = await ctx.http.send(request, **send_options)
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

    refusals: List[SpendLimitError] = []
    for protocol, terms, session in options:
        try:
            reservation = await ctx.limiter.reserve(session, terms, str(request.url))
        except SpendLimitError as refusal:
            refusals.append(refusal)
            continue

        headers = request.headers.copy()
        try:
            headers.update(await protocol.pay(terms, session.client, ctx.http))
        except BaseException:
            # Nothing has left this process.
            ctx.limiter.release(reservation)
            raise
        # Retried once; a second 402 goes back to the caller. If this raises
        # the amount stays reserved: the seller may hold the payment and
        # redeem it.
        paid = await ctx.http.send(
            httpx.Request(
                request.method,
                request.url,
                headers=headers,
                content=body,
                extensions=request.extensions,
            ),
            **send_options,
        )
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
    # Every option was refused; the first is the one the seller preferred.
    raise refusals[0]
