"""4mica HTTP middleware wrappers for FastAPI and Flask."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from x402.http import PaywallConfig, PaywallProvider, RoutesConfig
from x402.http.middleware import fastapi as fastapi_mw
from x402.server import x402ResourceServer, x402ResourceServerSync

from .constants import SUPPORTED_NETWORKS
from .facilitator import (
    FourMicaFacilitatorClient,
    FourMicaFacilitatorClientSync,
    OpenTabError,
)
from .server_scheme import FourMicaEvmScheme


def _register_4mica_scheme(server: x402ResourceServer, tab_endpoint: str) -> None:
    scheme = FourMicaEvmScheme(tab_endpoint)
    for network in SUPPORTED_NETWORKS:
        server.register(network, scheme)


def _register_4mica_scheme_sync(server: x402ResourceServerSync, tab_endpoint: str) -> None:
    scheme = FourMicaEvmScheme(tab_endpoint)
    for network in SUPPORTED_NETWORKS:
        server.register(network, scheme)


# =========================================================================
# FastAPI wrappers (async)
# =========================================================================


def fastapi_payment_middleware_from_config(
    routes: RoutesConfig,
    tab_endpoint: str,
    facilitator_client: Any | None = None,
    paywall_config: PaywallConfig | None = None,
    paywall_provider: PaywallProvider | None = None,
    sync_facilitator_on_start: bool = True,
    ttl_seconds: int | None = None,
):
    facilitators: list[Any] = []
    if facilitator_client is not None:
        facilitators = (
            facilitator_client if isinstance(facilitator_client, list) else [facilitator_client]
        )

    fourmica_facilitator = next(
        (f for f in facilitators if isinstance(f, FourMicaFacilitatorClient)), None
    )
    if fourmica_facilitator is None:
        fourmica_facilitator = FourMicaFacilitatorClient()
        facilitators.append(fourmica_facilitator)

    server = x402ResourceServer(facilitators)
    _register_4mica_scheme(server, tab_endpoint)

    inner = fastapi_mw.payment_middleware(
        routes,
        server,
        paywall_config,
        paywall_provider,
        sync_facilitator_on_start,
    )

    advertised_path = urlparse(tab_endpoint).path

    async def middleware(request, call_next):
        if request.url.path == advertised_path:
            body = await request.json()
            user_address = body.get("userAddress")
            payment_requirements = body.get("paymentRequirements")
            x402_version = body.get("x402Version")
            try:
                resp = await fourmica_facilitator.open_tab(
                    user_address,
                    payment_requirements,
                    ttl_seconds=ttl_seconds,
                    guarantee_version=x402_version,
                )
                return fastapi_mw.JSONResponse(content=resp.__dict__)
            except OpenTabError as err:
                return fastapi_mw.JSONResponse(
                    content=getattr(err, "response", {"error": str(err)}).__dict__
                    if hasattr(getattr(err, "response", None), "__dict__")
                    else {"error": str(err)},
                    status_code=err.status,
                )
            except Exception as exc:
                return fastapi_mw.JSONResponse(
                    content={"error": "Failed to open tab", "details": str(exc)},
                    status_code=500,
                )

        return await inner(request, call_next)

    return middleware


# =========================================================================
# Flask wrappers (sync)
# =========================================================================


def flask_payment_middleware_from_config(
    app,
    routes: RoutesConfig,
    tab_endpoint: str,
    facilitator_client: Any | None = None,
    paywall_config: PaywallConfig | None = None,
    paywall_provider: PaywallProvider | None = None,
    sync_facilitator_on_start: bool = True,
    ttl_seconds: int | None = None,
):
    from x402.http.middleware import flask as flask_mw

    facilitators: list[Any] = []
    if facilitator_client is not None:
        facilitators = (
            facilitator_client if isinstance(facilitator_client, list) else [facilitator_client]
        )

    fourmica_facilitator = next(
        (f for f in facilitators if isinstance(f, FourMicaFacilitatorClientSync)), None
    )
    if fourmica_facilitator is None:
        fourmica_facilitator = FourMicaFacilitatorClientSync()
        facilitators.append(fourmica_facilitator)

    server = x402ResourceServerSync(facilitators)
    _register_4mica_scheme_sync(server, tab_endpoint)

    # Register tab endpoint route
    from flask import jsonify, request

    advertised_path = urlparse(tab_endpoint).path

    def open_tab_handler():
        body = request.get_json(silent=True) or {}
        user_address = body.get("userAddress")
        payment_requirements = body.get("paymentRequirements")
        x402_version = body.get("x402Version")
        try:
            resp = fourmica_facilitator.open_tab(
                user_address,
                payment_requirements,
                ttl_seconds=ttl_seconds,
                guarantee_version=x402_version,
            )
            return jsonify(resp.__dict__)
        except OpenTabError as err:
            response = getattr(err, "response", {"error": str(err)})
            if hasattr(response, "__dict__"):
                response = response.__dict__
            return jsonify(response), err.status
        except Exception as exc:
            return jsonify({"error": "Failed to open tab", "details": str(exc)}), 500

    app.add_url_rule(advertised_path, "x402_open_tab", open_tab_handler, methods=["POST"])

    return flask_mw.payment_middleware(
        app,
        routes,
        server,
        paywall_config,
        paywall_provider,
        sync_facilitator_on_start,
    )
