"""4mica facilitator client wrappers for the x402 Python SDK."""

from __future__ import annotations

from typing import Any, Dict

from x402.http import (
    FacilitatorConfig,
    HTTPFacilitatorClient,
    HTTPFacilitatorClientSync,
)
from x402.schemas import PaymentRequirements, SettleResponse
from x402.schemas.v1 import PaymentRequirementsV1

DEFAULT_FOURMICA_FACILITATOR_URL = "https://x402.4mica.xyz"


def _model_to_payload(model: Any) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(by_alias=True, exclude_none=True)
    if hasattr(model, "dict"):
        return model.dict(by_alias=True, exclude_none=True)
    if isinstance(model, dict):
        return model
    raise TypeError("payload must be a dict or pydantic model")


class FourMicaFacilitatorClient(HTTPFacilitatorClient):
    """Async 4mica facilitator client."""

    def __init__(self, config: FacilitatorConfig | dict[str, Any] | None = None) -> None:
        if isinstance(config, dict):
            config = {"url": config.get("url", DEFAULT_FOURMICA_FACILITATOR_URL), **config}
        else:
            config = config or FacilitatorConfig(url=DEFAULT_FOURMICA_FACILITATOR_URL)
            if config.url is None:
                config.url = DEFAULT_FOURMICA_FACILITATOR_URL
        super().__init__(config)

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
    """Sync 4mica facilitator client."""

    def __init__(self, config: FacilitatorConfig | dict[str, Any] | None = None) -> None:
        if isinstance(config, dict):
            config = {"url": config.get("url", DEFAULT_FOURMICA_FACILITATOR_URL), **config}
        else:
            config = config or FacilitatorConfig(url=DEFAULT_FOURMICA_FACILITATOR_URL)
            if config.url is None:
                config.url = DEFAULT_FOURMICA_FACILITATOR_URL
        super().__init__(config)

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
