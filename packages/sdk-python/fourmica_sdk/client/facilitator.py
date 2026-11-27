from __future__ import annotations

from typing import Any

import httpx

from ..errors import (
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    MissingTokenDomainSeparatorError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
    SponsorshipError,
    SponsorshipTransportError,
)
from ..utils import refused_status

NAMES_THE_REQUEST = frozenset(
    {
        "invalid_payload",
        "invalid_signature",
        "authorization_expired",
        "authorization_not_yet_valid",
        "nonce_already_used",
        "simulation_reverted",
    }
)

# Already broadcast: a self-funded resend would race it or run after it.
ALREADY_SUBMITTED = frozenset(
    {
        "settlement_pending",
        "invalid_transaction_state",
        "duplicate_in_flight",
    }
)

NAMES_THE_CLAIM = frozenset(
    {
        "invalid_payload",
        "clearing_action_unavailable",
        "clearing_action_mismatch",
        "simulation_reverted",
        "invalid_transaction_state",
        "settlement_pending",
    }
)

NAMES_THE_PAYMENT = NAMES_THE_CLAIM | frozenset(
    {
        "invalid_signature",
        "authorization_expired",
        "authorization_not_yet_valid",
        "nonce_already_used",
        "insufficient_funds",
    }
)


class Facilitator:
    def __init__(
        self,
        base_url: str | None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url
        self._client = client or httpx.AsyncClient(timeout=30.0)

    def is_configured(self) -> bool:
        return self._base_url is not None

    async def aclose(self) -> None:
        await self._client.aclose()

    async def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        if self._base_url is None:
            raise FacilitatorNotConfiguredError()
        base = self._base_url if self._base_url.endswith("/") else self._base_url + "/"

        try:
            response = await self._client.post(base + path, json=body)
        except (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.PoolTimeout,
            httpx.InvalidURL,
            httpx.UnsupportedProtocol,
        ) as exc:
            raise SponsorshipTransportError(
                f"facilitator request failed: {exc}"
            ) from exc
        except httpx.HTTPError as exc:
            raise OutcomeUnknownError(f"facilitator request failed: {exc}") from exc

        if not response.is_success:
            message = f"facilitator returned {response.status_code}: {response.text}"
            if refused_status(response.status_code):
                raise SponsorshipTransportError(message)
            raise OutcomeUnknownError(message)

        try:
            payload = response.json()
        except Exception as exc:
            raise OutcomeUnknownError(f"malformed facilitator response: {exc}") from exc
        if not isinstance(payload, dict):
            raise OutcomeUnknownError("malformed facilitator response: not an object")
        return payload


def confirm_facilitator_echo(field: str, raw: str | None, expected: str) -> str:
    if raw is None:
        return expected
    if str(raw).lower() == str(expected).lower():
        return expected
    raise OutcomeUnknownError(f"facilitator echoed {field} {raw}, expected {expected}")


def _extra(payload: dict[str, Any]) -> dict[str, Any]:
    extra = payload.get("extra")
    return extra if isinstance(extra, dict) else {}


def eip2612_nonce(payload: dict[str, Any]) -> int | None:
    details = _extra(payload).get("details")
    if not isinstance(details, dict):
        return None
    raw = details.get("eip2612Nonce")
    if raw is None:
        return None
    try:
        return int(str(raw), 0)
    except ValueError:
        return None


def rejection_error(
    payload: dict[str, Any], reason: str | None, message: str | None
) -> SponsorshipError:
    code = reason or "unknown"
    text = message or "facilitator gave no reason"
    if code == "permit2_allowance_required":
        return Permit2AllowanceRequiredError(text, eip2612_nonce(payload))
    if code == "sponsorship_unavailable":
        return FacilitatorNotConfiguredError(message)
    transaction = payload.get("transaction")
    return FacilitatorRejectedError(
        code=str(code),
        message=str(text),
        retryable=bool(_extra(payload).get("retryable")),
        transaction=transaction
        if isinstance(transaction, str) and transaction
        else None,
        details=_extra(payload).get("details"),
    )


def sponsorship_unavailable(exc: Exception, names_the_request: frozenset[str]) -> bool:
    if isinstance(exc, OutcomeUnknownError):
        return False
    if isinstance(exc, Permit2AllowanceRequiredError):
        return False
    if isinstance(exc, FacilitatorRejectedError):
        return exc.code not in ALREADY_SUBMITTED and exc.code not in names_the_request
    return isinstance(exc, SponsorshipError)


def refuses_the_authorization(exc: Exception) -> bool:
    if isinstance(exc, MissingTokenDomainSeparatorError):
        return True
    return isinstance(exc, FacilitatorRejectedError) and exc.code in (
        "simulation_reverted",
        "unsupported_transfer_method",
    )
