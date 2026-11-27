from __future__ import annotations

import asyncio
import contextlib

from ..amounts import AmountInput, format_units, parse_amount, to_base_units
from ..client.model import Asset, DepositReceipt
from ..errors import (
    AmountZeroError,
    Erc20AllowanceRequiredError,
    FacilitatorNotConfiguredError,
    FourMicaError,
    GasRequiredError,
    InsufficientBalanceError,
    InvalidParamsError,
    SponsorshipTransportError,
)
from .models import (
    DEFAULT_DEPOSIT_TIMEOUT_SECS,
    DepositResult,
    DepositStatus,
    Gas,
    Wait,
)
from .session import NetworkSession, asset_ref

_FIRST_POLL_SECS = 0.5
_MAX_POLL_SECS = 5.0


async def deposit(
    session: NetworkSession,
    value: AmountInput,
    gas: Gas = "auto",
    wait: Wait = "spendable",
    timeout_secs: float = DEFAULT_DEPOSIT_TIMEOUT_SECS,
) -> DepositResult:
    if gas not in ("auto", "self"):
        raise InvalidParamsError(f'gas must be "auto" or "self", got {gas!r}')
    if wait not in ("spendable", "mined"):
        raise InvalidParamsError(f'wait must be "spendable" or "mined", got {wait!r}')
    spec = parse_amount(value)
    token = await session.token(spec.asset)
    amount = to_base_units(spec.amount, token.decimals)
    if amount == 0:
        raise AmountZeroError("deposit amount must be positive")

    client = session.client
    gateway = await session.chain()
    asset = Asset.coerce(token.address)

    def show(units: int) -> str:
        return format_units(units, token.decimals)

    # One deposit per asset at a time: spendable is read off core's total.
    async with session.deposit_lock(token.address):
        held = None
        if gateway is not None:
            held = await (
                gateway.native_balance()
                if token.native
                else gateway.erc20_balance(token.address)
            )
            if held < amount:
                raise InsufficientBalanceError(token.symbol, show(amount), show(held))

        # Read even for wait="mined": spendable() measures from it.
        baseline = await _core_total(session, token.address)

        async def self_funded() -> DepositReceipt:
            if gateway is not None and await gateway.native_balance() == 0:
                raise GasRequiredError(
                    f"depositing {token.symbol} as the wallet's own transaction needs "
                    f"{session.native_symbol} for gas, and the wallet holds none"
                )
            builder = client.deposit.of(asset, amount).self_funded()
            await builder.approve()
            return await builder.send()

        if token.native:
            if held == amount:
                raise GasRequiredError(
                    f"depositing all {show(amount)} {token.symbol} leaves nothing for "
                    "gas; a native deposit cannot be gasless"
                )
            receipt = await client.deposit.of(asset, amount).self_funded().send()
        elif gas == "self" or not client.deposit.is_gasless_available():
            receipt = await self_funded()
        else:
            try:
                receipt = await client.deposit.of(asset, amount).send()
            except (
                Erc20AllowanceRequiredError,
                # Neither sent a transaction, so self-funding cannot double it.
                FacilitatorNotConfiguredError,
                SponsorshipTransportError,
            ):
                receipt = await self_funded()

        def result(status: DepositStatus) -> DepositResult:
            return DepositResult(
                status=status,
                tx_hash=receipt.tx_hash,
                route=receipt.route,
                amount=show(amount),
                amount_raw=amount,
                asset=asset_ref(token),
                network=session.caip2,
                explorer_url=session.explorer_tx(receipt.tx_hash),
                _wait=counted,
            )

        async def counted(timeout: float) -> DepositResult:
            # Inferred from the balance: core reports the collateral held, not
            # which deposit it counted. Another deposit of this asset counted
            # meanwhile (one from another process, or one this session started
            # after the lock was released on "mined" or a timeout) can be taken
            # for this one. Swap for a per-transaction acknowledgement once
            # core exposes one.
            target = baseline + amount
            seen = await _until_counted(session, token.address, target, timeout)
            return result("spendable" if seen else "pending")

        return result("mined") if wait == "mined" else await counted(timeout_secs)


async def _core_total(session: NetworkSession, asset: str) -> int:
    balance = await session.client.account.asset_balance(asset)
    return balance.total if balance else 0


async def _until_counted(
    session: NetworkSession, asset: str, target: int, timeout_secs: float
) -> bool:
    async def poll() -> bool:
        delay = _FIRST_POLL_SECS
        while True:
            with contextlib.suppress(FourMicaError):
                if await _core_total(session, asset) >= target:
                    return True
            await asyncio.sleep(delay)
            delay = min(delay * 2, _MAX_POLL_SECS)

    try:
        return await asyncio.wait_for(poll(), timeout_secs)
    except asyncio.TimeoutError:
        return False
