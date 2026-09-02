"""x402 wire models for the ``4mica-credit`` scheme.

CamelCase on the wire (facilitator/resource-server convention). The v2
challenge travels in the ``PAYMENT-REQUIRED`` header; a signed payment travels
as ``X-PAYMENT`` (v1) or ``PAYMENT-SIGNATURE`` (v2), base64 of the envelope.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..errors import X402Error
from ..models import BLSCert, PaymentSignature
from ..utils import ValidationError, normalize_bytes32_hex

SCHEME_4MICA_CREDIT = "4mica-credit"


def _pick(raw: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in raw and raw[key] is not None:
            return raw[key]
    return default


@dataclass
class ValidationExtra:
    """The ``extra.validation`` object a resource server sends to gate a
    payment on a validator."""

    validator: str
    subject: str
    """0x-prefixed bytes32 the validator must approve."""
    deadline: Optional[int] = None
    """Unix seconds; core tightens this to the cycle's resolution cutoff."""
    params: Optional[str] = None
    """0x-prefixed validator-specific policy bytes."""

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "ValidationExtra":
        if not isinstance(raw, dict):
            raise X402Error("invalid paymentRequirements.extra.validation")
        validator = raw.get("validator")
        subject = raw.get("subject")
        if not validator or not subject:
            raise X402Error("extra.validation requires validator and subject")
        try:
            subject = normalize_bytes32_hex(str(subject))
        except ValidationError as exc:
            raise X402Error(f"invalid validation subject: {exc}") from exc
        deadline = raw.get("deadline")
        return cls(
            validator=str(validator),
            subject=subject,
            deadline=int(deadline) if deadline is not None else None,
            params=str(raw["params"]) if raw.get("params") is not None else None,
        )


@dataclass
class PaymentRequirementsExtra:
    """Parsed ``paymentRequirements.extra``. Present ⇒ the payment is
    validation-gated."""

    validation: Optional[ValidationExtra] = None

    @classmethod
    def from_raw(cls, raw: Optional[Dict[str, Any]]) -> "PaymentRequirementsExtra":
        raw = raw or {}
        if not isinstance(raw, dict):
            raise X402Error("invalid paymentRequirements.extra")
        validation_raw = raw.get("validation")
        return cls(
            validation=ValidationExtra.from_raw(validation_raw)
            if validation_raw is not None
            else None
        )


@dataclass
class PaymentRequirementsV1:
    scheme: str
    network: str
    max_amount_required: str
    pay_to: str
    asset: str
    extra: Dict[str, Any] = field(default_factory=dict)
    resource: Optional[str] = None
    description: Optional[str] = None
    mime_type: Optional[str] = None
    output_schema: Optional[Any] = None
    max_timeout_seconds: Optional[int] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "PaymentRequirementsV1":
        amount = _pick(raw, "maxAmountRequired")
        pay_to = _pick(raw, "payTo")
        asset = _pick(raw, "asset")
        scheme = _pick(raw, "scheme")
        network = _pick(raw, "network")
        missing = [
            name
            for name, value in [
                ("scheme", scheme),
                ("network", network),
                ("maxAmountRequired", amount),
                ("payTo", pay_to),
                ("asset", asset),
            ]
            if not value
        ]
        if missing:
            raise X402Error(
                f"payment requirements missing fields: {', '.join(missing)}"
            )

        return cls(
            scheme=scheme,
            network=network,
            max_amount_required=str(amount),
            pay_to=pay_to,
            asset=asset,
            extra=_pick(raw, "extra", default={}) or {},
            resource=_pick(raw, "resource"),
            description=_pick(raw, "description"),
            mime_type=_pick(raw, "mimeType"),
            output_schema=_pick(raw, "outputSchema"),
            max_timeout_seconds=_pick(raw, "maxTimeoutSeconds"),
        )

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "scheme": self.scheme,
            "network": self.network,
            "maxAmountRequired": self.max_amount_required,
            "payTo": self.pay_to,
            "asset": self.asset,
        }
        if self.extra:
            payload["extra"] = dict(self.extra)
        if self.resource is not None:
            payload["resource"] = self.resource
        if self.description is not None:
            payload["description"] = self.description
        if self.mime_type is not None:
            payload["mimeType"] = self.mime_type
        if self.output_schema is not None:
            payload["outputSchema"] = self.output_schema
        if self.max_timeout_seconds is not None:
            payload["maxTimeoutSeconds"] = self.max_timeout_seconds
        return payload

    @property
    def amount(self) -> str:
        return self.max_amount_required


