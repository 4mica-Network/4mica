"""4mica facilitator client wrappers for the x402 Python SDK.

The facilitator answers ``/verify`` and ``/settle`` in x402's own shape, so the
base clients parse it as is; 4mica's additions (the guarantee receipt,
``retryable``, ``details``) arrive under ``SettleResponse.extra``.
"""

from __future__ import annotations

from typing import Any

from x402.http import (
    FacilitatorConfig,
    HTTPFacilitatorClient,
    HTTPFacilitatorClientSync,
)

DEFAULT_FOURMICA_FACILITATOR_URL = "https://testnet.payment.4mica.io"


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
