"""Recovering a payment the facilitator refused for something the payer can fix."""

from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, Optional, Protocol

from fourmica_sdk import CheckpointRequiredDetails, TimestampNotPastCutoffDetails
from fourmica_sdk.models import parse_refusal_details

_PREFIX = "invalid_4mica_credit_"

# Waiting longer than this for a checkpoint cutoff to pass is not worth it.
_MAX_CUTOFF_WAIT_SECONDS = 10


class RecoveringPayer(Protocol):
    """The ``PaymentClient`` calls a refused payment is recovered with."""

    async def active_cycle(self, asset: Any = None) -> Any: ...

    async def checkpoint_active_cycle(self, asset: Any = None) -> Any: ...

    async def checkpoint_cycle(self, asset: Any, cycle_id: str) -> Any: ...


async def recover_refused_payment(
    payer: RecoveringPayer,
    asset: str,
    error_reason: Optional[str],
    extra: Optional[dict],
    wait: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> bool:
    """Fixes what a refused settlement says is stale, so that a payment signed
    afterwards can go through: checkpoints when core asks for one, relearns the
    active cycle and core's clock when the payment carried old ones, and waits
    out a checkpoint cutoff. ``False`` when signing again would not help."""
    details = (extra or {}).get("details")
    if error_reason == f"{_PREFIX}checkpoint_required":
        required = parse_refusal_details(CheckpointRequiredDetails, details)
        if required is not None:
            await payer.checkpoint_cycle(asset, required.cycle_id)
        else:
            await payer.checkpoint_active_cycle(asset)
        return True
    if error_reason in (
        f"{_PREFIX}cycle_mismatch",
        f"{_PREFIX}future_timestamp",
        f"{_PREFIX}stale_timestamp",
    ):
        # Reading the cycle relearns core's clock, which also retires a cached
        # cycle whose period has ended.
        await payer.active_cycle(asset)
        return True
    if error_reason == f"{_PREFIX}timestamp_not_past_cutoff":
        cutoff = parse_refusal_details(TimestampNotPastCutoffDetails, details)
        # One second more than strictly needed: the clock core reports is
        # truncated to the second.
        seconds = cutoff.timestamp_cutoff + 2 - cutoff.server_time if cutoff else 2
        if seconds > _MAX_CUTOFF_WAIT_SECONDS:
            return False
        if seconds > 0:
            await wait(seconds)
        await payer.active_cycle(asset)
        return True
    return False
