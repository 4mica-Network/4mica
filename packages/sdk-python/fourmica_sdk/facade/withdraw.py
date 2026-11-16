from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import List

from ..amounts import (
    AmountInput,
    ResolvedToken,
    Token,
    format_units,
    parse_amount,
    to_base_units,
)
from ..client.model import Asset, WithdrawReceipt
from ..errors import (
    AmountZeroError,
    GracePeriodNotElapsedError,
    NoWithdrawalRequestedError,
)
from .models import PendingWithdrawal, WithdrawResult
from .session import NetworkSession, asset_ref


def _result(
    session: NetworkSession, token: ResolvedToken, receipt: WithdrawReceipt
) -> WithdrawResult:
    return WithdrawResult(
        tx_hash=receipt.tx_hash,
        route=receipt.route,
        asset=asset_ref(token),
        network=session.caip2,
        explorer_url=session.explorer_tx(receipt.tx_hash),
    )


async def request_withdrawal(
    session: NetworkSession, value: AmountInput
) -> WithdrawResult:
    spec = parse_amount(value)
    token = await session.token(spec.asset)
    amount = to_base_units(spec.amount, token.decimals)
    if amount == 0:
        raise AmountZeroError("withdrawal amount must be positive")
    receipt = await session.client.withdraw.request(
        Asset.coerce(token.address), amount
    ).send()
    return _result(session, token, receipt)


async def cancel_withdrawal(session: NetworkSession, asset: str) -> WithdrawResult:
    token = await session.token(asset)
    receipt = await session.client.withdraw.cancel(Asset.coerce(token.address)).send()
    return _result(session, token, receipt)


async def finalize_withdrawal(session: NetworkSession, asset: str) -> WithdrawResult:
    """Checked against the chain first, so an early call says when instead of
    reverting. A remote signer has no chain access and skips the check."""
    token = await session.token(asset)
    if await session.chain() is not None:
        pending = next(
            (
                w
                for w in await pending_withdrawals(session)
                if w.asset.address.lower() == token.address.lower()
            ),
            None,
        )
        if pending is None:
            raise NoWithdrawalRequestedError(
                f"no withdrawal of {token.symbol} is pending; request one with "
                "withdraw()"
            )
        if not pending.ready:
            raise GracePeriodNotElapsedError(
                f"the withdrawal of {pending.amount} {token.symbol} can be "
                f"finalized from {pending.ready_at.isoformat()}"
            )
    receipt = await session.client.withdraw.finalize(Asset.coerce(token.address)).send()
    return _result(session, token, receipt)


async def pending_withdrawals(session: NetworkSession) -> List[PendingWithdrawal]:
    gateway = await session.client.ctx.gateway()
    positions, grace = await asyncio.gather(
        session.client.account.assets(), gateway.withdrawal_grace_period()
    )
    now = datetime.now(timezone.utc)
    pending: List[PendingWithdrawal] = []
    for position in positions:
        if position.withdrawal_request_amount == 0:
            continue
        # A delisted asset is still reported, in base units.
        listed = await session.try_token(position.asset)
        asset = (
            asset_ref(listed)
            if listed
            else Token(symbol=position.asset, address=position.asset, decimals=0)
        )
        requested = position.withdrawal_request_timestamp
        ready_at = datetime.fromtimestamp(requested + grace, timezone.utc)
        pending.append(
            PendingWithdrawal(
                asset=asset,
                amount=format_units(position.withdrawal_request_amount, asset.decimals),
                amount_raw=position.withdrawal_request_amount,
                requested_at=datetime.fromtimestamp(requested, timezone.utc),
                ready_at=ready_at,
                ready=ready_at <= now,
                network=session.caip2,
            )
        )
    return pending
