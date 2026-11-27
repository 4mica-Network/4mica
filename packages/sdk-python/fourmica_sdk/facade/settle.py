from __future__ import annotations

from datetime import datetime, timezone

from ..amounts import Token, format_units
from ..client.model import PayReceipt
from ..errors import (
    Erc20AllowanceRequiredError,
    FourMicaError,
    GasRequiredError,
    OutcomeUnknownError,
)
from ..models import ClearingParticipantRole, ClearingPosition
from .models import Position, SettleAction, SettleResult
from .session import NetworkSession, asset_ref


async def _to_position(session: NetworkSession, position: ClearingPosition) -> Position:
    listed = await session.try_token(position.asset_address)
    asset = (
        asset_ref(listed)
        if listed
        else Token(
            symbol=position.asset_address,
            address=position.asset_address,
            decimals=0,
        )
    )

    def units(raw: int) -> str:
        return format_units(raw, asset.decimals)

    return Position(
        cycle=position.cycle_id_text,
        cycle_id=position.cycle_id,
        asset=asset,
        role="debtor"
        if position.role == ClearingParticipantRole.NET_DEBTOR
        else "creditor",
        amount=units(position.amount),
        gross_outgoing=units(position.gross_outgoing),
        gross_incoming=units(position.gross_incoming),
        amount_raw=position.amount,
        gross_outgoing_raw=position.gross_outgoing,
        gross_incoming_raw=position.gross_incoming,
        pay_by=datetime.fromtimestamp(
            position.payment_submission_deadline, timezone.utc
        ),
        final_at=datetime.fromtimestamp(
            position.payment_finality_deadline, timezone.utc
        ),
        commit_confirmed=position.commit_confirmed,
        network=session.caip2,
    )


async def open_positions(session: NetworkSession) -> list[Position]:
    positions = await session.client.settlement.positions()
    return [await _to_position(session, p) for p in positions]


async def _pay_debit(session: NetworkSession, position: Position) -> PayReceipt:
    pay = session.client.settlement.pay(position.cycle)
    try:
        return await pay.send()
    except Erc20AllowanceRequiredError:
        gateway = await session.chain()
        if gateway is None:
            raise
        if await gateway.native_balance() == 0:
            raise GasRequiredError(
                f"paying {position.amount} {position.asset.symbol} as the "
                f"wallet's own transaction needs {session.native_symbol} for "
                "gas, and the wallet holds none"
            ) from None
        own = pay.self_funded()
        await own.approve()
        return await own.send()


async def settle_all(
    session: NetworkSession, only: SettleAction | None
) -> list[SettleResult]:
    settlement = session.client.settlement
    results: list[SettleResult] = []
    for position in await open_positions(session):
        action: SettleAction = "pay" if position.role == "debtor" else "claim"
        if only is not None and only != action:
            continue
        if not position.commit_confirmed:
            results.append(
                SettleResult(
                    position=position,
                    action=action,
                    status="skipped",
                    reason="the cycle's commit is not confirmed on-chain yet; "
                    "settle again shortly",
                )
            )
            continue
        try:
            receipt = (
                await _pay_debit(session, position)
                if action == "pay"
                else await settlement.claim(position.cycle).send()
            )
        except FourMicaError as error:
            results.append(
                SettleResult(
                    position=position,
                    action=action,
                    status="unknown"
                    if isinstance(error, OutcomeUnknownError)
                    else "failed",
                    error=error,
                )
            )
            continue
        results.append(
            SettleResult(
                position=position,
                action=action,
                status="settled",
                tx_hash=receipt.tx_hash,
                route=receipt.route,
                explorer_url=session.explorer_tx(receipt.tx_hash),
            )
        )
    return results
