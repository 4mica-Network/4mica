from __future__ import annotations

import asyncio
import os
from collections.abc import Mapping, Sequence
from typing import Any, overload
from weakref import WeakKeyDictionary

import httpx

from ..amounts import AmountInput, format_units
from ..client import Client
from ..config import Config, ConfigBuilder, read_env
from ..errors import ClientError, ConfigError, InvalidParamsError
from ..networks import DEFAULT_NETWORK, NETWORKS, resolve_network
from ..signing import EvmSigner
from .deposit import deposit as _deposit
from .fetch import FetchContext, SpendLimiter, paying_fetch
from .models import (
    DEFAULT_DEPOSIT_TIMEOUT_SECS,
    AssetRef,
    Balance,
    Balances,
    DepositResult,
    Gas,
    PaymentRecord,
    PendingWithdrawal,
    Position,
    RawBalance,
    SettleAction,
    SettleResult,
    SpendLimits,
    Wait,
    WithdrawResult,
)
from .protocols import PROTOCOLS, PaymentProtocol, PaymentTerms
from .session import NetworkSession, asset_ref
from .settle import open_positions, settle_all
from .withdraw import (
    cancel_withdrawal,
    finalize_withdrawal,
    pending_withdrawals,
    request_withdrawal,
)

__all__ = [
    "AssetRef",
    "Balance",
    "Balances",
    "DepositResult",
    "FourMica",
    "PaymentProtocol",
    "PaymentRecord",
    "PaymentTerms",
    "PendingWithdrawal",
    "Position",
    "RawBalance",
    "SettleResult",
    "SpendLimits",
    "WithdrawResult",
]


# httpx's 5 s read default would abandon a paid retry.
_FETCH_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)


def _home_config(
    private_key: str | None,
    signer: EvmSigner | None,
    env: Mapping[str, str] | None,
    network: str | None,
    rpc_url: str | None,
    facilitator_url: str | None,
) -> Config:
    builder = ConfigBuilder()
    network_from_env = False
    if not private_key and signer is None:
        source = os.environ if env is None else env
        if not read_env(source, "WALLET_PRIVATE_KEY"):
            raise ConfigError(
                "no signer: pass private_key or signer to FourMica.connect, or "
                "set FOURMICA_WALLET_PRIVATE_KEY"
            )
        builder.from_env(source)
        network_from_env = bool(
            read_env(source, "NETWORK") or read_env(source, "RPC_URL")
        )
    if private_key:
        builder.wallet_private_key(private_key)
    if signer is not None:
        builder.evm_signer(signer)
    if rpc_url:
        builder.rpc_url(rpc_url)
    elif network:
        builder.network(network)
    elif not network_from_env:
        builder.network(DEFAULT_NETWORK)
    if facilitator_url:
        builder.facilitator_url(facilitator_url)
    return builder.build()


async def _connect_session(cfg: Config) -> NetworkSession:
    client = await Client.connect(cfg)
    caip2 = f"eip155:{client.public_params.chain_id}"
    for name, info in NETWORKS.items():
        if info.rpc_url == cfg.rpc_url:
            return NetworkSession(name, caip2, info, client)
    return NetworkSession(caip2, caip2, None, client)


def _to_balance(asset: AssetRef, total: int, locked: int) -> Balance:
    available = max(total - locked, 0)
    return Balance(
        asset=asset,
        total=format_units(total, asset.decimals),
        locked=format_units(locked, asset.decimals),
        available=format_units(available, asset.decimals),
        raw=RawBalance(total=total, locked=locked, available=available),
    )


