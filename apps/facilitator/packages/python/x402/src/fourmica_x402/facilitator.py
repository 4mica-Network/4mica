"""4mica facilitator client wrappers for the x402 Python SDK.

The facilitator answers ``/verify`` and ``/settle`` in x402's own shape, so the
base clients parse it as is; 4mica's additions (the guarantee receipt,
``retryable``, ``details``) arrive under ``SettleResponse.extra``.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Iterable, Optional

from x402.http import (
    FacilitatorConfig,
    HTTPFacilitatorClient,
    HTTPFacilitatorClientSync,
)
from x402.schemas import SupportedResponse

logger = logging.getLogger(__name__)

TESTNET_FACILITATOR_URL = "https://testnet.payment.4mica.io"
MAINNET_FACILITATOR_URL = "https://payment.4mica.io"
DEFAULT_FOURMICA_FACILITATOR_URL = TESTNET_FACILITATOR_URL

FACILITATOR_URLS: dict[str, str] = {
    "eip155:84532": TESTNET_FACILITATOR_URL,
    "eip155:8453": MAINNET_FACILITATOR_URL,
}
"""The hosted 4mica facilitator for each network it serves."""

FacilitatorConfigLike = FacilitatorConfig | dict[str, Any] | None


def _with_default_url(config: FacilitatorConfigLike) -> FacilitatorConfig | dict[str, Any]:
    if isinstance(config, dict):
        return {"url": config.get("url", DEFAULT_FOURMICA_FACILITATOR_URL), **config}
    config = config or FacilitatorConfig(url=DEFAULT_FOURMICA_FACILITATOR_URL)
    if config.url is None:
        config.url = DEFAULT_FOURMICA_FACILITATOR_URL
    return config


def _narrow(
    networks: Optional[frozenset[str]], fetch: Callable[[], SupportedResponse]
) -> SupportedResponse:
    """The facilitator's ``/supported`` narrowed to *networks*.

    A narrowed client that can't reach its facilitator reports no kinds rather
    than raising, so a resource server holding one hosted facilitator per
    network still starts when one of them is down; only that network's
    payments are unavailable.
    """
    if networks is None:
        return fetch()
    try:
        supported = fetch()
    except Exception as error:  # noqa: BLE001 - any transport or HTTP failure
        logger.warning(
            "4mica facilitator for %s is unreachable; payments on it are unavailable: %s",
            ", ".join(sorted(networks)),
            error,
        )
        return SupportedResponse(kinds=[])
    return supported.model_copy(
        update={"kinds": [kind for kind in supported.kinds if kind.network in networks]}
    )


class FourMicaFacilitatorClient(HTTPFacilitatorClient):
    """Async 4mica facilitator client. Defaults to the hosted Base Sepolia
    facilitator; *networks* narrows it to the networks it should serve."""

    def __init__(
        self, config: FacilitatorConfigLike = None, networks: Optional[Iterable[str]] = None
    ) -> None:
        super().__init__(_with_default_url(config))
        self._networks = frozenset(networks) if networks is not None else None

    def get_supported(self) -> SupportedResponse:
        return _narrow(self._networks, super().get_supported)


class FourMicaFacilitatorClientSync(HTTPFacilitatorClientSync):
    """Sync 4mica facilitator client. Defaults to the hosted Base Sepolia
    facilitator; *networks* narrows it to the networks it should serve."""

    def __init__(
        self, config: FacilitatorConfigLike = None, networks: Optional[Iterable[str]] = None
    ) -> None:
        super().__init__(_with_default_url(config))
        self._networks = frozenset(networks) if networks is not None else None

    def get_supported(self) -> SupportedResponse:
        return _narrow(self._networks, super().get_supported)


def hosted_facilitator_clients(networks: Iterable[str]) -> list[FourMicaFacilitatorClient]:
    """One async client per network with a hosted facilitator, each narrowed
    to its own network. A network without one is skipped."""
    return [
        FourMicaFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URLS[network]), [network])
        for network in networks
        if network in FACILITATOR_URLS
    ]


def hosted_facilitator_clients_sync(
    networks: Iterable[str],
) -> list[FourMicaFacilitatorClientSync]:
    """The sync counterpart of :func:`hosted_facilitator_clients`."""
    return [
        FourMicaFacilitatorClientSync(FacilitatorConfig(url=FACILITATOR_URLS[network]), [network])
        for network in networks
        if network in FACILITATOR_URLS
    ]
