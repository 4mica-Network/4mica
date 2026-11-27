"""Reading a 4Mica payment on the seller's side: from the ``X-PAYMENT``
header, or from the context of an x402 after-settle hook."""

from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass
from typing import Any, Mapping, Optional

from ..amounts import format_units
from ..errors import InvalidParamsError, X402Error


@dataclass(frozen=True)
class ParsedPayment:
    req_id: str
    payer_address: str
    amount_raw: int
    amount: str
    """``amount_raw`` in whole units of the decimals it was read with."""


@dataclass(frozen=True)
class SettledPayment:
    """What :meth:`AppClient.report_payment` takes, in base units, with the
    guarantee receipt."""

    req_id: str
    payer_address: str
    amount: str
    """Base units, as a decimal string."""
    guarantee_claims: Optional[str]
    guarantee_signature: Optional[str]


def _field(source: Any, *names: str) -> Any:
    """A field of a mapping or an object, under the first name it has."""
    for name in names:
        if isinstance(source, Mapping):
            if name in source:
                return source[name]
        elif hasattr(source, name):
            return getattr(source, name)
    return None


def _as_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip():
        text = value.strip()
        try:
            return int(text, 16) if text[:2].lower() == "0x" else int(text)
        except ValueError:
            return None
    return None


def _read_payment(signed: Any, decimals: int) -> ParsedPayment:
    """*signed* is an envelope's ``payload``: the request and its signature."""
    payment = _field(signed, "payload")
    req_id = _field(payment, "req_id", "reqId")
    payer_address = _field(payment, "user_address", "userAddress")
    amount_raw = _as_int(_field(payment, "amount"))
    if (
        not isinstance(req_id, str)
        or not isinstance(payer_address, str)
        or amount_raw is None
    ):
        raise InvalidParamsError("payment is missing req_id, user_address or amount")
    return ParsedPayment(
        req_id=req_id,
        payer_address=payer_address,
        amount_raw=amount_raw,
        amount=format_units(amount_raw, decimals),
    )


def parse_payment_header(header: str) -> Any:
    """The JSON envelope a base64 ``X-PAYMENT`` header carries."""
    if not header or not isinstance(header, str):
        raise X402Error("missing payment header")
    try:
        return json.loads(base64.b64decode(header, validate=True).decode("utf-8"))
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise X402Error(f"invalid payment header: {exc}") from exc


def payment_from_header(header: str, decimals: int = 18) -> ParsedPayment:
    """The request id, payer and amount of the payment in an ``X-PAYMENT``
    header, its amount shown in whole units of *decimals*."""
    return _read_payment(_field(parse_payment_header(header), "payload"), decimals)


def parse_settlement(context: Any) -> SettledPayment:
    """Reads an x402 after-settle hook's context into what
    :meth:`AppClient.report_payment` takes: the amount in base units, and the
    guarantee receipt the facilitator returned. *context* is the hook's
    ``SettleResultContext``, or a mapping with ``payment_payload`` and
    ``result``."""
    payment_payload = _field(context, "payment_payload", "paymentPayload")
    parsed = _read_payment(_field(payment_payload, "payload"), 0)
    extra = _field(_field(context, "result"), "extra")
    receipt = _field(extra, "receipt") if extra is not None else None
    claims = _field(receipt, "receipt") if receipt is not None else None
    signature = _field(receipt, "signature") if receipt is not None else None
    return SettledPayment(
        req_id=parsed.req_id,
        payer_address=parsed.payer_address,
        amount=str(parsed.amount_raw),
        guarantee_claims=claims if isinstance(claims, str) else None,
        guarantee_signature=signature if isinstance(signature, str) else None,
    )
