from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from fractions import Fraction
from http import HTTPStatus
from typing import (
    Any,
)

import httpx

from ..amounts import format_units, parse_amount, to_base_units
from ..errors import SpendLimitError
from .models import AssetRef, PaymentRecord, SpendLimits
from .protocols import PaymentProtocol, PaymentTerms
from .session import NetworkSession, asset_ref


def _as_list(value: str | Sequence[str] | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str) or not isinstance(value, Iterable):
        return [value]
    return list(value)


@dataclass(frozen=True)
class Reservation:
    budget: int | None
    units: Fraction
    asset: AssetRef


class SpendLimiter:
    def __init__(self, limits: SpendLimits | None = None) -> None:
        limits = limits or SpendLimits()
        self._per_payment = _as_list(limits.per_payment)
        self._total = _as_list(limits.total)
        self._total_unset = limits.total is None
        self._pay_to = (
            None
            if limits.pay_to is None
            else {payee.lower() for payee in _as_list(limits.pay_to)}
        )
        for spec in (*self._per_payment, *self._total):
            parse_amount(spec)
        # Whole units: one budget across networks, whatever their decimals.
        self._spent: list[Fraction] = [Fraction(0)] * len(self._total)

    async def reserve(
        self, session: NetworkSession, terms: PaymentTerms, url: str
    ) -> Reservation:
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
        scale = 10**asset.decimals

        def show(units: Fraction) -> str:
            return f"{format_units(int(units * scale), asset.decimals)} {asset.symbol}"

        asked = Fraction(terms.amount, scale)
        per_payment = await self._limit_for(session, self._per_payment, asset)
        if per_payment is None:
            raise SpendLimitError(
                "assets",
                url,
                f"the seller asks for {asset.symbol}, which no per_payment limit names",
            )
        _, cap = per_payment
        if asked > cap:
            raise SpendLimitError(
                "per_payment",
                url,
                f"the seller asks {show(asked)}, over the "
                f"{show(cap)} per-payment limit",
            )

        # An empty list names no asset, so it permits nothing.
        if self._total_unset:
            return Reservation(budget=None, units=asked, asset=asset)
        total = await self._limit_for(session, self._total, asset)
        if total is None:
            # Leaving unnamed assets uncapped would let spending walk around it.
            raise SpendLimitError(
                "assets",
                url,
                f"the seller asks for {asset.symbol}, which no total limit names",
            )
        # No await from here to the write, or concurrent payments could overshoot.
        budget, limit = total
        spent = self._spent[budget]
        if spent + asked > limit:
            raise SpendLimitError(
                "total",
                url,
                f"{show(spent)} spent so far; {show(asked)} more would "
                f"pass the {show(limit)} session limit",
            )
        self._spent[budget] = spent + asked
        return Reservation(budget=budget, units=asked, asset=asset)

    def release(self, reservation: Reservation) -> None:
        if reservation.budget is not None:
            self._spent[reservation.budget] -= reservation.units

    async def _limit_for(
        self, session: NetworkSession, specs: Sequence[str], asset: AssetRef
    ) -> tuple[int, Fraction] | None:
        for index, spec in enumerate(specs):
            parsed = parse_amount(spec)
            token = await session.try_token(parsed.asset)
            if token and token.address.lower() == asset.address.lower():
                units = to_base_units(parsed.amount, token.decimals)
                return index, Fraction(units, 10**token.decimals)
        return None


_DEFAULT_PORTS = {"http": 80, "https": 443}


def _port(url: httpx.URL) -> int | None:
    return url.port or _DEFAULT_PORTS.get(url.scheme)


def _same_party(asked: httpx.URL, answered: httpx.URL) -> bool:
    if asked.host != answered.host:
        return False
    if asked.scheme == answered.scheme:
        return _port(asked) == _port(answered)
    return (asked.scheme, _port(asked), answered.scheme, _port(answered)) == (
        "http",
        80,
        "https",
        443,
    )


@dataclass
class FetchContext:
    http: httpx.AsyncClient
    protocols: Sequence[PaymentProtocol]
    session_for: Callable[[str], NetworkSession | None]
    limiter: SpendLimiter
    record: Callable[[httpx.Response, PaymentRecord], None]


async def paying_fetch(
    ctx: FetchContext, method: str, url: str | httpx.URL, **kwargs: Any
) -> httpx.Response:
    send_options = {
        name: kwargs.pop(name)
        for name in ("auth", "follow_redirects")
        if name in kwargs
    }
    request = ctx.http.build_request(method, url, **kwargs)
    # Read once, so the paid retry resends the same bytes.
    await request.aread()
    response = await ctx.http.send(request, **send_options)
    if response.status_code != HTTPStatus.PAYMENT_REQUIRED:
        return response

    # A redirect to another origin is never paid: the caller never named it.
    challenged = response.request
    if not _same_party(request.url, challenged.url):
        return response

    options: list[tuple[PaymentProtocol, PaymentTerms, NetworkSession]] = []
    for protocol in ctx.protocols:
        for terms in protocol.terms(response):
            session = ctx.session_for(terms.network)
            if session is not None:
                options.append((protocol, terms, session))
    if not options:
        return response

    body = await challenged.aread()

    async def pay_and_send(
        protocol: PaymentProtocol,
        terms: PaymentTerms,
        session: NetworkSession,
        reservation: Reservation | None = None,
    ) -> tuple[httpx.Response, Reservation]:
        """*reservation* is the one a payment for the same *terms* holds: paying
        them again signs the same payment, so the seller can redeem one."""
        again = reservation is not None
        if reservation is None:
            reservation = await ctx.limiter.reserve(session, terms, str(challenged.url))
        headers = challenged.headers.copy()
        headers.pop("transfer-encoding", None)
        try:
            headers.update(await protocol.pay(terms, session.client, ctx.http))
        except BaseException:
            # Nothing has left this process, unless this is the second time.
            if not again:
                ctx.limiter.release(reservation)
            raise
        # No redirects: they would hand the payment to wherever they point.
        # Stays reserved whatever comes back: the seller holds a signed payment.
        paid = await ctx.http.send(
            httpx.Request(
                challenged.method,
                challenged.url,
                headers=headers,
                content=body,
                extensions=challenged.extensions,
            ),
            **{**send_options, "follow_redirects": False},
        )
        return paid, reservation

    refusals: list[SpendLimitError] = []
    for protocol, terms, session in options:
        try:
            paid, reservation = await pay_and_send(protocol, terms, session)
        except SpendLimitError as refusal:
            refusals.append(refusal)
            continue
        if paid.status_code == HTTPStatus.PAYMENT_REQUIRED and await protocol.recover(
            paid, terms, session.client
        ):
            # Once: a seller refusing again is not something paying fixes.
            paid, reservation = await pay_and_send(
                protocol, terms, session, reservation
            )
        if paid.status_code == HTTPStatus.PAYMENT_REQUIRED:
            return paid
        # A seller that says nothing is taken to charge for what it delivered.
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
    raise refusals[0]
