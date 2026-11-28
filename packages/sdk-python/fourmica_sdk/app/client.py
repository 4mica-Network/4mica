from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any, cast
from urllib.parse import quote

import httpx

from ..errors import ConfigError, FourMicaError
from ..rpc import SDK_CLIENT, SDK_CLIENT_HEADER
from .models import (
    AppIssue,
    AppPayment,
    AppPaymentStatus,
    CustomerResolution,
    ReportedPayment,
    ResourceContext,
    SpendAuthorization,
)
from .networks import to_app_network

DEFAULT_APP_BASE_URL = "https://api.app.4mica.io"


class AppError(FourMicaError):
    """The app API refused a request, or could not be reached."""

    def __init__(
        self,
        message: str,
        status: int | None = None,
        code: str | None = None,
        issues: list[AppIssue] | None = None,
        body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.issues: list[AppIssue] = issues or []
        self.body = body


def _issues(value: Any) -> list[AppIssue]:
    if not isinstance(value, list):
        return []
    return [
        AppIssue(path=item["path"], message=item["message"])
        for item in value
        if isinstance(item, dict)
        and isinstance(item.get("path"), str)
        and isinstance(item.get("message"), str)
    ]


def _without_none(fields: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in fields.items() if value is not None}


class AppClient:
    """Authenticated by one listing's or agent's API key. A passed
    *http_client* stays yours to close."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_APP_BASE_URL,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        key = (api_key or "").strip()
        if not key:
            raise ConfigError("an API key is required to call the 4Mica API")
        self._api_key = key
        self._base_url = base_url.rstrip("/")
        self._http = http_client or httpx.AsyncClient(timeout=30.0)
        self._owns_http = http_client is None

    async def aclose(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def __aenter__(self) -> AppClient:
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def resource(self) -> ResourceContext:
        """The listing or agent the API key belongs to."""
        _, body = await self._request("GET", "/v1/resource")
        return cast(ResourceContext, body)

    async def resolve_customer(
        self,
        *,
        payer_address: str,
        network: str,
        amount: str,
        coupon_code: str | None = None,
    ) -> CustomerResolution:
        """Whether *payer_address* may pay *amount*, and what it pays after
        quotas, coupons, discounts and credit. *network* takes any form of its name."""
        _, body = await self._request(
            "POST",
            "/v1/customers/resolve",
            _without_none(
                {
                    "payerAddress": payer_address,
                    "network": to_app_network(network),
                    "amount": amount,
                    "couponCode": coupon_code,
                }
            ),
        )
        return cast(CustomerResolution, body)

    async def report_payment(
        self,
        *,
        req_id: str,
        payer_address: str,
        recipient_address: str,
        network: str,
        amount: str,
        asset_address: str | None = None,
        status: AppPaymentStatus | None = None,
        failure_reason: str | None = None,
        listing_slug: str | None = None,
        agent_slug: str | None = None,
        resource: str | None = None,
        description: str | None = None,
        guarantee_claims: str | None = None,
        guarantee_signature: str | None = None,
        tx_hash: str | None = None,
        settled_at: str | None = None,
        coupon_code: str | None = None,
        credit_applied: str | None = None,
    ) -> ReportedPayment:
        """Idempotent per *req_id*: a repeat returns the payment already
        recorded, with ``created`` false."""
        code, body = await self._request(
            "POST",
            "/v1/payments",
            _without_none(
                {
                    "reqId": req_id,
                    "payerAddress": payer_address,
                    "recipientAddress": recipient_address,
                    "network": to_app_network(network),
                    "amount": amount,
                    "assetAddress": asset_address,
                    "status": status,
                    "failureReason": failure_reason,
                    "listingSlug": listing_slug,
                    "agentSlug": agent_slug,
                    "resource": resource,
                    "description": description,
                    "guaranteeClaims": guarantee_claims,
                    "guaranteeSignature": guarantee_signature,
                    "txHash": tx_hash,
                    "settledAt": settled_at,
                    "couponCode": coupon_code,
                    "creditApplied": credit_applied,
                }
            ),
        )
        return ReportedPayment(
            payment=cast(AppPayment, body), created=code == HTTPStatus.CREATED
        )

    async def authorize_spend(
        self,
        *,
        network: str,
        amount: str,
        payer_address: str,
        recipient_address: str,
        asset_address: str | None = None,
        req_id: str | None = None,
        agent_id: str | None = None,
    ) -> SpendAuthorization:
        """Checks a payment against the organization's spending policies before
        it is signed. *asset_address* ``None`` is the native asset."""
        _, body = await self._request(
            "POST",
            "/v1/spend/authorize",
            {
                **_without_none(
                    {
                        "network": to_app_network(network),
                        "amount": amount,
                        "payerAddress": payer_address,
                        "recipientAddress": recipient_address,
                        "reqId": req_id,
                        "agentId": agent_id,
                    }
                ),
                "assetAddress": asset_address,
            },
        )
        return cast(SpendAuthorization, body)

    async def get_spend_authorization(
        self, authorization_id: str
    ) -> SpendAuthorization:
        _, body = await self._request(
            "GET", f"/v1/spend/authorizations/{quote(authorization_id, safe='')}"
        )
        return cast(SpendAuthorization, body)

    async def consume_spend_authorization(
        self,
        authorization_id: str,
        *,
        req_id: str | None = None,
        tx_hash: str | None = None,
    ) -> SpendAuthorization:
        _, body = await self._request(
            "POST",
            f"/v1/spend/authorizations/{quote(authorization_id, safe='')}/consume",
            _without_none({"reqId": req_id, "txHash": tx_hash}),
        )
        return cast(SpendAuthorization, body)

    async def release_spend_authorization(
        self, authorization_id: str
    ) -> SpendAuthorization:
        _, body = await self._request(
            "POST",
            f"/v1/spend/authorizations/{quote(authorization_id, safe='')}/release",
            {},
        )
        return cast(SpendAuthorization, body)

    async def _request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> tuple[int, Any]:
        headers = {
            "authorization": f"Bearer {self._api_key}",
            SDK_CLIENT_HEADER: SDK_CLIENT,
        }
        try:
            response = await self._http.request(
                method, f"{self._base_url}{path}", headers=headers, json=payload
            )
        except httpx.HTTPError as exc:
            raise AppError(f"request to {path} failed: {exc}") from exc

        body: Any = None
        if response.text:
            try:
                body = json.loads(response.text)
            except ValueError:
                raise AppError(
                    f"invalid JSON response from {path}",
                    status=response.status_code,
                    body=response.text,
                ) from None

        if not response.is_success:
            error = body if isinstance(body, dict) else {}
            code = error.get("error")
            message = error.get("message")
            raise AppError(
                message
                if isinstance(message, str)
                else f"request to {path} failed with {response.status_code}",
                status=response.status_code,
                code=code if isinstance(code, str) else None,
                issues=_issues(error.get("issues")),
                body=body,
            )
        return response.status_code, body
