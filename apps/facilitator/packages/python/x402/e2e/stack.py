"""Helpers for running against the stack ``apps/facilitator/packages/e2e/stack.sh``
brings up. Run the tests through it: it writes the ``E2E_*`` variables read here."""

from __future__ import annotations

import asyncio
import inspect
import os
import socket
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Optional

import requests
import uvicorn
from fastapi import FastAPI
from fourmica_sdk import Client, ConfigBuilder
from x402 import x402ClientSync
from x402.http import FacilitatorConfig, decode_payment_response_header
from x402.http.clients import x402_requests
from x402.schemas import SettleResponse

from fourmica_x402.client_scheme import FourMicaEvmScheme
from fourmica_x402.facilitator import FourMicaFacilitatorClient
from fourmica_x402.http import fastapi_payment_middleware_from_config


@dataclass(frozen=True)
class Stack:
    core_url: str
    facilitator_url: str
    network: str
    asset: str
    pay_to: str
    payer_key: str
    max_uncheckpointed: int

    def buyer(self, key: str) -> requests.Session:
        """A session that pays 402s through x402 with the 4mica scheme."""
        client = x402ClientSync()
        # Native ETH has no USD price for spend controls to cap.
        client.set_spend_controls(False)
        client.register(
            self.network, FourMicaEvmScheme(key, core_urls={self.network: self.core_url})
        )
        return x402_requests(client)

    def on_core(self, key: str, read: Callable[[Client], Any]) -> Any:
        """``read`` run against a fresh SDK client for ``key``, to see what core recorded."""

        async def run() -> Any:
            cfg = ConfigBuilder().wallet_private_key(key).rpc_url(self.core_url).build()
            client = await Client.connect(cfg)
            try:
                result = read(client)
                return await result if inspect.isawaitable(result) else result
            finally:
                await client.aclose()

        return asyncio.run(run())

    def await_next_cycle(self, key: str) -> None:
        """Waits for the next settlement cycle to open, so the payments that
        follow are the payer's only ones in it."""
        cycle = self.on_core(key, lambda client: client.payment.active_cycle(self.asset))
        time.sleep(cycle.period_end - cycle.server_time + 1)


def settlement_of(response: requests.Response) -> Optional[SettleResponse]:
    """The settlement a paid response carries in ``PAYMENT-RESPONSE``, if any."""
    header = response.headers.get("PAYMENT-RESPONSE")
    return decode_payment_response_header(header) if header else None


def read_stack() -> Stack:
    names = [
        "E2E_CORE_URL",
        "E2E_FACILITATOR_URL",
        "E2E_NETWORK",
        "E2E_ASSET",
        "E2E_PAY_TO",
        "E2E_PY_PAYER_KEY",
        "E2E_MAX_UNCHECKPOINTED",
    ]
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            f"missing {', '.join(missing)}; run the e2e tests through "
            "apps/facilitator/packages/e2e/stack.sh test"
        )
    env = os.environ
    return Stack(
        core_url=env["E2E_CORE_URL"],
        facilitator_url=env["E2E_FACILITATOR_URL"],
        network=env["E2E_NETWORK"],
        asset=env["E2E_ASSET"],
        pay_to=env["E2E_PAY_TO"],
        payer_key=env["E2E_PY_PAYER_KEY"],
        max_uncheckpointed=int(env["E2E_MAX_UNCHECKPOINTED"]),
    )


@contextmanager
def running_seller(stack: Stack) -> Iterator[str]:
    """URL of a paywalled ``GET /paid`` costing one wei of ``stack.asset``, on
    the 4mica FastAPI middleware."""
    routes = {
        "GET /paid": {
            "accepts": {
                "scheme": "4mica-credit",
                "price": {"amount": "1", "asset": stack.asset},
                "network": stack.network,
                "payTo": stack.pay_to,
            }
        }
    }
    middleware = fastapi_payment_middleware_from_config(
        routes,
        facilitator_client=FourMicaFacilitatorClient(FacilitatorConfig(url=stack.facilitator_url)),
    )

    app = FastAPI()

    @app.middleware("http")
    async def x402_middleware(request, call_next):
        return await middleware(request, call_next)

    @app.get("/paid")
    async def paid():
        return {"paid": True}

    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.05)

    yield f"http://127.0.0.1:{port}/paid"

    server.should_exit = True
    thread.join()
