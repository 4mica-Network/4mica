from __future__ import annotations

import asyncio
import secrets
from collections.abc import Callable
from typing import Any

from ..errors import (
    CheckpointMismatchError,
    CheckpointRequiredError,
    CycleMismatchError,
    FutureTimestampError,
    InvalidParamsError,
    RpcError,
    StaleTimestampError,
    TimestampNotPastCutoffError,
    UntrustedCheckpointBatchError,
)
from ..guarantee import (
    Guarantee,
    GuaranteeReceipt,
    recover_signer,
    verify_guarantee_receipt,
)
from ..models import (
    ActiveCycleResponse,
    CheckpointAcceptedResponse,
    CheckpointBatchResponse,
    CheckpointMismatchDetails,
    CheckpointPayload,
    CheckpointRequiredDetails,
    CycleMismatchDetails,
    FutureTimestampDetails,
    PayerGuaranteesPage,
    PaymentRequest,
    PaymentRequestPayload,
    RecipientPaymentInfo,
    SignedCheckpoint,
    StaleTimestampDetails,
    TimestampNotPastCutoffDetails,
    parse_refusal_details,
)
from ..utils import U256_MAX, ValidationError, normalize_bytes32_hex, parse_address
from .ctx import ClientCtx
from .model import Asset

AssetLike = Asset | str | None


_TIMED_DETAILS = (
    CycleMismatchDetails,
    FutureTimestampDetails,
    StaleTimestampDetails,
    TimestampNotPastCutoffDetails,
)
_REFUSALS: dict[str, tuple[type[Any], Callable[..., RpcError]]] = {
    "CYCLE_MISMATCH": (CycleMismatchDetails, CycleMismatchError),
    "FUTURE_TIMESTAMP": (FutureTimestampDetails, FutureTimestampError),
    "STALE_TIMESTAMP": (StaleTimestampDetails, StaleTimestampError),
    "TIMESTAMP_NOT_PAST_CUTOFF": (
        TimestampNotPastCutoffDetails,
        TimestampNotPastCutoffError,
    ),
    "CHECKPOINT_REQUIRED": (CheckpointRequiredDetails, CheckpointRequiredError),
    "CHECKPOINT_MISMATCH": (CheckpointMismatchDetails, CheckpointMismatchError),
}


class PaymentClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    async def new_payment(
        self, recipient: str, amount: int, asset: AssetLike = None
    ) -> PaymentRequestPayload:
        """Scoped to *asset*'s active cycle and stamped by core's clock. May
        wait out the current second when the last checkpoint covers it."""
        asset_address = Asset.coerce(asset).address
        cycle = await self._ctx.active_cycle(asset_address)
        timestamp = max(
            await self._next_payment_timestamp(asset_address), cycle.period_start
        )
        return PaymentRequestPayload.new(
            user_address=self._ctx.signer_address,
            recipient_address=parse_address(recipient, "recipient"),
            cycle_id=cycle.id,
            req_id=int.from_bytes(secrets.token_bytes(32), "big"),
            amount=amount,
            timestamp=timestamp,
            erc20_token=asset_address,
        )

    async def sign_request(self, payload: PaymentRequestPayload) -> PaymentRequest:
        return await self._ctx.payer_signer.sign_payment_request(
            self._ctx.clearing_house_domain_separator, payload
        )

    async def checkpoint_active_cycle(
        self, asset: AssetLike = None
    ) -> CheckpointAcceptedResponse | None:
        """``None`` when there is nothing to cover."""
        asset_address = Asset.coerce(asset).address
        cycle = await self._ctx.active_cycle(asset_address)
        return await self.checkpoint_cycle(asset_address, cycle.id)

    async def checkpoint_cycle(
        self, asset: AssetLike, cycle_id: str
    ) -> CheckpointAcceptedResponse | None:
        """``None`` when there is nothing to cover. Raises
        UntrustedCheckpointBatchError rather than sign a batch that does not add up."""
        asset_address = Asset.coerce(asset).address
        try:
            return await self._sign_and_submit_checkpoint(asset_address, cycle_id)
        except CheckpointMismatchError:
            # Only once: a payer paying faster than a round trip would loop forever.
            return await self._sign_and_submit_checkpoint(asset_address, cycle_id)

    async def _sign_and_submit_checkpoint(
        self, asset: str, cycle_id: str
    ) -> CheckpointAcceptedResponse | None:
        batch = await self.checkpoint_batch_for_cycle(asset, cycle_id)
        payload = checkpoint_payload(
            self._ctx.signer_address,
            asset,
            cycle_id,
            self._ctx.clearing_house_domain_separator,
            batch,
        )
        if payload is None:
            return None
        signed = await self._ctx.payer_signer.sign_checkpoint(
            self._ctx.clearing_house_domain_separator, payload
        )
        return await self.submit_checkpoint(signed)

    async def _next_payment_timestamp(self, asset: str) -> int:
        cutoff = self._ctx.payment_cutoff(asset)
        if cutoff is None:
            return self._ctx.core_now()
        past_cutoff_ms = (cutoff + 1) * 1000
        while True:
            now_ms = self._ctx.core_now_ms()
            if now_ms >= past_cutoff_ms:
                return now_ms // 1000
            await asyncio.sleep((past_cutoff_ms - now_ms) / 1000)

    async def issue_guarantee(self, request: PaymentRequest) -> GuaranteeReceipt:
        try:
            return await self._ctx.rpc.issue_guarantee(request)
        except RpcError as exc:
            raise self._classify(exc, request.payload.asset_address) from exc

    def verify_guarantee(self, receipt: GuaranteeReceipt) -> Guarantee:
        """Offline check that the trusted operator issued *receipt*; returns
        the guarantee it attests."""
        return verify_guarantee_receipt(
            receipt,
            self._ctx.guarantee_domain_separator,
            self._ctx.guarantee_signer,
        )

    async def list_received(self) -> list[RecipientPaymentInfo]:
        return await self._ctx.rpc.list_recipient_payments(self._ctx.signer_address)

    async def list_issued(
        self,
        cycle_id: str,
        limit: int | None = None,
        after: str | None = None,
    ) -> PayerGuaranteesPage:
        """*cycle_id* is the on-chain bytes32 id. Pass a page's ``next_cursor``
        back as *after*."""
        return await self._ctx.rpc.list_payer_guarantees(
            self._ctx.signer_address, cycle_id, limit=limit, after=after
        )

    async def active_cycle(self, asset: AssetLike = None) -> ActiveCycleResponse:
        """Read fresh from core."""
        cycle = await self._ctx.rpc.get_active_cycle(Asset.coerce(asset).address)
        self._ctx.record_core_time(cycle.server_time)
        return cycle

    async def checkpoint_batch(
        self, asset: AssetLike = None
    ) -> CheckpointBatchResponse:
        return await self._ctx.rpc.get_checkpoint_batch(
            self._ctx.signer_address, Asset.coerce(asset).address
        )

    async def checkpoint_batch_for_cycle(
        self, asset: AssetLike, cycle_id: str
    ) -> CheckpointBatchResponse:
        return await self._ctx.rpc.get_checkpoint_batch(
            self._ctx.signer_address, Asset.coerce(asset).address, cycle_id
        )

    async def submit_checkpoint(
        self, signed: SignedCheckpoint
    ) -> CheckpointAcceptedResponse:
        """Resubmitting one core already accepted succeeds and covers nothing."""
        asset = signed.payload.asset_address
        try:
            accepted = await self._ctx.rpc.submit_checkpoint(signed)
        except RpcError as exc:
            raise self._classify(exc, asset) from exc
        self._ctx.record_payment_cutoff(asset, accepted.timestamp_cutoff)
        return accepted

    def _classify(self, err: RpcError, asset: str) -> RpcError:
        if err.code == "CYCLE_MISMATCH":
            self._ctx.forget_active_cycle(asset)
        refusal = _REFUSALS.get(err.code or "")
        if refusal is None:
            return err
        details = parse_refusal_details(refusal[0], err.details)
        if details is None:
            return err
        if isinstance(details, _TIMED_DETAILS):
            self._ctx.record_core_time(details.server_time)
        if isinstance(details, TimestampNotPastCutoffDetails) and _same_address(
            details.payer, self._ctx.signer_address
        ):
            self._ctx.record_payment_cutoff(asset, details.timestamp_cutoff)
        status = {"status_code": err.status_code, "code": err.code}
        if isinstance(details, CheckpointMismatchDetails):
            reason = str(err).split(": ", 1)[-1]
            return CheckpointMismatchError(details, reason, **status)
        return refusal[1](details, **status)


