"""Payment guarantees: the payer signs a request, the recipient redeems it for
a receipt the operator signed, and either side can verify that receipt
offline. Port of ``sdk-rust/src/client/payment.rs``."""

from __future__ import annotations

import asyncio
import secrets
from typing import List, Optional, Union

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
    PaymentRequest,
    PaymentRequestPayload,
    RecipientPaymentInfo,
    SignedCheckpoint,
    StaleTimestampDetails,
    TimestampNotPastCutoffDetails,
    parse_refusal_details,
)
from ..utils import ValidationError, normalize_bytes32_hex, parse_address
from .ctx import ClientCtx
from .model import Asset

AssetLike = Union[Asset, str, None]

_U256_MAX = 2**256 - 1


class PaymentClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    # --- payer -----------------------------------------------------------

    async def new_payment(
        self, recipient: str, amount: int, asset: AssetLike = None
    ) -> PaymentRequestPayload:
        """A payment payload for the signer, scoped to the asset's active
        settlement cycle.

        Stamped by core's clock as last reported, not this machine's, since
        core refuses a payment stamped later than its own clock. Waits out the
        rest of the current second when the payer's last checkpoint covers it,
        since a payment must be stamped strictly after what the checkpoint
        already accounts for."""
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
        """Signs a payment as the payer. Hand the result to the recipient, who
        redeems it with :meth:`issue_guarantee`."""
        return await self._ctx.payer_signer.sign_payment_request(
            self._ctx.clearing_house_domain_separator, payload
        )

    async def checkpoint_active_cycle(
        self, asset: AssetLike = None
    ) -> Optional[CheckpointAcceptedResponse]:
        """Signs and submits a checkpoint covering the payer's outstanding
        payments in *asset*'s active cycle. ``None`` when there is nothing to
        cover."""
        asset_address = Asset.coerce(asset).address
        cycle = await self._ctx.active_cycle(asset_address)
        return await self.checkpoint_cycle(asset_address, cycle.id)

    async def checkpoint_cycle(
        self, asset: AssetLike, cycle_id: str
    ) -> Optional[CheckpointAcceptedResponse]:
        """Signs and submits a checkpoint covering the payer's outstanding
        payments in *cycle_id* — such as the cycle a ``CHECKPOINT_REQUIRED``
        refusal names. ``None`` when there is nothing to cover.

        Core's batch is checked before it is signed: every payment must be one
        the payer signed, in this cycle and asset, past the previous
        checkpoint, and counted once."""
        asset_address = Asset.coerce(asset).address
        try:
            return await self._sign_and_submit_checkpoint(asset_address, cycle_id)
        except CheckpointMismatchError:
            # Only once: a payer paid faster than a round trip would chase the
            # batch forever.
            return await self._sign_and_submit_checkpoint(asset_address, cycle_id)

    async def _sign_and_submit_checkpoint(
        self, asset: str, cycle_id: str
    ) -> Optional[CheckpointAcceptedResponse]:
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
        """The timestamp to stamp a payment with, never at or before what a
        checkpoint already covers."""
        cutoff = self._ctx.payment_cutoff(asset)
        if cutoff is None:
            return self._ctx.core_now()
        past_cutoff_ms = (cutoff + 1) * 1000
        while True:
            now_ms = self._ctx.core_now_ms()
            if now_ms >= past_cutoff_ms:
                return now_ms // 1000
            await asyncio.sleep((past_cutoff_ms - now_ms) / 1000)

    # --- recipient -------------------------------------------------------

    async def issue_guarantee(self, request: PaymentRequest) -> GuaranteeReceipt:
        """Redeems a payer's signed request for the operator's guarantee
        receipt, as the recipient."""
        try:
            return await self._ctx.rpc.issue_guarantee(request)
        except RpcError as exc:
            raise self._classify(exc, request.payload.asset_address) from exc

    def verify_guarantee(self, receipt: GuaranteeReceipt) -> Guarantee:
        """Checks that *receipt* was issued by the operator this client
        trusts, returning the guarantee it attests. Offline."""
        return verify_guarantee_receipt(
            receipt,
            self._ctx.guarantee_domain_separator,
            self._ctx.guarantee_signer,
        )

    async def list_received(self) -> List[RecipientPaymentInfo]:
        """Payments guaranteed to the signer as a recipient."""
        return await self._ctx.rpc.list_recipient_payments(self._ctx.signer_address)

    # --- core's view -----------------------------------------------------

    async def active_cycle(self, asset: AssetLike = None) -> ActiveCycleResponse:
        """The cycle payments for *asset* must be signed for right now, read
        fresh from core."""
        cycle = await self._ctx.rpc.get_active_cycle(Asset.coerce(asset).address)
        self._ctx.record_core_time(cycle.server_time)
        return cycle

    async def checkpoint_batch(
        self, asset: AssetLike = None
    ) -> CheckpointBatchResponse:
        """The payer's latest checkpoint in *asset*'s active cycle and the
        payments it does not cover yet."""
        return await self._ctx.rpc.get_checkpoint_batch(
            self._ctx.signer_address, Asset.coerce(asset).address
        )

    async def checkpoint_batch_for_cycle(
        self, asset: AssetLike, cycle_id: str
    ) -> CheckpointBatchResponse:
        """The payer's latest checkpoint in *cycle_id* and the payments it does
        not cover yet."""
        return await self._ctx.rpc.get_checkpoint_batch(
            self._ctx.signer_address, Asset.coerce(asset).address, cycle_id
        )

    async def submit_checkpoint(
        self, signed: SignedCheckpoint
    ) -> CheckpointAcceptedResponse:
        """Submits a checkpoint the payer has already signed. Resubmitting one
        core already accepted succeeds and covers nothing."""
        asset = signed.payload.asset_address
        try:
            accepted = await self._ctx.rpc.submit_checkpoint(signed)
        except RpcError as exc:
            raise self._classify(exc, asset) from exc
        self._ctx.record_payment_cutoff(asset, accepted.timestamp_cutoff)
        return accepted

    def _classify(self, err: RpcError, asset: str) -> RpcError:
        """Turns core's coded refusals into typed errors, and refreshes what
        they prove stale. A refusal whose details do not decode stays the
        plain RPC error."""
        status = {"status_code": err.status_code, "code": err.code}
        if err.code == "CYCLE_MISMATCH":
            self._ctx.forget_active_cycle(asset)
            details = parse_refusal_details(CycleMismatchDetails, err.details)
            if details is None:
                return err
            self._ctx.record_core_time(details.server_time)
            return CycleMismatchError(details, **status)
        if err.code == "FUTURE_TIMESTAMP":
            details = parse_refusal_details(FutureTimestampDetails, err.details)
            if details is None:
                return err
            self._ctx.record_core_time(details.server_time)
            return FutureTimestampError(details, **status)
        if err.code == "STALE_TIMESTAMP":
            details = parse_refusal_details(StaleTimestampDetails, err.details)
            if details is None:
                return err
            self._ctx.record_core_time(details.server_time)
            return StaleTimestampError(details, **status)
        if err.code == "TIMESTAMP_NOT_PAST_CUTOFF":
            details = parse_refusal_details(TimestampNotPastCutoffDetails, err.details)
            if details is None:
                return err
            self._ctx.record_core_time(details.server_time)
            # A cutoff belongs to the payer it names. Issuance is the
            # recipient's call, so the refusal often describes someone else,
            # and holding back this client's own payments for a stranger's
            # cutoff would be nothing but a delay.
            if _same_address(details.payer, self._ctx.signer_address):
                self._ctx.record_payment_cutoff(asset, details.timestamp_cutoff)
            return TimestampNotPastCutoffError(details, **status)
        if err.code == "CHECKPOINT_REQUIRED":
            details = parse_refusal_details(CheckpointRequiredDetails, err.details)
            if details is None:
                return err
            return CheckpointRequiredError(details, **status)
        if err.code == "CHECKPOINT_MISMATCH":
            details = parse_refusal_details(CheckpointMismatchDetails, err.details)
            if details is None:
                return err
            reason = str(err).split(": ", 1)[-1]
            return CheckpointMismatchError(details, reason, **status)
        return err


