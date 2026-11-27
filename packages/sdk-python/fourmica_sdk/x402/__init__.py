from __future__ import annotations

import base64
import dataclasses
import json
from enum import Enum
from typing import TYPE_CHECKING, Any, Protocol
from urllib.parse import urljoin

import httpx

from ..client.model import Asset
from ..errors import X402Error
from ..models import PaymentRequest, PaymentRequestPayload, ValidationRequirement
from ..utils import ValidationError, parse_address, parse_u256, validate_url
from .model import (
    SCHEME_4MICA_CREDIT,
    X402_V1,
    X402_V2,
    PaymentRequirementsExtra,
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    SettlementReceipt,
    ValidationExtra,
    X402PaymentRequired,
    X402ResourceInfo,
    X402SettledPayment,
    X402SignedPayment,
)

if TYPE_CHECKING:
    from ..client import Client

__all__ = [
    "SCHEME_4MICA_CREDIT",
    "X402_V1",
    "X402_V2",
    "FlowSigner",
    "PaymentRequirementsExtra",
    "PaymentRequirementsV1",
    "PaymentRequirementsV2",
    "SettlementReceipt",
    "ValidationExtra",
    "X402Flow",
    "X402PaymentRequired",
    "X402ResourceInfo",
    "X402SettledPayment",
    "X402SignedPayment",
]

Requirements = PaymentRequirementsV1 | PaymentRequirementsV2


class FlowSigner(Protocol):
    async def new_payment(
        self, recipient: str, amount: int, asset: Asset
    ) -> PaymentRequestPayload: ...

    async def sign_payment(self, payload: PaymentRequestPayload) -> PaymentRequest: ...


def _requirements_version(requirements: Requirements) -> int:
    return 1 if isinstance(requirements, PaymentRequirementsV1) else 2


class X402Flow:
    def __init__(
        self, signer: FlowSigner, client: httpx.AsyncClient | None = None
    ) -> None:
        self.signer = signer
        self.http = client or httpx.AsyncClient(timeout=30.0)

    @classmethod
    def from_client(cls, client: Client) -> X402Flow:
        return cls(client)

    async def sign_payment(
        self,
        payment_requirements: PaymentRequirementsV1,
        *,
        req_id: int | None = None,
    ) -> X402SignedPayment:
        """x402 v1. The base64 ``header`` goes in ``X-PAYMENT``.

        Pass the *req_id* of a refused payment when signing again for the same
        request: core issues one guarantee per request id, so the seller can
        redeem at most one of the two."""
        self._validate_scheme(payment_requirements.scheme)
        request = await self._sign(
            await self._build_payment(payment_requirements, req_id)
        )
        envelope = {
            "x402Version": X402_V1,
            "scheme": payment_requirements.scheme,
            "network": payment_requirements.network,
            "payload": request.to_payload(),
        }
        return _finish(1, envelope, request)

    async def sign_payment_v2(
        self,
        payment_required: X402PaymentRequired,
        accepted: PaymentRequirementsV2,
        *,
        req_id: int | None = None,
    ) -> X402SignedPayment:
        """x402 v2. The base64 ``header`` goes in ``PAYMENT-SIGNATURE``.
        *req_id* is as for ``sign_payment``."""
        self._validate_scheme(accepted.scheme)
        if payment_required.x402_version != X402_V2:
            raise X402Error("expected x402 version 2")

        request = await self._sign(await self._build_payment(accepted, req_id))
        envelope: dict[str, Any] = {
            "x402Version": X402_V2,
            "accepted": accepted.to_payload(),
            "payload": request.to_payload(),
            "resource": payment_required.resource.to_payload(),
        }
        # x402 v2 spec §5.1.2: return at least the info the server advertised.
        if payment_required.extensions is not None:
            envelope["extensions"] = payment_required.extensions
        return _finish(2, envelope, request)

    async def settle_payment(
        self,
        payment: X402SignedPayment,
        payment_requirements: Requirements,
        facilitator_url: str,
    ) -> X402SettledPayment:
        """``paymentPayload`` is the envelope object, not the base64 header."""
        if _requirements_version(payment_requirements) != payment.x402_version:
            raise X402Error(
                f"payment is x402 v{payment.x402_version}, but requirements are "
                f"x402 v{_requirements_version(payment_requirements)}"
            )
        try:
            base_url = validate_url(facilitator_url)
        except ValidationError as exc:
            raise X402Error(f"invalid facilitator url: {exc}") from exc

        url = urljoin(base_url if base_url.endswith("/") else base_url + "/", "settle")
        try:
            response = await self.http.post(
                url,
                json={
                    "x402Version": payment.x402_version,
                    "paymentPayload": payment.envelope,
                    "paymentRequirements": payment_requirements.to_payload(),
                },
            )
        except httpx.HTTPError as exc:
            raise X402Error(str(exc)) from exc
        if not response.is_success:
            raise X402Error(
                f"settlement failed with status {response.status_code}: {response.text}"
            )
        try:
            settlement = response.json()
        except Exception as exc:
            raise X402Error(f"settlement response invalid JSON: {exc}") from exc
        return X402SettledPayment(
            payment=payment, settlement=SettlementReceipt.from_raw(settlement)
        )

    async def _sign(self, payload: PaymentRequestPayload) -> PaymentRequest:
        try:
            return await self.signer.sign_payment(payload)
        except X402Error:
            raise
        except Exception as exc:
            raise X402Error(f"failed to sign payment: {exc}") from exc

    async def _build_payment(
        self, requirements: Requirements, req_id: int | None
    ) -> PaymentRequestPayload:
        try:
            recipient = parse_address(requirements.pay_to, "payTo")
            amount = parse_u256(requirements.amount)
            asset = Asset(parse_address(requirements.asset, "asset"))
        except ValidationError as exc:
            raise X402Error(f"invalid payment requirements: {exc}") from exc
        extra = PaymentRequirementsExtra.from_raw(requirements.extra)

        try:
            payload = await self.signer.new_payment(recipient, amount, asset)
        except X402Error:
            raise
        except Exception as exc:
            raise X402Error(f"failed to build payment: {exc}") from exc
        # Echo the advertised spelling: sellers may compare it as a string.
        payload = dataclasses.replace(
            payload,
            recipient_address=requirements.pay_to.strip(),
            req_id=payload.req_id if req_id is None else req_id,
        )

        if extra.validation is None:
            return payload
        try:
            return payload.with_validation(
                ValidationRequirement(
                    validator=extra.validation.validator,
                    subject=extra.validation.subject,
                    deadline=extra.validation.deadline,
                    params=extra.validation.params or "0x",
                )
            )
        except ValidationError as exc:
            raise X402Error(f"invalid extra.validation: {exc}") from exc

    @staticmethod
    def _validate_scheme(scheme: str) -> None:
        if scheme != SCHEME_4MICA_CREDIT:
            raise X402Error(f"invalid scheme: {scheme}")


def _finish(
    x402_version: int, envelope: dict[str, Any], request: PaymentRequest
) -> X402SignedPayment:
    header = base64.b64encode(_json_dumps(envelope).encode()).decode()
    return X402SignedPayment(
        header=header,
        envelope=envelope,
        x402_version=x402_version,
        payload=request,
    )


def _json_dumps(obj: Any) -> str:
    def default(o: Any) -> Any:
        if isinstance(o, Enum):
            return o.value
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")

    return json.dumps(obj, default=default)
