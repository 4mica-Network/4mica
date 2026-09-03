"""The 402 → signed-claim → settle flow for the ``4mica-credit`` scheme.

There is no tab step any more: a claim carries a random 32-byte ``req_id``,
core binds the guarantee to the open settlement cycle at issuance, and the
facilitator's ``/settle`` turns the signed claim into a BLS certificate.
"""

from __future__ import annotations

import base64
import json
import secrets
import time
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, Optional, Protocol, Union
from urllib.parse import urljoin

import httpx

from ..errors import X402Error
from ..models import (
    PaymentGuaranteeRequestClaims,
    PaymentSignature,
    SigningScheme,
    ValidationRequirement,
)
from ..utils import ValidationError, normalize_address, parse_u256, validate_url
from .model import (
    SCHEME_4MICA_CREDIT,
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

Requirements = Union[PaymentRequirementsV1, PaymentRequirementsV2]


class FlowSigner(Protocol):
    async def sign_payment(
        self,
        claims: PaymentGuaranteeRequestClaims,
        scheme: SigningScheme,
    ) -> PaymentSignature: ...


def _requirements_version(requirements: Requirements) -> int:
    return 1 if isinstance(requirements, PaymentRequirementsV1) else 2


class X402Flow:
    def __init__(
        self, signer: FlowSigner, client: Optional[httpx.AsyncClient] = None
    ) -> None:
        self.signer = signer
        self.http = client or httpx.AsyncClient()

    @classmethod
    def from_client(cls, client: "Client") -> "X402Flow":
        return cls(client)

    async def sign_payment(
        self, payment_requirements: PaymentRequirementsV1, user_address: str
    ) -> X402SignedPayment:
        """Build a signed payment envelope for x402 version 1. The base64
        ``header`` goes in ``X-PAYMENT``."""
        self._validate_scheme(payment_requirements.scheme)
        claims = self._build_claims(payment_requirements, user_address)
        signature = await self._sign(claims)
        payment_payload = _payment_payload(claims, signature)
        envelope = {
            "x402Version": 1,
            "scheme": payment_requirements.scheme,
            "network": payment_requirements.network,
            "payload": payment_payload,
        }
        return _finish(1, envelope, payment_payload, signature)

    async def sign_payment_v2(
        self,
        payment_required: X402PaymentRequired,
        accepted: PaymentRequirementsV2,
        user_address: str,
    ) -> X402SignedPayment:
        """Build a signed payment envelope for x402 version 2. The base64
        ``header`` goes in ``PAYMENT-SIGNATURE``."""
        self._validate_scheme(accepted.scheme)
        if payment_required.x402_version != 2:
            raise X402Error("expected x402 version 2")

        claims = self._build_claims(accepted, user_address)
        signature = await self._sign(claims)
        payment_payload = _payment_payload(claims, signature)
        envelope: Dict[str, Any] = {
            "x402Version": 2,
            "accepted": accepted.to_payload(),
            "payload": payment_payload,
            "resource": payment_required.resource.to_payload(),
        }
        # Spec v2 §5.1.2: return at least the info the server advertised.
        if payment_required.extensions is not None:
            envelope["extensions"] = payment_required.extensions
        return _finish(2, envelope, payment_payload, signature)

    async def settle_payment(
        self,
        payment: X402SignedPayment,
        payment_requirements: Requirements,
        facilitator_url: str,
    ) -> X402SettledPayment:
        """Settle a previously signed payment through the facilitator's
        ``/settle`` endpoint. ``paymentPayload`` is the envelope object, not
        the base64 header."""
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
        try:
            settlement = response.json()
        except Exception as exc:
            raise X402Error(f"settlement response invalid JSON: {exc}") from exc
        if not response.is_success:
            raise X402Error(
                f"settlement failed with status {response.status_code}: {settlement}"
            )
        return X402SettledPayment(
            payment=payment, settlement=SettlementReceipt.from_raw(settlement)
        )

    async def _sign(self, claims: PaymentGuaranteeRequestClaims) -> PaymentSignature:
        try:
            return await self.signer.sign_payment(claims, SigningScheme.EIP712)
        except X402Error:
            raise
        except Exception as exc:
            raise X402Error(f"failed to sign payment: {exc}") from exc

    def _build_claims(
        self, requirements: Requirements, user_address: str
    ) -> PaymentGuaranteeRequestClaims:
        try:
            amount = parse_u256(requirements.amount)
        except ValidationError as exc:
            raise X402Error(f"invalid amount: {exc}") from exc
        # A random req_id: uniqueness is all core asks of it now that requests
        # no longer count up a tab.
        req_id = int.from_bytes(secrets.token_bytes(32), "big")
        try:
            claims = PaymentGuaranteeRequestClaims.new(
                user_address=normalize_address(user_address),
                recipient_address=normalize_address(requirements.pay_to),
                req_id=req_id,
                amount=amount,
                timestamp=int(time.time()),
                erc20_token=requirements.asset,
            )
        except ValidationError as exc:
            raise X402Error(str(exc)) from exc

        extra = PaymentRequirementsExtra.from_raw(requirements.extra)
        if extra.validation is None:
            return claims
        try:
            return claims.with_validation(
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


def _payment_payload(
    claims: PaymentGuaranteeRequestClaims, signature: PaymentSignature
) -> Dict[str, Any]:
    return {
        "claims": claims.to_payload(),
        "signature": signature.signature,
        "scheme": signature.scheme.value,
    }


def _finish(
    x402_version: int,
    envelope: Dict[str, Any],
    payment_payload: Dict[str, Any],
    signature: PaymentSignature,
) -> X402SignedPayment:
    header = base64.b64encode(_json_dumps(envelope).encode()).decode()
    return X402SignedPayment(
        header=header,
        envelope=envelope,
        x402_version=x402_version,
        payload=payment_payload,
        signature=signature,
    )


def _json_dumps(obj: Any) -> str:
    def default(o: Any) -> Any:
        if isinstance(o, Enum):
            return o.value
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")

    return json.dumps(obj, default=default)