def checkpoint_payload(
    payer: str,
    asset: str,
    cycle_id: str,
    domain_separator: Union[str, bytes],
    batch: CheckpointBatchResponse,
) -> Optional[CheckpointPayload]:
    """The checkpoint that covers *batch*, or ``None`` when it covers nothing
    new. Raises :class:`~fourmica_sdk.errors.UntrustedCheckpointBatchError`
    rather than sign over a batch that does not add up: an operator that
    slipped in a payment the payer never signed, or a forged previous total,
    would inflate what the payer can be charged on default."""
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
            "previous checkpoint", lambda: previous.signing_digest(domain_separator)
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
            f"authorization {req_id}",
            lambda: payment.signing_digest(domain_separator),
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
        if cumulative_gross > _U256_MAX:
            raise InvalidParamsError("cumulative gross overflows")
        timestamp_cutoff = max(timestamp_cutoff, payment.timestamp)

    return CheckpointPayload(
        payer=payer,
        cycle_id=cycle_id,
        asset_address=batch.asset_address,
        cumulative_gross=cumulative_gross,
        timestamp_cutoff=timestamp_cutoff,
    )


def _digest_or_untrusted(what: str, digest) -> bytes:
    try:
        return digest()
    except (InvalidParamsError, ValidationError, ValueError) as exc:
        raise UntrustedCheckpointBatchError(f"{what}: {exc}") from exc


def _same_address(a: str, b: str) -> bool:
    try:
        return parse_address(a) == parse_address(b)
    except ValidationError:
        return False
