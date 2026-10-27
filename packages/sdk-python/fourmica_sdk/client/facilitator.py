"""Transport for the service that submits signed authorizations and pays the
gas for them. Port of ``sdk-rust/src/client/facilitator.rs``.

The facilitator reports rejections in the body with a 200, so a non-success
status is a transport or routing problem rather than a refused request; a
request that provably never arrived is a :class:`SponsorshipTransportError`,
while anything that may have been acted on is an :class:`OutcomeUnknownError`
— retrying those blindly risks paying twice.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx

from ..errors import (
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    FourMicaError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
    SponsorshipError,
    SponsorshipTransportError,
)

# Rejections that describe the request itself rather than the facilitator's
# willingness to pay. The caller's own transaction would fail for the same
# reason, so falling back to self-funding just burns their gas on a revert.
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

# Additional claim-shaped rejections: the self-funded path resolves the same
# terms from the same core and submits to the same contract.
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

# Beyond the claim codes, the debtor's side of the bargain: a refused
# signature means this SDK signed over the wrong terms, and an insufficient
# balance fails the self-funded route just the same.
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
        base_url: Optional[str],
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        # None when none was configured; every call then fails with
        # FacilitatorNotConfiguredError rather than silently doing nothing.
        self._base_url = base_url
        self._client = client or httpx.AsyncClient(timeout=30.0)

    def is_configured(self) -> bool:
        return self._base_url is not None

    async def aclose(self) -> None:
        await self._client.aclose()

    async def post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        if self._base_url is None:
            raise FacilitatorNotConfiguredError()
        base = self._base_url if self._base_url.endswith("/") else self._base_url + "/"

        try:
            response = await self._client.post(base + path, json=body)
        except (httpx.ConnectError, httpx.InvalidURL, httpx.UnsupportedProtocol) as exc:
            raise SponsorshipTransportError(
                f"facilitator request failed: {exc}"
            ) from exc
        except httpx.HTTPError as exc:
            # The request may have gone out; whether it was acted on is unknown.
            raise OutcomeUnknownError(f"facilitator request failed: {exc}") from exc

        if not response.is_success:
            message = f"facilitator returned {response.status_code}: {response.text}"
            if 400 <= response.status_code < 500 and response.status_code != 408:
                raise SponsorshipTransportError(message)
            raise OutcomeUnknownError(message)

        try:
            payload = response.json()
        except Exception as exc:
            raise OutcomeUnknownError(f"malformed facilitator response: {exc}") from exc
        if not isinstance(payload, dict):
            raise OutcomeUnknownError("malformed facilitator response: not an object")
        return payload


def confirm_facilitator_echo(field: str, raw: Optional[str], expected: str) -> str:
    """Checks a value the facilitator echoed back against what was asked for,
    taking the request's own value when the echo is omitted. One that
    disagrees — or cannot be read — means the receipt would describe a
    transaction nobody asked for, and is refused as an unknown outcome."""
    if raw is None:
        return expected
    if str(raw).lower() == str(expected).lower():
        return expected
    raise OutcomeUnknownError(f"facilitator echoed {field} {raw}, expected {expected}")


def _extra(payload: Dict[str, Any]) -> Dict[str, Any]:
    """What the facilitator adds to a failure, under ``extra``: ``retryable``
    and ``details``. The reason and message travel beside it, under the names
    the response uses."""
    extra = payload.get("extra")
    return extra if isinstance(extra, dict) else {}


def eip2612_nonce(payload: Dict[str, Any]) -> Optional[int]:
    """The EIP-2612 nonce attached to a ``permit2_allowance_required``
    rejection — the one value a client with no chain access cannot compute."""
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
    payload: Dict[str, Any], reason: Optional[str], message: Optional[str]
) -> SponsorshipError:
    """The typed rejection for a ``success: false`` / ``isValid: false`` body.
    ``reason`` is ``errorReason`` on a submit and ``invalidReason`` on a
    verify, ``message`` the matching ``errorMessage`` / ``invalidMessage``.
    The reason is carried verbatim so a caller can branch on a code this SDK
    predates; absent ``extra.retryable`` means "not retryable" — a facilitator
    that omits it is not promising anything."""
    code = reason or "unknown"
    text = message or "facilitator gave no reason"
    if code == "permit2_allowance_required":
        return Permit2AllowanceRequiredError(text, eip2612_nonce(payload))
    if code == "sponsorship_unavailable":
        return FacilitatorNotConfiguredError()
    return FacilitatorRejectedError(
        code=str(code),
        message=str(text),
        retryable=bool(_extra(payload).get("retryable")),
    )


def sponsorship_unavailable(exc: FourMicaError, names_the_request: frozenset) -> bool:
    """Whether an error means "nobody sponsored this", as opposed to "this
    request is bad" or "we do not know what happened". Only the first is worth
    paying for a self-funded retry: a rejection naming the request would
    revert the caller's own transaction too, and an unknown outcome may mean
    the facilitator already submitted."""
    if isinstance(exc, OutcomeUnknownError):
        return False
    if isinstance(exc, Permit2AllowanceRequiredError):
        return False
    if isinstance(exc, FacilitatorRejectedError):
        return exc.code not in names_the_request
    return isinstance(exc, SponsorshipError)


def refuses_the_authorization(exc: FourMicaError) -> bool:
    """Whether a rejection means "this token cannot take an EIP-3009
    authorization" rather than "this request is bad". A token without
    ``receiveWithAuthorization`` reverts opaquely, reported as a failed
    simulation — retrying over Permit2 is a guess, but a cheap one: the
    simulation spent no gas, and a genuinely bad request fails the second
    route with its own error."""
    from ..errors import MissingTokenDomainSeparatorError

    if isinstance(exc, MissingTokenDomainSeparatorError):
        return True
    return isinstance(exc, FacilitatorRejectedError) and exc.code in (
        "simulation_reverted",
        "unsupported_transfer_method",
    )
