"""Client-side 4mica scheme implementations for x402."""

from __future__ import annotations

import asyncio
import os
import ssl
import threading
from concurrent.futures import Future
from typing import Any, Dict, Optional

from eth_account import Account
from fourmica_sdk import (
    Client as FourMicaClient,
)
from fourmica_sdk import (
    ConfigBuilder,
    X402Flow,
    X402PaymentRequired,
    X402ResourceInfo,
)
from fourmica_sdk import (
    PaymentRequirementsV1 as SDKPaymentRequirementsV1,
)
from fourmica_sdk import (
    PaymentRequirementsV2 as SDKPaymentRequirementsV2,
)
from x402.interfaces import SchemeNetworkClient, SchemeNetworkClientV1
from x402.schemas import PaymentRequirements
from x402.schemas.v1 import PaymentRequirementsV1

from .constants import DEFAULT_RPC_URLS, SUPPORTED_NETWORKS


class _AsyncRunner:
    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._ready = threading.Event()

    def _ensure_thread(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        def _run_loop() -> None:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._loop = loop
            self._ready.set()
            loop.run_forever()

        self._ready.clear()
        thread = threading.Thread(target=_run_loop, name="fourmica-async", daemon=True)
        thread.start()
        self._thread = thread
        self._ready.wait()

    def run(self, coro):
        self._ensure_thread()
        loop = self._loop
        if loop is None:
            raise RuntimeError("async runner loop not initialized")
        future: Future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result()


_ASYNC_RUNNER = _AsyncRunner()


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _ASYNC_RUNNER.run(coro)
    return _ASYNC_RUNNER.run(coro)


def _ensure_ssl_certs() -> None:
    if os.getenv("SSL_CERT_FILE") or os.getenv("REQUESTS_CA_BUNDLE"):
        return
    try:
        import certifi

        cert_path = certifi.where()
        os.environ["SSL_CERT_FILE"] = cert_path
        os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_path)
    except Exception:
        # Fall back to system certs when certifi isn't available.
        return


def _patch_web3_ssl_context() -> None:
    if os.getenv("FOURMICA_DISABLE_WEB3_SSL_PATCH"):
        return
    try:
        import certifi
        from fourmica_sdk import contract as sdk_contract
    except Exception:
        return

    provider = getattr(sdk_contract, "AsyncHTTPProvider", None)
    if provider is None or getattr(provider, "_fourmica_ssl_patched", False):
        return

    # Ensure aiohttp/web3 uses a CA bundle even when Python lacks system certs.
    original_init = provider.__init__

    def _ensure_request_kwargs(request_kwargs: Optional[dict]) -> dict:
        if request_kwargs is None:
            request_kwargs = {}
        if "ssl" not in request_kwargs:
            request_kwargs = dict(request_kwargs)
            cafile = os.getenv("SSL_CERT_FILE") or certifi.where()
            request_kwargs["ssl"] = ssl.create_default_context(cafile=cafile)
        return request_kwargs

    def _patched_init(
        self,
        endpoint_uri=None,
        request_kwargs=None,
        exception_retry_configuration=None,
        **kwargs,
    ):
        return original_init(
            self,
            endpoint_uri=endpoint_uri,
            request_kwargs=_ensure_request_kwargs(request_kwargs),
            exception_retry_configuration=exception_retry_configuration,
            **kwargs,
        )

    provider.__init__ = _patched_init  # type: ignore[assignment]
    provider._fourmica_ssl_patched = True  # type: ignore[attr-defined]


class FourMicaEvmScheme(SchemeNetworkClient, SchemeNetworkClientV1):
    """Client-side scheme for 4mica credit payments (v1 and v2)."""

    scheme = "4mica-credit"

    def __init__(self, private_key: str) -> None:
        self._private_key = private_key
        self._user_address = Account.from_key(private_key).address
        self._flows: Dict[str, X402Flow] = {}

    async def _create_flow(self, rpc_url: str) -> X402Flow:
        _ensure_ssl_certs()
        _patch_web3_ssl_context()
        cfg = (
            ConfigBuilder()
            .wallet_private_key(self._private_key)
            .rpc_url(rpc_url)
            .from_env()
            .build()
        )
        client = await FourMicaClient.new(cfg)
        return X402Flow.from_client(client)

    async def _get_flow_async(self, rpc_url: str) -> X402Flow:
        if rpc_url in self._flows:
            return self._flows[rpc_url]
        flow = await self._create_flow(rpc_url)
        self._flows[rpc_url] = flow
        return flow

    def _get_flow(self, rpc_url: str) -> X402Flow:
        return _run_async(self._get_flow_async(rpc_url))

    def create_payment_payload(self, requirements: Any) -> dict[str, Any]:
        if hasattr(requirements, "max_amount_required"):
            return self._create_payment_payload_v1(requirements)
        return self._create_payment_payload_v2(requirements)

    def _create_payment_payload_v2(self, requirements: PaymentRequirements) -> dict[str, Any]:
        network = str(requirements.network)
        rpc_url = requirements.extra.get("rpcUrl") if requirements.extra else None
        if not rpc_url:
            rpc_url = DEFAULT_RPC_URLS.get(network)
        if not rpc_url:
            raise ValueError(f"No RPC URL configured for network {network}")

        flow = self._get_flow(rpc_url)
        accepted = SDKPaymentRequirementsV2.from_raw(
            requirements.model_dump(by_alias=True, exclude_none=True)
        )

        resource_payload = None
        if requirements.extra:
            resource_payload = requirements.extra.get("resource")
        if not isinstance(resource_payload, dict):
            resource_payload = {}

        resource = X402ResourceInfo(
            url=str(resource_payload.get("url") or ""),
            description=str(resource_payload.get("description") or ""),
            mime_type=str(resource_payload.get("mimeType") or ""),
        )
        payment_required = X402PaymentRequired(
            x402_version=2,
            resource=resource,
            accepts=[accepted],
        )

        signed = _run_async(flow.sign_payment_v2(payment_required, accepted, self._user_address))
        return signed.payload

    def _create_payment_payload_v1(self, requirements: PaymentRequirementsV1) -> dict[str, Any]:
        network = str(requirements.network)
        rpc_url = requirements.extra.get("rpcUrl") if requirements.extra else None
        if not rpc_url:
            rpc_url = DEFAULT_RPC_URLS.get(network)
        if not rpc_url:
            raise ValueError(f"No RPC URL configured for network {network}")

        flow = self._get_flow(rpc_url)
        req_v1 = SDKPaymentRequirementsV1.from_raw(
            requirements.model_dump(by_alias=True, exclude_none=True)
        )
        signed = _run_async(flow.sign_payment(req_v1, self._user_address))
        return signed.payload


def create_default_client_scheme(private_key: str) -> FourMicaEvmScheme:
    scheme = FourMicaEvmScheme(private_key)
    for network in SUPPORTED_NETWORKS:
        rpc_url = DEFAULT_RPC_URLS.get(network)
        if rpc_url:
            scheme._get_flow(rpc_url)
    return scheme


FourMicaEvmClientScheme = FourMicaEvmScheme
