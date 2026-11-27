from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple, cast

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
)
from .networks import to_app_network

DEFAULT_APP_BASE_URL = "https://api.app.4mica.io"


class AppError(FourMicaError):
    """The app API refused a request, or could not be reached. ``status`` is
    the HTTP status, ``code`` the API's error code, ``issues`` what failed
    validation, and ``body`` the answer as it came."""

    def __init__(
        self,
        message: str,
        status: Optional[int] = None,
        code: Optional[str] = None,
        issues: Optional[List[AppIssue]] = None,
        body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.issues: List[AppIssue] = issues or []
        self.body = body


def _issues(value: Any) -> List[AppIssue]:
    if not isinstance(value, list):
        return []
    return [
        AppIssue(path=item["path"], message=item["message"])
        for item in value
        if isinstance(item, dict)
        and isinstance(item.get("path"), str)
        and isinstance(item.get("message"), str)
    ]


def _without_none(fields: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in fields.items() if value is not None}


class AppClient:
    """A seller's client for the 4Mica app API, authenticated by the API key
    of one listing or agent. Pass *http_client* to send through your own; it
    stays yours to close."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = DEFAULT_APP_BASE_URL,
        http_client: Optional[httpx.AsyncClient] = None,
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

    async def __aenter__(self) -> "AppClient":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.aclose()

    async def resource(self) -> ResourceContext:
        """The listing or agent the API key belongs to, with its policy and FAQs."""
        _, body = await self._request("GET", "/v1/resource")
        return cast(ResourceContext, body)

    async def resolve_customer(
        self,
        *,
        payer_address: str,
        network: str,
        amount: str,
        coupon_code: Optional[str] = None,
    ) -> CustomerResolution:
        """Whether *payer_address* may pay *amount*, and what it pays after
        quotas, coupons, discounts and credit. *network* takes any form of
        the network's name."""
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
        asset_address: Optional[str] = None,
        status: Optional[AppPaymentStatus] = None,
        failure_reason: Optional[str] = None,
        listing_slug: Optional[str] = None,
        agent_slug: Optional[str] = None,
        resource: Optional[str] = None,
        description: Optional[str] = None,
        guarantee_claims: Optional[str] = None,
        guarantee_signature: Optional[str] = None,
        tx_hash: Optional[str] = None,
        settled_at: Optional[str] = None,
        coupon_code: Optional[str] = None,
        credit_applied: Optional[str] = None,
    ) -> ReportedPayment:
        """Records a payment the seller took. Reporting the same *req_id*
        again returns the payment already recorded, with ``created`` false.
        :func:`parse_settlement` reads most of these off an x402 settlement."""
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
        return ReportedPayment(payment=cast(AppPayment, body), created=code == 201)

    async def _request(
        self, method: str, path: str, payload: Optional[Dict[str, Any]] = None
    ) -> Tuple[int, Any]:
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