class FourMica:
    """Build with :meth:`connect`, not the constructor. A session belongs to
    the event loop it was connected on."""

    def __init__(
        self,
        cfg: Config,
        home: NetworkSession,
        protocols: Sequence[PaymentProtocol],
        limiter: SpendLimiter,
        http: httpx.AsyncClient,
        *,
        owns_http: bool,
    ) -> None:
        self._cfg = cfg
        self._home = home
        self._protocols = protocols
        self._limiter = limiter
        self._http = http
        self._owns_http = owns_http
        self._sessions: dict[str, NetworkSession] = {home.caip2: home}
        self._payments: WeakKeyDictionary[httpx.Response, PaymentRecord] = (
            WeakKeyDictionary()
        )
        self._lock = asyncio.Lock()
        self._closing: asyncio.Future[None] | None = None

    @classmethod
    async def connect(
        cls,
        *,
        private_key: str | None = None,
        signer: EvmSigner | None = None,
        env: Mapping[str, str] | None = None,
        network: str | None = None,
        rpc_url: str | None = None,
        facilitator_url: str | None = None,
        spend: SpendLimits | None = None,
        protocols: str | Sequence[str] = ("x402",),
        http_client: httpx.AsyncClient | None = None,
    ) -> FourMica:
        """With neither *private_key* nor *signer*, all configuration comes from
        ``FOURMICA_*`` in *env*; with one, the environment is not read. *rpc_url*
        names a self-hosted core. *http_client* stays the caller's to close."""
        if private_key and signer is not None:
            raise ConfigError("pass private_key or signer, not both")
        chosen = []
        for name in [protocols] if isinstance(protocols, str) else protocols:
            if name not in PROTOCOLS:
                raise ConfigError(
                    f'unknown payment protocol "{name}"; known: ' + ", ".join(PROTOCOLS)
                )
            chosen.append(PROTOCOLS[name])
        limiter = SpendLimiter(spend)
        cfg = _home_config(private_key, signer, env, network, rpc_url, facilitator_url)
        home = await _connect_session(cfg)
        return cls(
            cfg,
            home,
            chosen,
            limiter,
            httpx.AsyncClient(timeout=_FETCH_TIMEOUT)
            if http_client is None
            else http_client,
            owns_http=http_client is None,
        )

    @property
    def address(self) -> str:
        """The address the session signs as, and the account deposits credit."""
        return self._home.client.signer_address

    @property
    def network(self) -> str:
        """A hosted shorthand, or the CAIP-2 id of a self-hosted core."""
        return self._home.name

    async def _session(self, network: str | None = None) -> NetworkSession:
        if self._closing is not None:
            raise ClientError("this FourMica session is closed")
        if network is None:
            return self._home
        resolved = resolve_network(network)
        if resolved is None:
            if network.strip().lower() == self._home.caip2:
                return self._home
            raise ConfigError(
                f'unknown network "{network}"; use a hosted shorthand such as '
                '"base-sepolia" or a CAIP-2 id'
            )
        name, info = resolved
        async with self._lock:
            if self._closing is not None:
                raise ClientError("this FourMica session is closed")
            session = self._sessions.get(info.caip2)
            if session is None:
                builder = ConfigBuilder().network(name)
                if self._cfg.wallet_private_key:
                    builder.wallet_private_key(self._cfg.wallet_private_key)
                if self._cfg.evm_signer is not None:
                    builder.evm_signer(self._cfg.evm_signer)
                session = await _connect_session(builder.build())
                self._sessions[info.caip2] = session
            return session

    async def low_level(self, network: str | None = None) -> Client:
        return (await self._session(network)).client

    async def deposit(
        self,
        amount: AmountInput,
        *,
        network: str | None = None,
        gas: Gas = "auto",
        wait: Wait = "spendable",
        timeout_secs: float = DEFAULT_DEPOSIT_TIMEOUT_SECS,
    ) -> DepositResult:
        """Gasless where it can; waits for core to count it unless
        ``wait="mined"``. Timing out returns ``"pending"``, not an error. A
        concurrent deposit to the same account from elsewhere can pass for this one."""
        session = await self._session(network)
        return await _deposit(session, amount, gas, wait, timeout_secs)

    @overload
    async def balance(self, *, network: str | None = None) -> Balances: ...

    @overload
    async def balance(self, asset: str, *, network: str | None = None) -> Balance: ...

    async def balance(
        self, asset: str | None = None, *, network: str | None = None
    ) -> Balance | Balances:
        """Without *asset*, every asset the wallet holds collateral in."""
        session = await self._session(network)

        async def read(ref: AssetRef) -> Balance | None:
            info = await session.client.account.asset_balance(ref.address)
            return _to_balance(ref, info.total, info.locked) if info else None

        if asset is not None:
            ref = asset_ref(await session.token(asset))
            return await read(ref) or _to_balance(ref, 0, 0)

        refs = [asset_ref(await session.token(session.native_symbol))]
        refs += [asset_ref(token) for token in await session.tokens()]
        balances: Balances = {}
        for found in await asyncio.gather(*(read(ref) for ref in refs)):
            if found is None:
                continue
            symbol, address = found.asset.symbol, found.asset.address
            balances[address if symbol in balances else symbol] = found
        return balances

    async def withdraw(
        self, amount: AmountInput, *, network: str | None = None
    ) -> WithdrawResult:
        """:meth:`finalize_withdrawal` pays it out after the grace period."""
        return await request_withdrawal(await self._session(network), amount)

    async def finalize_withdrawal(
        self, asset: str, *, network: str | None = None
    ) -> WithdrawResult:
        """Raises before the grace period has passed, saying when it will."""
        return await finalize_withdrawal(await self._session(network), asset)

    async def cancel_withdrawal(
        self, asset: str, *, network: str | None = None
    ) -> WithdrawResult:
        return await cancel_withdrawal(await self._session(network), asset)

    async def withdrawals(
        self, *, network: str | None = None
    ) -> list[PendingWithdrawal]:
        return await pending_withdrawals(await self._session(network))

    async def positions(self, *, network: str | None = None) -> list[Position]:
        """Soonest deadline first. Paid, claimed and defaulted positions are not
        listed."""
        return await open_positions(await self._session(network))

    async def settle(
        self,
        *,
        only: SettleAction | None = None,
        network: str | None = None,
    ) -> list[SettleResult]:
        """One failure does not stop the others: read each result's ``status``.
        An unpaid debit past its deadline is taken from collateral. With no
        facilitator the wallet sends the transactions and pays their gas."""
        if only not in (None, "pay", "claim"):
            raise InvalidParamsError(f'only must be "pay" or "claim", not {only!r}')
        return await settle_all(await self._session(network), only)

    async def fetch(
        self, url: str | httpx.URL, *, method: str = "GET", **kwargs: Any
    ) -> httpx.Response:
        """Takes ``httpx.AsyncClient.request`` keyword arguments. Pays a 4Mica 402
        within the spend limits and retries once with the same body. A 402 from
        another origin than *url* is not paid; the retry follows no redirect."""
        await self._session()
        open_sessions = dict(self._sessions)
        return await paying_fetch(
            FetchContext(
                http=self._http,
                protocols=self._protocols,
                session_for=open_sessions.get,
                limiter=self._limiter,
                record=self._payments.__setitem__,
            ),
            method,
            url,
            **kwargs,
        )

    def payment_for(self, response: httpx.Response) -> PaymentRecord | None:
        """What :meth:`fetch` paid for *response*, or ``None`` if nothing."""
        return self._payments.get(response)

    async def aclose(self) -> None:
        if self._closing is None:
            self._closing = asyncio.create_task(self._close())
        # Shielded: one cancelled caller must not cancel cleanup for the rest.
        await asyncio.shield(self._closing)

    async def _close(self) -> None:
        async with self._lock:
            outcomes = await asyncio.gather(
                *(s.client.aclose() for s in self._sessions.values()),
                return_exceptions=True,
            )
            if self._owns_http:
                await self._http.aclose()
        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                raise outcome

    async def __aenter__(self) -> FourMica:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()
