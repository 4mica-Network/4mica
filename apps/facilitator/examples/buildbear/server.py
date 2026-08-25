#!/usr/bin/env python3
"""FastAPI resource server for a paid AI NFT endpoint using x402 + 4mica facilitator."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import random
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from eth_account import Account
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("buildbear.server")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


DEFAULT_USDC = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582"
DEFAULT_NETWORK = "eip155:80002"  # Polygon Amoy
DEFAULT_FACILITATOR_URL = "https://x402.4mica.xyz"
DEFAULT_PRICE_USDC = "5000"  # 0.005 USDC with 6 decimals


def _env(name: str, default: Optional[str] = None) -> str:
    value = os.getenv(name, default)
    if value is None:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _resolve_recipient_address() -> str:
    address = os.getenv("RECIPIENT_ADDRESS")
    if address:
        return address
    key = os.getenv("RECIPIENT_KEY")
    if key:
        return Account.from_key(key).address
    raise RuntimeError("Set RECIPIENT_ADDRESS (or RECIPIENT_KEY) in .env")


def _normalize_url(url: str) -> str:
    if not url:
        return url
    if "://" not in url:
        return f"http://{url}"
    return url


def _tab_endpoint_url() -> str:
    base = _env("SERVER_URL", "http://localhost:8402").rstrip("/")
    return f"{base}/tab"


RECIPIENT_ADDRESS = _resolve_recipient_address()
USDC_ADDRESS = _env("USDC_ADDRESS", DEFAULT_USDC)
X402_NETWORK = _env("X402_NETWORK", DEFAULT_NETWORK)
FACILITATOR_URL = _normalize_url(_env("FACILITATOR_URL", DEFAULT_FACILITATOR_URL))
PRICE_USDC = int(_env("PRICE_USDC", DEFAULT_PRICE_USDC))


class TabRequest(BaseModel):
    userAddress: str
    paymentRequirements: Optional[Dict[str, Any]] = None
    x402Version: Optional[int] = None


class MinionGenerator:
    def __init__(self) -> None:
        self._openai_key = os.getenv("OPENAI_API_KEY")
        self._openai_model = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
        self._client = None
        if self._openai_key:
            try:
                from openai import OpenAI

                self._client = OpenAI(api_key=self._openai_key)
            except Exception as exc:
                logger.warning("OpenAI client unavailable, using placeholder: %s", exc)
                self._client = None

    async def generate(self) -> tuple[str, Dict[str, str]]:
        traits = {
            "Body": random.choice(["yellow", "blue", "purple"]),
            "Eyes": random.choice(["brown", "red", "green"]),
            "Goggles": random.choice(["silver", "gold", "black"]),
            "Hair": random.choice(["mohawk", "bald", "spiky"]),
            "Accessory": random.choice(["crown", "banana", "none"]),
        }

        if self._client is None:
            # 1x1 PNG placeholder
            return (
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9nKxkAAAAASUVORK5CYII=",
                traits,
            )

        prompt = (
            "Pixel art minion NFT, clean background, cute, small "
            "collectible style, 1:1 aspect ratio"
        )

        def _call_openai() -> str:
            response = self._client.images.generate(
                model=self._openai_model,
                prompt=prompt,
                size="1024x1024",
                response_format="b64_json",
            )
            return response.data[0].b64_json

        try:
            image_b64 = await asyncio.to_thread(_call_openai)
            return image_b64, traits
        except Exception as exc:
            logger.warning("OpenAI image generation failed, using placeholder: %s", exc)
            # Disable OpenAI client after failure to avoid repeated errors.
            self._client = None
            return (
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9nKxkAAAAASUVORK5CYII=",
                traits,
            )


def _payment_requirements_template() -> Dict[str, Any]:
    return {
        "scheme": "4mica-credit",
        "network": X402_NETWORK,
        "maxAmountRequired": str(PRICE_USDC),
        "asset": USDC_ADDRESS,
        "payTo": RECIPIENT_ADDRESS,
        "description": "DALL-E minion NFT",
        "resource": "minion-nft",
        "extra": {
            "tabEndpoint": _tab_endpoint_url(),
        },
    }


def _decode_payment_header(header: str) -> Dict[str, Any]:
    try:
        decoded = base64.b64decode(header).decode("utf-8")
        payload = json.loads(decoded)
    except Exception as exc:
        raise ValueError(f"Invalid X-PAYMENT header: {exc}") from exc
    return payload


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=10)
    app.state.requirements_by_tab = {}
    logger.info("Recipient ready: %s", RECIPIENT_ADDRESS)
    yield
    await app.state.http.aclose()


app = FastAPI(lifespan=lifespan)


generator = MinionGenerator()


async def _open_tab(user_address: str, x402_version: Optional[int]) -> Dict[str, Any]:
    payload = {
        "userAddress": user_address,
        "recipientAddress": RECIPIENT_ADDRESS,
        "erc20Token": USDC_ADDRESS,
        "network": X402_NETWORK,
        "ttlSeconds": 3600,
        "x402Version": x402_version or 1,
    }
    url = f"{FACILITATOR_URL.rstrip('/')}/tabs"
    response = await app.state.http.post(url, json=payload)
    response.raise_for_status()
    return response.json()


async def _verify_with_facilitator(
    payment_payload: Dict[str, Any],
    payment_requirements: Dict[str, Any],
) -> Dict[str, Any]:
    url = f"{FACILITATOR_URL.rstrip('/')}/verify"
    payload = {
        "x402Version": payment_payload.get("x402Version", 1),
        "paymentPayload": payment_payload,
        "paymentRequirements": payment_requirements,
    }
    response = await app.state.http.post(url, json=payload)
    response.raise_for_status()
    return response.json()


async def _settle_with_facilitator(
    payment_payload: Dict[str, Any],
    payment_requirements: Dict[str, Any],
) -> Dict[str, Any]:
    url = f"{FACILITATOR_URL.rstrip('/')}/settle"
    payload = {
        "x402Version": payment_payload.get("x402Version", 1),
        "paymentPayload": payment_payload,
        "paymentRequirements": payment_requirements,
    }
    response = await app.state.http.post(url, json=payload)
    response.raise_for_status()
    return response.json()


@app.post("/tab")
async def create_tab(request: TabRequest) -> JSONResponse:
    tab = await _open_tab(request.userAddress, request.x402Version)
    requirements = _payment_requirements_template()
    extra = requirements.get("extra", {})
    extra.update(
        {
            "tabId": tab.get("tabId"),
            "nextReqId": tab.get("nextReqId"),
            "startTimestamp": str(tab.get("startTimestamp", int(time.time()))),
        }
    )
    requirements["extra"] = extra

    tab_id = extra.get("tabId")
    if tab_id:
        app.state.requirements_by_tab[str(tab_id)] = requirements

    body = {
        "tabId": tab_id,
        "userAddress": request.userAddress,
        "nextReqId": tab.get("nextReqId"),
        "paymentRequirements": requirements,
    }
    return JSONResponse(body)


@app.get("/image")
async def get_image(request: Request) -> JSONResponse:
    x_payment = request.headers.get("X-PAYMENT")
    if not x_payment:
        return JSONResponse(
            status_code=402,
            content={
                "error": "Payment Required",
                "paymentRequirements": _payment_requirements_template(),
            },
        )

    try:
        payment_payload = _decode_payment_header(x_payment)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    tab_id = (
        payment_payload.get("payload", {})
        .get("claims", {})
        .get("tab_id")
    )
    if not tab_id:
        return JSONResponse(status_code=400, content={"error": "Missing tab_id in payment"})

    requirements = app.state.requirements_by_tab.get(str(tab_id))
    if requirements is None:
        return JSONResponse(
            status_code=400,
            content={"error": "Unknown tab. Call /tab before paying."},
        )

    try:
        verify = await _verify_with_facilitator(payment_payload, requirements)
    except httpx.HTTPError as exc:
        return JSONResponse(status_code=502, content={"error": f"verify failed: {exc}"})

    if not verify.get("isValid"):
        return JSONResponse(
            status_code=402,
            content={"error": verify.get("invalidReason", "Invalid payment")},
        )

    try:
        settlement = await _settle_with_facilitator(payment_payload, requirements)
    except httpx.HTTPError as exc:
        return JSONResponse(status_code=502, content={"error": f"settle failed: {exc}"})

    if not settlement.get("success"):
        return JSONResponse(
            status_code=402,
            content={"error": settlement.get("error", "Settlement failed")},
        )

    image_b64, traits = await generator.generate()
    return JSONResponse(
        {
            "image": image_b64,
            "traits": traits,
            "settlement": settlement.get("certificate"),
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8402, reload=False)