def checkpoint_payload(
    payer: str,
    asset: str,
    cycle_id: str,
    domain_separator: str | bytes,
    batch: CheckpointBatchResponse,
) -> CheckpointPayload | None:
    if not batch.authorizations:
        return None

    payer = parse_address(payer, "payer")
    asset = parse_address(asset, "asset")
    cycle_id = normalize_bytes32_hex(cycle_id)

    if batch.cycle_id != cycle_id:
        raise UntrustedCheckpointBatchError(
            f"batch is for cycle {batch.cycle_id}, not {cycle_id}"
        )
    if not _same_address(batch.asset_address, asset):
        raise UntrustedCheckpointBatchError(
            f"batch is for asset {batch.asset_address}, not {asset}"
        )

    cumulative_gross, previous_cutoff = 0, 0
    if batch.previous is not None:
        previous = batch.previous.payload
        if (
            not _same_address(previous.payer, payer)
            or previous.cycle_id != cycle_id
            or not _same_address(previous.asset_address, asset)
        ):
            raise UntrustedCheckpointBatchError(
                "previous checkpoint is for another payer, cycle or asset"
            )
        digest = _digest_or_untrusted(
            "previous checkpoint", previous.signing_digest, domain_separator
        )
        if recover_signer(digest, batch.previous.signature) != payer:
            raise UntrustedCheckpointBatchError(
                "previous checkpoint is not signed by the payer"
            )
        cumulative_gross = previous.cumulative_gross
        previous_cutoff = previous.timestamp_cutoff

    req_ids = set()
    timestamp_cutoff = previous_cutoff
    for authorization in batch.authorizations:
        payment = authorization.payload
        req_id = payment.req_id
        if (
            not _same_address(payment.user_address, payer)
            or payment.cycle_id != cycle_id
            or not _same_address(payment.asset_address, asset)
        ):
            raise UntrustedCheckpointBatchError(
                f"authorization {req_id} is for another payer, cycle or asset"
            )
        digest = _digest_or_untrusted(
            f"authorization {req_id}", payment.signing_digest, domain_separator
        )
        if recover_signer(digest, authorization.signature) != payer:
            raise UntrustedCheckpointBatchError(
                f"authorization {req_id} is not signed by the payer"
            )
        if payment.timestamp <= previous_cutoff:
            raise UntrustedCheckpointBatchError(
                f"authorization {req_id} is already covered by the previous checkpoint"
            )
        if req_id in req_ids:
            raise UntrustedCheckpointBatchError(f"authorization {req_id} appears twice")
        req_ids.add(req_id)

        cumulative_gross += payment.amount
        if cumulative_gross > U256_MAX:
            raise InvalidParamsError("cumulative gross overflows")
        timestamp_cutoff = max(timestamp_cutoff, payment.timestamp)

    return CheckpointPayload(
        payer=payer,
        cycle_id=cycle_id,
        asset_address=batch.asset_address,
        cumulative_gross=cumulative_gross,
        timestamp_cutoff=timestamp_cutoff,
    )


def _digest_or_untrusted(
    what: str,
    digest: Callable[[str | bytes], bytes],
    domain_separator: str | bytes,
) -> bytes:
    try:
        return digest(domain_separator)
    except (InvalidParamsError, ValidationError, ValueError) as exc:
        raise UntrustedCheckpointBatchError(f"{what}: {exc}") from exc


def _same_address(a: str, b: str) -> bool:
    try:
        return parse_address(a) == parse_address(b)
    except ValidationError:
        return False
