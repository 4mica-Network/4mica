#!/usr/bin/env python3
"""
Mock paid API that uses the x402 payment protocol to protect a resource by verifying and
settling user guarantees through the facilitator.

The mock server acts as the resource server from the protocol diagram:
  • When a client calls the paid endpoint without a payment, respond with 402,
    advertise the supported scheme/network, and point the client at `/tab`
    so they can request a tab with their wallet address.
  • If a client supplies an X-PAYMENT header the server asks the facilitator to
    verify it and, on success, returns the protected resource payload. A static
    fallback signature is still accepted for quick smoke tests.

Run with:

    uvicorn mock_paid_api:app --reload --port 9000 --factory

The `factory` option lets uvicorn call `create_app()` so we can update the
requirements easily when extending the example.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import time
import logging
from urllib.parse import urljoin, urlparse
from pathlib import Path
from typing import Any, Dict, Optional, Sequence, Tuple, Union

import requests
from fastapi import FastAPI, Header, status
from fastapi.responses import JSONResponse

JsonDict = Dict[str, Any]


ENV_PATH = Path(__file__).parent.with_name(".env")
DEFAULT_SCHEME = "4mica-credit"
DEFAULT_NETWORK = "eip155:80002"
DEFAULT_MAX_AMOUNT = "100"  
DEFAULT_ASSET = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
DEFAULT_DESCRIPTION = "Demo paid API - 4mica tab verification required"
DEFAULT_RESOURCE = "mock-paid-endpoint"
DEFAULT_FACILITATOR_URL = "https://x402.4mica.xyz/"

_ENV_FILE_CACHE: Optional[Dict[str, str]] = None
_TAB_STATE: Dict[str, Dict[str, Any]] = {}
logger = logging.getLogger("mock_paid_api")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="mock_paid_api %(levelname)s: %(message)s")


def _load_env_file() -> Dict[str, str]:
    global _ENV_FILE_CACHE
    if _ENV_FILE_CACHE is not None:
        return _ENV_FILE_CACHE

    data: Dict[str, str] = {}
    if ENV_PATH.exists():
        with ENV_PATH.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                data[key.strip()] = value.strip()

    _ENV_FILE_CACHE = data
    return data


def _config_value(
    keys: Union[str, Sequence[str]],
    *,
    required: bool = True,
    default: Optional[str] = None,
) -> Optional[str]:
    """Read configuration from environment variables or the local .env file."""
    key_list: Tuple[str, ...]
    if isinstance(keys, str):
        key_list = (keys,)
    else:
        key_list = tuple(keys)

    env_file = _load_env_file()
    for key in key_list:
        value = os.environ.get(key)
        if value is None:
            value = env_file.get(key)
        if value is not None and value.strip():
            return value.strip()

    if not required:
        return default

    joined = "/".join(key_list)
    raise RuntimeError(
        f"Missing configuration for {joined}. Provide it via environment or {ENV_PATH}."
    )


def _tab_endpoint_url() -> str:
    override = _config_value("TAB_ENDPOINT_URL", required=False)
    if override:
        return override

    resource_url = _config_value(
        "RESOURCE_URL",
        required=False,
        default="http://localhost:9000/protected",
    )
    parsed = urlparse(resource_url)
    if parsed.scheme and parsed.netloc:
        base = f"{parsed.scheme}://{parsed.netloc}"
        return urljoin(base, "/tab")

    return "http://localhost:9000/tab"


def _normalize_address(value: str, *, field: str) -> str:
    addr = value.strip()
    if not addr.lower().startswith("0x"):
        raise RuntimeError(f"{field} must be a 0x-prefixed hexadecimal address.")
    if len(addr) != 42:
        raise RuntimeError(f"{field} must be a 42-character 0x-prefixed Ethereum address.")
    return addr


def _as_hex_u256(value: Any) -> str:
    if isinstance(value, int):
        return hex(value)
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            raise RuntimeError("U256 value cannot be empty.")
        if trimmed.lower().startswith("0x"):
            digits = trimmed[2:].lstrip("0") or "0"
            return "0x" + digits.lower()
        return f"0x{int(trimmed, 10):x}"
    raise RuntimeError(f"Unsupported U256 representation: {value!r}")


def _parse_optional_int(name: str, value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value, 10)
    except ValueError as err:
        raise RuntimeError(f"{name} must be an integer value.") from err


def _ensure_payment_tab(
    user_address: str,
    recipient_address: str,
    ttl_seconds: Optional[int],
    asset_address: str,
    erc20_token: Optional[str],
) -> Dict[str, Any]:
    existing = _TAB_STATE.get(user_address)
    now = int(time.time())
    if existing is not None:
        stored_ttl = existing.get("ttl_seconds")
        start_ts = existing.get("start_timestamp", now)
        if stored_ttl and stored_ttl > 0 and (start_ts + stored_ttl) <= now:
            existing = None
        else:
            return dict(existing)

    facilitator_url = _config_value(
        "FACILITATOR_URL",
        required=False,
        default=DEFAULT_FACILITATOR_URL,
    )
    if "://" not in facilitator_url:
        facilitator_url = f"http://{facilitator_url}"
    url = f"{facilitator_url.rstrip('/')}/tabs"
    payload = {
        "user_address": user_address,
        "recipient_address": recipient_address,
        "asset_address": asset_address,
        "erc20_token": erc20_token or asset_address,
        "ttl_seconds": ttl_seconds,
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
    except requests.HTTPError as err:
        message = _extract_error_from_response(err.response)
        raise RuntimeError(
            f"Facilitator rejected payment tab ({err.response.status_code}): {message}"
        ) from err
    except requests.RequestException as err:
        raise RuntimeError(f"Failed to request payment tab via facilitator at {url}: {err}") from err

    data = response.json()
    tab_id = data.get("tabId")
    if tab_id is None:
        raise RuntimeError("Facilitator response missing tabId.")
    next_req_id = data.get("nextReqId") or data.get("next_req_id") or data.get("reqId")

    def _parse_int(value: Any, *, field: str, default: int) -> int:
        if value is None:
            return default
        try:
            return int(value)
        except (TypeError, ValueError) as err:
            raise RuntimeError(f"Facilitator response included invalid {field}") from err

    start_timestamp = _parse_int(
        data.get("startTimestamp"),
        field="startTimestamp",
        default=now,
    )
    ttl_value = _parse_int(
        data.get("ttlSeconds"),
        field="ttlSeconds",
        default=ttl_seconds or 0,
    )

    tab_state = {
        "tab_id": str(tab_id),
        "asset_address": data.get("assetAddress"),
        "start_timestamp": start_timestamp,
        "ttl_seconds": ttl_value,
        "next_req_id": str(next_req_id) if next_req_id is not None else None,
    }
    _TAB_STATE[user_address] = tab_state
    return dict(tab_state)


def _extract_error_from_response(response: Optional[requests.Response]) -> str:
    if response is None:
        return "unknown error"
    try:
        payload = response.json()
    except ValueError:
        text = response.text.strip()
        return text or "unknown error"
    if isinstance(payload, dict) and "error" in payload:
        return str(payload["error"])
    return response.text.strip() or "unknown error"


def _build_payment_requirements(user_address: str) -> JsonDict:
    tab_endpoint_url = _tab_endpoint_url()
    recipient_address = _normalize_address(
        _config_value("RECIPIENT_ADDRESS"),
        field="RECIPIENT_ADDRESS",
    )
    configured_asset = _normalize_address(
        _config_value("ASSET_ADDRESS", required=False, default=DEFAULT_ASSET),
        field="ASSET_ADDRESS",
    )
    asset_address = configured_asset

    max_amount_required = _as_hex_u256(
        _config_value("MAX_AMOUNT_WEI", required=False, default=DEFAULT_MAX_AMOUNT)
    )
    description = _config_value("PAYMENT_DESCRIPTION", required=False, default=DEFAULT_DESCRIPTION)
    resource_name = _config_value("PAYMENT_RESOURCE", required=False, default=DEFAULT_RESOURCE)
    scheme = _config_value("X402_SCHEME", required=False, default=DEFAULT_SCHEME)
    network = _config_value("X402_NETWORK", required=False, default=DEFAULT_NETWORK)

    ttl_seconds = _parse_optional_int(
        "TAB_TTL_SECONDS",
        _config_value("TAB_TTL_SECONDS", required=False),
    )

    erc20_token = _config_value("ERC20_TOKEN", required=False)
    if erc20_token:
        erc20_token = _normalize_address(erc20_token, field="ERC20_TOKEN")
    tab_token = erc20_token or configured_asset

    tab_data = _ensure_payment_tab(
        user_address, recipient_address, ttl_seconds, configured_asset, tab_token
    )
    tab_id = tab_data["tab_id"]
    start_ts = tab_data.get("start_timestamp", int(time.time()))
    tab_asset = tab_data.get("asset_address")
    if tab_asset:
        asset_address = _normalize_address(tab_asset, field="assetAddress")
    else:
        asset_address = configured_asset

    requirements: JsonDict = {
        "scheme": scheme,
        "network": network,
        "maxAmountRequired": max_amount_required,
        "payTo": recipient_address,
        "asset": asset_address,
        "description": description,
        "resource": resource_name,
        "extra": {
            "tabId": tab_id,
            "userAddress": user_address,
            "startTimestamp": str(start_ts),
            "tabEndpoint": tab_endpoint_url,
        },
    }
    next_req_id = tab_data.get("next_req_id")
    if next_req_id is not None:
        requirements["extra"]["nextReqId"] = str(next_req_id)

    return requirements


def _requirements_template() -> JsonDict:
    tab_endpoint_url = _tab_endpoint_url()
    recipient_address = _normalize_address(
        _config_value("RECIPIENT_ADDRESS"),
        field="RECIPIENT_ADDRESS",
    )
    configured_asset = _normalize_address(
        _config_value("ASSET_ADDRESS", required=False, default=DEFAULT_ASSET),
        field="ASSET_ADDRESS",
    )

    max_amount_required = _as_hex_u256(
        _config_value("MAX_AMOUNT_WEI", required=False, default=DEFAULT_MAX_AMOUNT)
    )
    description = _config_value("PAYMENT_DESCRIPTION", required=False, default=DEFAULT_DESCRIPTION)
    resource_name = _config_value("PAYMENT_RESOURCE", required=False, default=DEFAULT_RESOURCE)
    scheme = _config_value("X402_SCHEME", required=False, default=DEFAULT_SCHEME)
    network = _config_value("X402_NETWORK", required=False, default=DEFAULT_NETWORK)

    template: JsonDict = {
        "scheme": scheme,
        "network": network,
        "maxAmountRequired": max_amount_required,
        "payTo": recipient_address,
        "asset": configured_asset,
        "description": description,
        "resource": resource_name,
        "extra": {
            "tabEndpoint": tab_endpoint_url,
        },
    }
    return template


def _load_custom_requirements() -> Optional[JsonDict]:
    raw = os.environ.get("MOCK_REQUIREMENTS_JSON")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError as err:
        raise RuntimeError("MOCK_REQUIREMENTS_JSON must contain valid JSON") from err


def _maybe_normalize_address(value: Any, *, field: str) -> Optional[str]:
    if not isinstance(value, str):
        return None
    try:
        return _normalize_address(value, field=field)
    except RuntimeError:
        return None


def _user_address_from_header(header: str) -> Optional[str]:
    trimmed = header.strip()
    if not trimmed:
        return None
    try:
        decoded = base64.b64decode(trimmed)
        payload = json.loads(decoded)
    except (ValueError, binascii.Error):
        return None

    claims_payload = payload.get("payload")
    if not isinstance(claims_payload, dict):
        return None
    claims = claims_payload.get("claims")
    if not isinstance(claims, dict):
        return None
    return _maybe_normalize_address(claims.get("user_address"), field="claims.user_address")


def verify_with_facilitator(
    facilitator_url: str,
    header: str,
    requirements: JsonDict,
    *,
    user_address: Optional[str] = None,
) -> Tuple[bool, Optional[JsonDict], Optional[str]]:
    payload = {
        "x402Version": 1,
        "paymentHeader": header,
        "paymentRequirements": json.loads(json.dumps(requirements)),
    }
    endpoint = f"{facilitator_url.rstrip('/')}/verify"
    tab_id = requirements.get("extra", {}).get("tabId")
    logger.info(
        "POST %s (verify) tab=%s user=%s", endpoint, tab_id, user_address or "unknown"
    )
    try:
        response = requests.post(endpoint, json=payload, timeout=10)
        response.raise_for_status()
    except requests.RequestException as err:
        logger.warning(
            "facilitator verify failed tab=%s user=%s: %s",
            tab_id,
            user_address or "unknown",
            err,
        )
        return False, None, f"failed to contact facilitator at {endpoint}: {err}"
    data = response.json()
    if data.get("isValid") is True:
        logger.info("facilitator verify success tab=%s user=%s", tab_id, user_address or "unknown")
        return True, data, None

    reason = data.get("invalidReason") or "facilitator rejected payment"
    logger.warning(
        "facilitator verify rejected tab=%s user=%s reason=%s",
        tab_id,
        user_address or "unknown",
        reason,
    )
    return False, data, reason


def settle_with_facilitator(
    facilitator_url: str,
    header: str,
    requirements: JsonDict,
    *,
    user_address: Optional[str] = None,
) -> Tuple[bool, Optional[JsonDict], Optional[str]]:
    payload = {
        "x402Version": 1,
        "paymentHeader": header,
        "paymentRequirements": json.loads(json.dumps(requirements)),
    }
    endpoint = f"{facilitator_url.rstrip('/')}/settle"
    tab_id = requirements.get("extra", {}).get("tabId")
    logger.info(
        "POST %s (settle) tab=%s user=%s", endpoint, tab_id, user_address or "unknown"
    )
    try:
        response = requests.post(endpoint, json=payload, timeout=10)
        response.raise_for_status()
    except requests.RequestException as err:
        logger.warning(
            "facilitator settle failed tab=%s user=%s: %s",
            tab_id,
            user_address or "unknown",
            err,
        )
        return False, None, f"failed to contact facilitator at {endpoint}: {err}"

    data = response.json()
    if data.get("success") is True:
        logger.info(
            "facilitator settle success tab=%s user=%s", tab_id, user_address or "unknown"
        )
        return True, data, None

    reason = data.get("error") or "facilitator rejected settlement"
    logger.warning(
        "facilitator settle rejected tab=%s user=%s reason=%s",
        tab_id,
        user_address or "unknown",
        reason,
    )
    return False, data, reason


def create_app() -> FastAPI:
    app = FastAPI(title="Mock Paid API")

    requirements_state: Dict[str, JsonDict] = {}
    facilitator_url = _config_value(
        "FACILITATOR_URL",
        required=False,
        default=DEFAULT_FACILITATOR_URL,
    )
    template_requirements = _requirements_template()
    tab_endpoint = _tab_endpoint_url()

    def _clone_requirements(requirements: JsonDict) -> JsonDict:
        return json.loads(json.dumps(requirements))

    def _record_requirements(user_address: str, requirements: JsonDict) -> None:
        requirements_state[user_address] = _clone_requirements(requirements)

    def _active_requirements(user_address: str) -> Optional[JsonDict]:
        entry = requirements_state.get(user_address)
        if entry is None:
            return None
        return _clone_requirements(entry)

    def _clear_user_state(user_address: str) -> None:
        requirements_state.pop(user_address, None)

    @app.get("/")
    async def index() -> JsonDict:
        return {
            "message": "Mock paid API",
            "protected": "/protected",
            "hint": "Call /protected without X-PAYMENT to discover the required scheme.",
        }

    @app.post("/tab")
    async def issue_tab(payload: JsonDict) -> JSONResponse:
        user_address_raw = payload.get("userAddress") or payload.get("user_address")
        if not isinstance(user_address_raw, str):
            body = {"error": "userAddress is required"}
            return JSONResponse(body, status_code=status.HTTP_400_BAD_REQUEST)
        try:
            user_address = _normalize_address(user_address_raw, field="userAddress")
        except RuntimeError as err:
            return JSONResponse({"error": str(err)}, status_code=status.HTTP_400_BAD_REQUEST)

        override = _load_custom_requirements()
        if override is not None:
            requirements = _clone_requirements(override)
        else:
            requirements = _build_payment_requirements(user_address)
        _record_requirements(user_address, requirements)

        extra = requirements.get("extra") or {}
        response_body: JsonDict = {
            "tabId": extra.get("tabId"),
            "paymentRequirements": requirements,
        }
        if extra.get("startTimestamp"):
            response_body["startTimestamp"] = extra["startTimestamp"]
        if extra.get("nextReqId"):
            response_body["nextReqId"] = extra["nextReqId"]
        response_body["userAddress"] = user_address
        return JSONResponse(response_body)

    @app.get("/protected")
    async def protected_resource(
        x_payment: Optional[str] = Header(default=None, alias="X-PAYMENT")
    ) -> JSONResponse:
        logger.info("received /protected request (has_x_payment=%s)", bool(x_payment))
        if x_payment is None:
            response_body = {
                "error": "guarantee required",
                "paymentRequirements": template_requirements,
                "accepts": [template_requirements],
                "tabEndpoint": tab_endpoint,
                "hint": "Send POST /tab with { userAddress } to mint payment requirements for your wallet.",
            }
            return JSONResponse(response_body, status_code=status.HTTP_402_PAYMENT_REQUIRED)

        user_address = _user_address_from_header(x_payment)
        if user_address is None:
            logger.warning("X-PAYMENT missing or invalid; cannot extract user address")
            response_body = {
                "error": "invalid guarantee header",
                "hint": "Unable to extract user address; request a tab and retry.",
                "tabEndpoint": tab_endpoint,
                "accepts": [template_requirements],
            }
            return JSONResponse(response_body, status_code=status.HTTP_402_PAYMENT_REQUIRED)

        requirements = _active_requirements(user_address)
        if requirements is None:
            logger.warning("no active tab for user=%s; prompting /tab", user_address)
            response_body = {
                "error": "tab required",
                "hint": "Call POST /tab with your wallet to receive paymentRequirements.",
                "tabEndpoint": tab_endpoint,
                "paymentRequirements": template_requirements,
                "accepts": [template_requirements],
            }
            return JSONResponse(response_body, status_code=status.HTTP_402_PAYMENT_REQUIRED)

        logger.info(
            "verifying user guarantee tab=%s user=%s resource=%s",
            requirements.get("extra", {}).get("tabId"),
            user_address,
            requirements.get("resource"),
        )
        success, verify_response, failure_reason = verify_with_facilitator(
            facilitator_url, x_payment, requirements, user_address=user_address
        )
        if success:
            logger.info(
                "settling user guarantee tab=%s user=%s resource=%s",
                requirements.get("extra", {}).get("tabId"),
                user_address,
                requirements.get("resource"),
            )
            settle_ok, settle_response, settle_reason = settle_with_facilitator(
                facilitator_url, x_payment, requirements, user_address=user_address
            )
            if not settle_ok:
                logger.warning(
                    "facilitator settle failed tab=%s reason=%s",
                    requirements.get("extra", {}).get("tabId"),
                    settle_reason,
                )
                response_body = {
                    "error": "guarantee settlement failed",
                    "paymentRequirements": requirements,
                    "tabEndpoint": tab_endpoint,
                    "hint": settle_reason or "settlement rejected by facilitator",
                    "facilitatorResponse": settle_response,
                }
                return JSONResponse(
                    response_body, status_code=status.HTTP_502_BAD_GATEWAY
                )

            tab_id = requirements.get("extra", {}).get("tabId")
            certificate = None
            network_id = None
            if isinstance(settle_response, dict):
                certificate = settle_response.get("certificate")
                network_id = settle_response.get("networkId") or settle_response.get("network")

            body: JsonDict = {
                "message": "paid content",
                "guarantee": {
                    k: v
                    for k, v in {
                        "tabId": tab_id,
                        "userAddress": user_address,
                        "payTo": requirements.get("payTo"),
                        "asset": requirements.get("asset"),
                        "amount": requirements.get("maxAmountRequired"),
                        "networkId": network_id,
                        "certificate": certificate,
                    }.items()
                    if v is not None
                },
            }
            if verify_response is not None:
                body["verify"] = verify_response
            if settle_response is not None:
                body["settle"] = settle_response
            _clear_user_state(user_address)
            logger.info("guarantee settled tab=%s user=%s", tab_id, user_address)
            return JSONResponse(body)

        logger.warning(
            "facilitator verify failed tab=%s reason=%s",
            requirements.get("extra", {}).get("tabId"),
            failure_reason,
        )
        response_body = {
            "error": "guarantee verification failed",
            "paymentRequirements": requirements,
            "tabEndpoint": tab_endpoint,
            "accepts": [requirements],
        }
        if failure_reason:
            response_body["hint"] = failure_reason
        if verify_response is not None:
            response_body["facilitatorResponse"] = verify_response
        return JSONResponse(response_body, status_code=status.HTTP_402_PAYMENT_REQUIRED)

    _ = (index, issue_tab, protected_resource)
    return app


def app() -> FastAPI:
    return create_app()


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "9000"))
    uvicorn.run(create_app(), host="0.0.0.0", port=port)
