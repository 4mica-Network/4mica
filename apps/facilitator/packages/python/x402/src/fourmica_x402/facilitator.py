"""4mica facilitator client wrappers for the x402 Python SDK."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from x402.http import (
    FacilitatorConfig,
    HTTPFacilitatorClient,
    HTTPFacilitatorClientSync,
)
from x402.schemas import PaymentRequirements, SettleResponse
from x402.schemas.v1 import PaymentRequirementsV1

DEFAULT_FOURMICA_FACILITATOR_URL = "https://x402.4mica.xyz"


@dataclass
class OpenTabResponse:
    tab_id: str
    user_address: str
    recipient_address: str
    asset_address: str
    start_timestamp: int
    ttl_seconds: int
    next_req_id: Optional[str] = None

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "OpenTabResponse":
        def pick(keys, default=None):
            for key in keys:
                if key in payload and payload[key] is not None:
                    return payload[key]
            return default

        tab_id = pick(["tabId", "tab_id"])
        user_address = pick(["userAddress", "user_address"])
        recipient_address = pick(["recipientAddress", "recipient_address"])
        asset_address = pick(["assetAddress", "asset_address"])
        start_timestamp = pick(["startTimestamp", "start_timestamp"])
        ttl_seconds = pick(["ttlSeconds", "ttl_seconds"])
        next_req_id = pick(["nextReqId", "next_req_id", "reqId", "req_id"])

        if not all(
            [tab_id, user_address, recipient_address, asset_address, start_timestamp, ttl_seconds]
        ):
            raise ValueError("openTab response missing required fields")

        return cls(
            tab_id=str(tab_id),
            user_address=str(user_address),
            recipient_address=str(recipient_address),
            asset_address=str(asset_address),
            start_timestamp=int(start_timestamp),
            ttl_seconds=int(ttl_seconds),
            next_req_id=str(next_req_id) if next_req_id is not None else None,
        )


class OpenTabError(RuntimeError):
    def __init__(self, status: int, response: OpenTabResponse | Dict[str, Any]) -> None:
        super().__init__(f"OpenTab failed with status {status}")
        self.status = status
        self.response = response


def _requirements_to_payload(
    requirements: PaymentRequirements | PaymentRequirementsV1 | Dict[str, Any],
) -> Dict[str, Any]:
    if hasattr(requirements, "model_dump"):
        return requirements.model_dump(by_alias=True, exclude_none=True)
    if hasattr(requirements, "dict"):
        return requirements.dict(by_alias=True, exclude_none=True)
    if isinstance(requirements, dict):
        return requirements
    raise TypeError("payment_requirements must be a dict or pydantic model")


def _model_to_payload(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(by_alias=True, exclude_none=True)
    if hasattr(model, "dict"):
        return model.dict(by_alias=True, exclude_none=True)
    if isinstance(model, dict):
        return model
    raise TypeError("payload must be a dict or pydantic model")


class FourMicaFacilitatorClient(HTTPFacilitatorClient):
    """Async 4mica facilitator client with open_tab helper."""

    def __init__(self, config: FacilitatorConfig | dict[str, Any] | None = None) -> None:
        if isinstance(config, dict):
            config = {"url": config.get("url", DEFAULT_FOURMICA_FACILITATOR_URL), **config}
        else:
            config = config or FacilitatorConfig(url=DEFAULT_FOURMICA_FACILITATOR_URL)
            if config.url is None:
                config.url = DEFAULT_FOURMICA_FACILITATOR_URL
        super().__init__(config)

    async def open_tab(
        self,
        user_address: str,
        payment_requirements: PaymentRequirements | PaymentRequirementsV1 | Dict[str, Any],
        ttl_seconds: Optional[int] = None,
        guarantee_version: Optional[int] = None,
    ) -> OpenTabResponse:
        headers = {"Content-Type": "application/json"}
        if getattr(self, "_auth_provider", None) is not None:
            auth = self._auth_provider.get_auth_headers()
            headers.update(getattr(auth, "tabs", auth.verify))

        req_payload = _requirements_to_payload(payment_requirements)
        pay_to = req_payload.get("payTo") or req_payload.get("pay_to")
        network = req_payload.get("network")
        asset = req_payload.get("asset")

        body: Dict[str, Any] = {
            "userAddress": user_address,
            "recipientAddress": pay_to,
            "network": network,
            "erc20Token": asset,
            "guaranteeVersion": guarantee_version if guarantee_version is not None else 1,
        }
        if ttl_seconds is not None:
            body["ttlSeconds"] = ttl_seconds

        client = self._get_async_client()
        response = await client.post(
            f"{self._url}/tabs",
            headers=headers,
            json=self._to_json_safe(body),
        )

        try:
            payload = response.json()
        except Exception as exc:  # pragma: no cover - invalid JSON
            raise ValueError(f"openTab invalid JSON response: {exc}") from exc

        if isinstance(payload, dict) and any(k in payload for k in ["tabId", "tab_id"]):
            open_tab_response = OpenTabResponse.from_payload(payload)
            if not response.is_success:
                raise OpenTabError(response.status_code, open_tab_response)
            return open_tab_response

        if not response.is_success:
            raise OpenTabError(response.status_code, payload)

        raise ValueError("openTab response missing tabId")

    async def settle(
        self,
        payload,
        requirements,
    ) -> SettleResponse:
        request_body = self._build_request_body(
            payload.x402_version,
            _model_to_payload(payload),
            _model_to_payload(requirements),
        )
        client = self._get_async_client()
        response = await client.post(
            f"{self._url}/settle",
            headers=self._get_settle_headers(),
            json=request_body,
        )
        if response.status_code != 200:
            raise ValueError(f"Facilitator settle failed ({response.status_code}): {response.text}")
        return _normalize_settle_response(response.json(), requirements)


class FourMicaFacilitatorClientSync(HTTPFacilitatorClientSync):
    """Sync 4mica facilitator client with open_tab helper."""

    def __init__(self, config: FacilitatorConfig | dict[str, Any] | None = None) -> None:
        if isinstance(config, dict):
            config = {"url": config.get("url", DEFAULT_FOURMICA_FACILITATOR_URL), **config}
        else:
            config = config or FacilitatorConfig(url=DEFAULT_FOURMICA_FACILITATOR_URL)
            if config.url is None:
                config.url = DEFAULT_FOURMICA_FACILITATOR_URL
        super().__init__(config)

    def open_tab(
        self,
        user_address: str,
        payment_requirements: PaymentRequirements | PaymentRequirementsV1 | Dict[str, Any],
        ttl_seconds: Optional[int] = None,
        guarantee_version: Optional[int] = None,
    ) -> OpenTabResponse:
        headers = {"Content-Type": "application/json"}
        if getattr(self, "_auth_provider", None) is not None:
            auth = self._auth_provider.get_auth_headers()
            headers.update(getattr(auth, "tabs", auth.verify))

        req_payload = _requirements_to_payload(payment_requirements)
        pay_to = req_payload.get("payTo") or req_payload.get("pay_to")
        network = req_payload.get("network")
        asset = req_payload.get("asset")

        body: Dict[str, Any] = {
            "userAddress": user_address,
            "recipientAddress": pay_to,
            "network": network,
            "erc20Token": asset,
            "guaranteeVersion": guarantee_version if guarantee_version is not None else 1,
        }
        if ttl_seconds is not None:
            body["ttlSeconds"] = ttl_seconds

        client = self._get_client()
        response = client.post(
            f"{self._url}/tabs",
            headers=headers,
            json=self._to_json_safe(body),
        )

        try:
            payload = response.json()
        except Exception as exc:  # pragma: no cover - invalid JSON
            raise ValueError(f"openTab invalid JSON response: {exc}") from exc

        if isinstance(payload, dict) and any(k in payload for k in ["tabId", "tab_id"]):
            open_tab_response = OpenTabResponse.from_payload(payload)
            if response.status_code >= 400:
                raise OpenTabError(response.status_code, open_tab_response)
            return open_tab_response

        if response.status_code >= 400:
            raise OpenTabError(response.status_code, payload)

        raise ValueError("openTab response missing tabId")

    def settle(
        self,
        payload,
        requirements,
    ) -> SettleResponse:
        request_body = self._build_request_body(
            payload.x402_version,
            _model_to_payload(payload),
            _model_to_payload(requirements),
        )
        client = self._get_client()
        response = client.post(
            f"{self._url}/settle",
            headers=self._get_settle_headers(),
            json=request_body,
        )
        if response.status_code != 200:
            raise ValueError(f"Facilitator settle failed ({response.status_code}): {response.text}")
        return _normalize_settle_response(response.json(), requirements)


def _attach_optional_fields(
    response: SettleResponse,
    payload: Dict[str, Any],
) -> SettleResponse:
    certificate = payload.get("certificate")
    transaction = (
        payload.get("transaction")
        or payload.get("transactionHash")
        or payload.get("txHash")
        or payload.get("tx_hash")
        or payload.get("hash")
        or payload.get("requestId")
        or payload.get("request_id")
    )
    tx_hash = payload.get("txHash") or payload.get("tx_hash")
    network = (
        payload.get("network")
        or payload.get("networkId")
        or payload.get("network_id")
        or payload.get("chainId")
        or payload.get("chain_id")
    )
    network_id = payload.get("networkId") or payload.get("network_id")
    payer = payload.get("payer") or payload.get("userAddress") or payload.get("user_address")

    for name, value in (
        ("certificate", certificate),
        ("transaction", transaction),
        ("tx_hash", tx_hash),
        ("txHash", tx_hash),
        ("network", network),
        ("network_id", network_id),
        ("networkId", network_id),
        ("payer", payer),
    ):
        if value is None:
            continue
        try:
            setattr(response, name, value)
        except Exception:
            continue
    return response


def _normalize_settle_response(
    payload: Dict[str, Any],
    requirements: PaymentRequirements | PaymentRequirementsV1,
) -> SettleResponse:
    try:
        response = SettleResponse.model_validate(payload)
    except Exception:
        if not isinstance(payload, dict):
            raise
    else:
        return _attach_optional_fields(response, payload)

    tx = (
        payload.get("transaction")
        or payload.get("transactionHash")
        or payload.get("txHash")
        or payload.get("tx_hash")
        or payload.get("hash")
        or payload.get("requestId")
        or payload.get("request_id")
    )
    network = (
        payload.get("network")
        or payload.get("networkId")
        or payload.get("network_id")
        or payload.get("chainId")
        or payload.get("chain_id")
        or str(requirements.network)
    )
    error_reason = (
        payload.get("error_reason")
        or payload.get("errorReason")
        or payload.get("error")
        or payload.get("message")
    )
    error_message = payload.get("error_message") or payload.get("errorMessage")
    payer = payload.get("payer") or payload.get("userAddress") or payload.get("user_address")
    success = bool(payload.get("success", error_reason is None))

    response = SettleResponse(
        success=success,
        error_reason=error_reason,
        error_message=error_message,
        payer=payer,
        transaction=str(tx or ""),
        network=str(network),
    )
    return _attach_optional_fields(response, payload)
