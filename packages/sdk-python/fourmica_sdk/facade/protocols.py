from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from ..client import Client
from ..errors import X402Error
from ..networks import resolve_network
from ..utils import parse_address, parse_u256
from ..x402 import (
    SCHEME_4MICA_CREDIT,
    X402_V2,
    PaymentRequirementsExtra,
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    Requirements,
    X402Flow,
    X402PaymentRequired,
    X402ResourceInfo,
)


@dataclass(frozen=True)
class PaymentTerms:
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

    def terms(self, response: httpx.Response) -> list[PaymentTerms]:
        """Empty when the 402 is not this protocol's."""
        ...

    async def pay(
        self, terms: PaymentTerms, client: Client, http: httpx.AsyncClient
    ) -> dict[str, str]:
        """Headers to retry with."""
        ...

    def settled(self, response: httpx.Response) -> bool | None:
        """``None`` when the response does not say."""
        ...


def _decode_json_header(value: str) -> Any:
    text = value.strip()
    # Senders may drop the padding.
    return json.loads(base64.b64decode(text + "=" * (-len(text) % 4)))


def _read_required(response: httpx.Response) -> dict[str, Any] | None:
    header = response.headers.get("PAYMENT-REQUIRED")
    try:
        raw = _decode_json_header(header) if header else json.loads(response.text)
    except ValueError:
        return None
    return raw if isinstance(raw, dict) else None


def _requirements_of(version: int, entry: dict[str, Any]) -> Requirements:
    if version == X402_V2:
        return PaymentRequirementsV2.from_raw(entry)
    return PaymentRequirementsV1.from_raw(
        {
            **entry,
            "maxAmountRequired": entry.get("maxAmountRequired") or entry.get("amount"),
        }
    )


def _version(required: dict[str, Any]) -> int | None:
    raw = required.get("x402Version")
    if isinstance(raw, str) and raw.strip() in ("1", "2"):
        return int(raw)
    if isinstance(raw, bool) or raw not in (1, 2):
        return None
    return int(raw)


def _signable(
    required: dict[str, Any], requirements: Requirements
) -> X402PaymentRequired | None:
    parse_address(requirements.pay_to, "payTo")
    parse_address(requirements.asset, "asset")
    PaymentRequirementsExtra.from_raw(requirements.extra)
    if not isinstance(requirements, PaymentRequirementsV2):
        return None
    resource = required.get("resource")
    extensions = required.get("extensions")
    return X402PaymentRequired(
        x402_version=2,
        # Empty when the seller names none, as both x402 packages' buyers do.
        resource=X402ResourceInfo.from_raw(resource)
        if isinstance(resource, dict) and resource.get("url")
        else X402ResourceInfo(url=""),
        accepts=[requirements],
        extensions=extensions if isinstance(extensions, dict) else None,
    )


class X402Protocol:
    name = "x402"

    def terms(self, response: httpx.Response) -> list[PaymentTerms]:
        required = _read_required(response)
        version = _version(required) if required else None
        if required is None or version is None:
            return []
        accepts = required.get("accepts")

        terms: list[PaymentTerms] = []
        for entry in accepts if isinstance(accepts, list) else []:
            if (
                not isinstance(entry, dict)
                or entry.get("scheme") != SCHEME_4MICA_CREDIT
            ):
                continue
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
                            _signable(required, requirements),
                            requirements,
                        ),
                    )
                )
            except (X402Error, ValueError, TypeError, AttributeError):
                continue
        return terms

    async def pay(
        self, terms: PaymentTerms, client: Client, http: httpx.AsyncClient
    ) -> dict[str, str]:
        payment_required, requirements = terms.offer
        flow = X402Flow(client, http)
        if payment_required is not None:
            signed = await flow.sign_payment_v2(payment_required, requirements)
            return {"PAYMENT-SIGNATURE": signed.header}
        signed = await flow.sign_payment(requirements)
        return {"X-PAYMENT": signed.header}

    def settled(self, response: httpx.Response) -> bool | None:
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


PROTOCOLS: dict[str, PaymentProtocol] = {"x402": X402Protocol()}
