from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from typing import (
    Any,
    Callable,
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
    budget: Optional[int]
    """Index of the ``total`` entry counted against; ``None`` with no total."""
    units: Fraction
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
        for spec in (*self._per_payment, *self._total):
            parse_amount(spec)
        # One count per ``total`` entry, in whole units: the entry is one
        # budget on every network, whatever the asset's decimals are there.
        self._spent: List[Fraction] = [Fraction(0)] * len(self._total)

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

        if not self._total:
            return Reservation(budget=None, units=asked, asset=asset)
        total = await self._limit_for(session, self._total, asset)
        if total is None:
            # A total that names some assets caps the session; leaving the
            # rest uncapped would make it a limit that is easy to walk around.
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
    ) -> Optional[Tuple[int, Fraction]]:
        """The first entry of *specs* that names *asset* on this network: its
        index, and its amount in whole units."""
        for index, spec in enumerate(specs):
            parsed = parse_amount(spec)
            token = await session.try_token(parsed.asset)
            if token and token.address.lower() == asset.address.lower():
                units = to_base_units(parsed.amount, token.decimals)
                return index, Fraction(units, 10**token.decimals)
        return None


_DEFAULT_PORTS = {"http": 80, "https": 443}


def _port(url: httpx.URL) -> Optional[int]:
    return url.port or _DEFAULT_PORTS.get(url.scheme)


def _same_party(asked: httpx.URL, answered: httpx.URL) -> bool:
    """Whether a redirect stayed with the origin the caller named. The same
    host moving from http to https counts, as it does when httpx decides
    whether to forward credentials."""
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
    # Read once, so a resend carries the same bytes whatever the body was
    # built from: a file or a generator would be spent by the first send.
    await request.aread()
    response = await ctx.http.send(request, **send_options)
    if response.status_code != 402:
        return response

    # After a redirect the 402 answers a different request than the caller
    # made: another URL, and after a 303 another method with no body. That
    # request is the one paid for. A redirect to another origin is not paid
    # at all: the caller never named that party.
    challenged = response.request
    if not _same_party(request.url, challenged.url):
        return response

    options: List[Tuple[PaymentProtocol, PaymentTerms, NetworkSession]] = []
    for protocol in ctx.protocols:
        for terms in protocol.terms(response):
            session = ctx.session_for(terms.network)
            if session is not None:
                options.append((protocol, terms, session))
    if not options:
        return response

    body = await challenged.aread()
    refusals: List[SpendLimitError] = []
    for protocol, terms, session in options:
        try:
            reservation = await ctx.limiter.reserve(session, terms, str(challenged.url))
        except SpendLimitError as refusal:
            refusals.append(refusal)
            continue

        headers = challenged.headers.copy()
        # The body goes out as bytes with a length, whatever it was read from.
        headers.pop("transfer-encoding", None)
        try:
            headers.update(await protocol.pay(terms, session.client, ctx.http))
        except BaseException:
            # Nothing has left this process.
            ctx.limiter.release(reservation)
            raise
        # Retried once, and never across a redirect, which would hand the
        # payment to wherever it points. From here the amount stays reserved
        # whatever comes back, an error or a second 402 included: the seller
        # holds a signed payment, and no answer of its own proves it cannot
        # redeem it.
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
        if paid.status_code == 402:
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
    # Every option was refused; the first is the one the seller preferred.
    raise refusals[0]