@dataclass
class PaymentRequirementsV2:
    scheme: str
    network: str
    asset: str
    amount: str
    pay_to: str
    extra: Dict[str, Any] = field(default_factory=dict)
    max_timeout_seconds: Optional[int] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "PaymentRequirementsV2":
        amount = _pick(raw, "amount")
        pay_to = _pick(raw, "payTo")
        asset = _pick(raw, "asset")
        scheme = _pick(raw, "scheme")
        network = _pick(raw, "network")
        missing = [
            name
            for name, value in [
                ("scheme", scheme),
                ("network", network),
                ("amount", amount),
                ("payTo", pay_to),
                ("asset", asset),
            ]
            if not value
        ]
        if missing:
            raise X402Error(
                f"payment requirements missing fields: {', '.join(missing)}"
            )

        max_timeout_seconds = _pick(raw, "maxTimeoutSeconds")
        return cls(
            scheme=scheme,
            network=network,
            asset=asset,
            amount=str(amount),
            pay_to=pay_to,
            extra=_pick(raw, "extra", default={}) or {},
            max_timeout_seconds=int(max_timeout_seconds)
            if max_timeout_seconds is not None
            else None,
        )

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "scheme": self.scheme,
            "network": self.network,
            "asset": self.asset,
            "amount": self.amount,
            "payTo": self.pay_to,
        }
        if self.extra:
            payload["extra"] = dict(self.extra)
        if self.max_timeout_seconds is not None:
            payload["maxTimeoutSeconds"] = self.max_timeout_seconds
        return payload


@dataclass
class X402ResourceInfo:
    url: str
    description: Optional[str] = None
    mime_type: Optional[str] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "X402ResourceInfo":
        if not isinstance(raw, dict) or not raw.get("url"):
            raise X402Error("invalid resource info")
        return cls(
            url=str(raw["url"]),
            description=raw.get("description"),
            mime_type=raw.get("mimeType"),
        )

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"url": self.url}
        if self.description is not None:
            payload["description"] = self.description
        if self.mime_type is not None:
            payload["mimeType"] = self.mime_type
        return payload


@dataclass
class X402PaymentRequired:
    """The v2 challenge (``PAYMENT-REQUIRED`` header, base64 JSON)."""

    x402_version: int
    resource: X402ResourceInfo
    accepts: List[PaymentRequirementsV2]
    error: Optional[str] = None
    extensions: Optional[Dict[str, Any]] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "X402PaymentRequired":
        if not isinstance(raw, dict):
            raise X402Error("invalid payment required payload")
        x402_version = raw.get("x402Version")
        if x402_version is None:
            raise X402Error("missing x402Version")
        return cls(
            x402_version=int(x402_version),
            resource=X402ResourceInfo.from_raw(raw.get("resource") or {}),
            accepts=[
                PaymentRequirementsV2.from_raw(a) for a in raw.get("accepts") or []
            ],
            error=raw.get("error"),
            extensions=raw.get("extensions"),
        )


@dataclass
class X402SignedPayment:
    """A signed payment in both forms: ``header`` for the HTTP request header,
    ``envelope`` (the decoded object) for a facilitator's ``paymentPayload``."""

    header: str
    envelope: Dict[str, Any]
    x402_version: int
    payload: Dict[str, Any]
    signature: PaymentSignature


@dataclass
class SettlementReceipt:
    """The facilitator's ``/settle`` response. Failures arrive as HTTP 200
    with ``success: false`` — read the body, not the status."""

    success: bool
    tx_hash: Optional[str]
    network_id: Optional[str]
    certificate: Optional[BLSCert]
    error: Optional[str]
    raw: Dict[str, Any]

    @classmethod
    def from_raw(cls, raw: Any) -> "SettlementReceipt":
        if not isinstance(raw, dict):
            raw = {}
        certificate_raw = raw.get("certificate")
        certificate = None
        if isinstance(certificate_raw, dict):
            claims = _pick(certificate_raw, "claims")
            signature = _pick(certificate_raw, "signature")
            if claims is not None and signature is not None:
                certificate = BLSCert(claims=str(claims), signature=str(signature))
        return cls(
            success=bool(raw.get("success")),
            tx_hash=_pick(raw, "txHash", "tx_hash"),
            network_id=_pick(raw, "networkId", "network_id", "network"),
            certificate=certificate,
            error=_pick(raw, "error", "errorReason", "invalidReason"),
            raw=raw,
        )


@dataclass
class X402SettledPayment:
    payment: X402SignedPayment
    settlement: SettlementReceipt
