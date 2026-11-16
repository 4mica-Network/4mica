"""Payment protocols ``FourMica.fetch`` can pay a 402 with. x402 is the only
one so far."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol

import httpx

from ..client import Client
from ..networks import resolve_network
from ..utils import parse_address, parse_u256
from ..x402 import (
    SCHEME_4MICA_CREDIT,
    PaymentRequirementsExtra,
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    Requirements,
    X402Flow,
    X402PaymentRequired,
)


@dataclass(frozen=True)
class PaymentTerms:
    """One payment option from a 402, independent of the protocol's wire
    format."""

    protocol: str
    network: str
    """CAIP-2 id."""
    asset: str
    amount: int
    pay_to: str
    offer: Any = field(repr=False, compare=False)
    """Adapter-private, handed back to ``pay``."""


class PaymentProtocol(Protocol):
    name: str

    def terms(self, response: httpx.Response) -> List[PaymentTerms]:
        """Empty when the 402 is not this protocol's."""
        ...

    async def pay(
        self, terms: PaymentTerms, client: Client, http: httpx.AsyncClient
    ) -> Dict[str, str]:
        """Headers to retry with."""
        ...

    def settled(self, response: httpx.Response) -> Optional[bool]:
        """Whether the seller took the payment; ``None`` when it does not say."""
        ...


def _decode_json_header(value: str) -> Any:
    text = value.strip()
    # Senders may drop the padding.
    return json.loads(base64.b64decode(text + "=" * (-len(text) % 4)))


def _read_required(response: httpx.Response) -> Optional[Dict[str, Any]]:
    """v2 sends requirements in the ``PAYMENT-REQUIRED`` header, v1 in the body."""
    header = response.headers.get("PAYMENT-REQUIRED")
    try:
        raw = _decode_json_header(header) if header else json.loads(response.text)
    except ValueError:
        return None
    return raw if isinstance(raw, dict) else None


def _requirements_of(version: int, entry: Dict[str, Any]) -> Requirements:
    if version == 2:
        return PaymentRequirementsV2.from_raw(entry)
    # The SDK's own paywall answers v1 with v2-shaped (``amount``) entries.
    return PaymentRequirementsV1.from_raw(
        {
            **entry,
            "maxAmountRequired": entry.get("maxAmountRequired") or entry.get("amount"),
        }
    )


def _version(required: Dict[str, Any]) -> Optional[int]:
    """1 or 2, as a number or its string; ``None`` for anything else."""
    raw = required.get("x402Version")
    if isinstance(raw, str) and raw.strip() in ("1", "2"):
        return int(raw)
    if isinstance(raw, bool) or raw not in (1, 2):
        return None
    return int(raw)


def _signable(
    version: int, required: Dict[str, Any], requirements: Requirements
) -> Optional[X402PaymentRequired]:
    """Checks everything ``pay`` needs beyond the amount, so an option it
    could not sign is skipped while reading the 402. For v2, the challenge
    cut down to this one option: a malformed sibling must not stop it being
    signed."""
    parse_address(requirements.pay_to, "payTo")
    parse_address(requirements.asset, "asset")
    PaymentRequirementsExtra.from_raw(requirements.extra)
    if version != 2:
        return None
    return X402PaymentRequired.from_raw(
        {**required, "x402Version": 2, "accepts": [requirements.to_payload()]}
    )


class X402Protocol:
    name = "x402"

    def terms(self, response: httpx.Response) -> List[PaymentTerms]:
        required = _read_required(response)
        version = _version(required) if required else None
        if required is None or version is None:
            return []
        accepts = required.get("accepts")

        terms: List[PaymentTerms] = []
        for entry in accepts if isinstance(accepts, list) else []:
            if (
                not isinstance(entry, dict)
                or entry.get("scheme") != SCHEME_4MICA_CREDIT
            ):
                continue
            # A malformed option is skipped, not fatal: a sibling may be fine.
            try:
                requirements = _requirements_of(version, entry)
                resolved = resolve_network(requirements.network)
                terms.append(
                    PaymentTerms(
                        protocol=self.name,
                        network=resolved[1].caip2 if resolved else requirements.network,
                        asset=requirements.asset.strip(),
                        amount=parse_u256(requirements.amount),
                        pay_to=requirements.pay_to.strip(),
                        offer=(
                            _signable(version, required, requirements),
                            requirements,
                        ),
                    )
                )
            except Exception:
                continue
        return terms

    async def pay(
        self, terms: PaymentTerms, client: Client, http: httpx.AsyncClient
    ) -> Dict[str, str]:
        payment_required, requirements = terms.offer
        flow = X402Flow(client, http)
        if payment_required is not None:
            signed = await flow.sign_payment_v2(payment_required, requirements)
            return {"PAYMENT-SIGNATURE": signed.header}
        signed = await flow.sign_payment(requirements)
        return {"X-PAYMENT": signed.header}

    def settled(self, response: httpx.Response) -> Optional[bool]:
        """v2 answers in ``PAYMENT-RESPONSE``, v1 in ``X-PAYMENT-RESPONSE``."""
        header = response.headers.get("PAYMENT-RESPONSE") or response.headers.get(
            "X-PAYMENT-RESPONSE"
        )
        if not header:
            return None
        try:
            raw = _decode_json_header(header)
        except ValueError:
            return None
        return raw.get("success") is True if isinstance(raw, dict) else None


PROTOCOLS: Dict[str, PaymentProtocol] = {"x402": X402Protocol()}
