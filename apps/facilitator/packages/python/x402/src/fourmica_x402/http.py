"""4mica HTTP middleware wrappers for FastAPI and Flask.

There is no tab endpoint to register any more: the 2.0 protocol has clients
sign their claims straight from the 402 requirements, so these wrappers only
register the ``4mica-credit`` scheme and hand off to x402's own middleware.
"""

from __future__ import annotations

from typing import Any, Mapping

from x402.http import PaywallConfig, PaywallProvider, RoutesConfig
from x402.http.middleware import fastapi as fastapi_mw
from x402.server import x402ResourceServer, x402ResourceServerSync

from .constants import SUPPORTED_NETWORKS
from .facilitator import FourMicaFacilitatorClient, FourMicaFacilitatorClientSync
from .server_scheme import FourMicaEvmScheme


def _register_4mica_scheme(
    server: x402ResourceServer | x402ResourceServerSync,
    schemes: Mapping[str, Any] | None,
) -> None:
    """Register the caller's schemes, then the default 4mica scheme for each
    supported network the caller left alone, such as a `FourMicaEvmScheme`
    pointed at a self-hosted core or priced in USDT."""
    for network, scheme in (schemes or {}).items():
        server.register(network, scheme)
    default = FourMicaEvmScheme()
    for network in SUPPORTED_NETWORKS:
        if not server.has_registered_scheme(network, default.scheme):
            server.register(network, default)


# =========================================================================
# FastAPI wrappers (async)
# =========================================================================


def fastapi_payment_middleware_from_config(
    routes: RoutesConfig,
    facilitator_client: Any | None = None,
    paywall_config: PaywallConfig | None = None,
    paywall_provider: PaywallProvider | None = None,
    sync_facilitator_on_start: bool = True,
    schemes: Mapping[str, Any] | None = None,
):
    facilitators: list[Any] = []
    if facilitator_client is not None:
        facilitators = (
            facilitator_client if isinstance(facilitator_client, list) else [facilitator_client]
        )

    if not any(isinstance(f, FourMicaFacilitatorClient) for f in facilitators):
        facilitators.append(FourMicaFacilitatorClient())

    server = x402ResourceServer(facilitators)
    _register_4mica_scheme(server, schemes)

    return fastapi_mw.payment_middleware(
        routes,
        server,
        paywall_config,
        paywall_provider,
        sync_facilitator_on_start,
    )


# =========================================================================
# Flask wrappers (sync)
# =========================================================================


def flask_payment_middleware_from_config(
    app,
    routes: RoutesConfig,
    facilitator_client: Any | None = None,
    paywall_config: PaywallConfig | None = None,
    paywall_provider: PaywallProvider | None = None,
    sync_facilitator_on_start: bool = True,
    schemes: Mapping[str, Any] | None = None,
):
    from x402.http.middleware import flask as flask_mw

    facilitators: list[Any] = []
    if facilitator_client is not None:
        facilitators = (
            facilitator_client if isinstance(facilitator_client, list) else [facilitator_client]
        )

    if not any(isinstance(f, FourMicaFacilitatorClientSync) for f in facilitators):
        facilitators.append(FourMicaFacilitatorClientSync())

    server = x402ResourceServerSync(facilitators)
    _register_4mica_scheme(server, schemes)

    return flask_mw.payment_middleware(
        app,
        routes,
        server,
        paywall_config,
        paywall_provider,
        sync_facilitator_on_start,
    )
