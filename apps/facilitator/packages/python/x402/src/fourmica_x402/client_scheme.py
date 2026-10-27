"""Client-side 4mica scheme implementations for x402."""

from __future__ import annotations

import asyncio
import os
import ssl
import threading
from concurrent.futures import Future
from typing import Any, Dict, Mapping, NamedTuple, Optional

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
from x402.schemas import (
    PaymentRequirements,
    PaymentResponseContext,
    RecoveredResponseResult,
)
from x402.schemas.v1 import PaymentRequirementsV1

from .constants import DEFAULT_RPC_URLS, SUPPORTED_NETWORKS
from .recovery import RecoveringPayer, recover_refused_payment


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


class _Payer(NamedTuple):
    """A connected core: the flow that signs for it and the client behind it."""

    flow: X402Flow
    payment: RecoveringPayer


class FourMicaEvmScheme(SchemeNetworkClient, SchemeNetworkClientV1):
    """Client-side scheme for 4mica credit payments (v1 and v2)."""

    scheme = "4mica-credit"

    def __init__(self, private_key: str, core_urls: Optional[Mapping[str, str]] = None) -> None:
        """*core_urls* maps a network to the core API URL to pay on, overriding
        the hosted deployment; set an entry to pay on a self-hosted core."""
        self._private_key = private_key
        self._core_urls = dict(core_urls or {})
        self._payers: Dict[str, _Payer] = {}
        # When the facilitator refuses a payment for something the payer can
        # fix (a checkpoint core wants, a stale cycle or clock, a checkpoint
        # cutoff), fix it and have x402 retry the request once with a freshly
        # signed payment. Sync, so both x402Client and x402ClientSync run it.
        self.scheme_hooks = {"on_payment_response": self._on_payment_response}

    async def _connect(self, rpc_url: str) -> _Payer:
        _ensure_ssl_certs()
        _patch_web3_ssl_context()
        cfg = (
            ConfigBuilder()
            .wallet_private_key(self._private_key)
            .rpc_url(rpc_url)
            .from_env()
            .build()
        )
        client = await FourMicaClient.connect(cfg)
        return _Payer(flow=X402Flow.from_client(client), payment=client.payment)

    async def _get_payer_async(self, rpc_url: str) -> _Payer:
        if rpc_url in self._payers:
            return self._payers[rpc_url]
        payer = await self._connect(rpc_url)
        self._payers[rpc_url] = payer
        return payer

    def _get_flow(self, rpc_url: str) -> X402Flow:
        return _run_async(self._get_payer_async(rpc_url)).flow

    def _on_payment_response(
        self, ctx: PaymentResponseContext
    ) -> Optional[RecoveredResponseResult]:
        refusal = ctx.settle_response
        if refusal is None or refusal.success:
            return None
        payer = self._payers.get(self._rpc_url_for(ctx.requirements) or "")
        if payer is None:
            return None
        try:
            recovered = _run_async(
                recover_refused_payment(
                    payer.payment,
                    str(ctx.requirements.asset),
                    refusal.error_reason,
                    refusal.extra,
                )
            )
        except Exception:
            # The caller still gets the refusal, which names what to fix.
            return None
        return RecoveredResponseResult() if recovered else None

    def create_payment_payload(self, requirements: Any) -> dict[str, Any]:
        if hasattr(requirements, "max_amount_required"):
            return self._create_payment_payload_v1(requirements)
        return self._create_payment_payload_v2(requirements)

    def _create_payment_payload_v2(self, requirements: PaymentRequirements) -> dict[str, Any]:
        flow = self._get_flow(self._require_rpc_url(requirements))
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

        signed = _run_async(flow.sign_payment_v2(payment_required, accepted))
        return signed.payload.to_payload()

    def _create_payment_payload_v1(self, requirements: PaymentRequirementsV1) -> dict[str, Any]:
        flow = self._get_flow(self._require_rpc_url(requirements))
        req_v1 = SDKPaymentRequirementsV1.from_raw(
            requirements.model_dump(by_alias=True, exclude_none=True)
        )
        signed = _run_async(flow.sign_payment(req_v1))
        return signed.payload.to_payload()

    def _core_url(self, network: str) -> Optional[str]:
        return self._core_urls.get(network) or DEFAULT_RPC_URLS.get(network)

    def _rpc_url_for(self, requirements: Any) -> Optional[str]:
        """The core that signs *requirements*: the one the seller names in
        ``extra.rpcUrl``, then the payer's own override, then the hosted
        deployment for the network."""
        rpc_url = requirements.extra.get("rpcUrl") if requirements.extra else None
        return rpc_url or self._core_url(str(requirements.network))

    def _require_rpc_url(self, requirements: Any) -> str:
        rpc_url = self._rpc_url_for(requirements)
        if not rpc_url:
            raise ValueError(f"No RPC URL configured for network {requirements.network}")
        return rpc_url


def create_default_client_scheme(
    private_key: str, core_urls: Optional[Mapping[str, str]] = None
) -> FourMicaEvmScheme:
    """A scheme connected up front to every hosted network and to each network
    in *core_urls*."""
    scheme = FourMicaEvmScheme(private_key, core_urls)
    for network in dict.fromkeys([*SUPPORTED_NETWORKS, *(core_urls or {})]):
        rpc_url = scheme._core_url(network)
        if rpc_url:
            scheme._get_flow(rpc_url)
    return scheme


FourMicaEvmClientScheme = FourMicaEvmScheme
