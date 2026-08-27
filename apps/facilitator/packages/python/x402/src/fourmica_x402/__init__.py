"""4mica x402 integration package (Python)."""

from __future__ import annotations

from .constants import (
    DEFAULT_ASSETS,
    DEFAULT_RPC_URLS,
    SUPPORTED_NETWORKS,
    UnsupportedNetworkError,
    get_default_asset,
)

__all__ = [
    "SUPPORTED_NETWORKS",
    "DEFAULT_RPC_URLS",
    "DEFAULT_ASSETS",
    "UnsupportedNetworkError",
    "get_default_asset",
]

try:  # Optional: facilitator depends on x402
    from .facilitator import (
        FourMicaFacilitatorClient,
        FourMicaFacilitatorClientSync,
        OpenTabError,
        OpenTabResponse,
    )

    __all__.extend(
        [
            "FourMicaFacilitatorClient",
            "FourMicaFacilitatorClientSync",
            "OpenTabError",
            "OpenTabResponse",
        ]
    )
except Exception:
    FourMicaFacilitatorClient = None  # type: ignore[assignment]
    FourMicaFacilitatorClientSync = None  # type: ignore[assignment]
    OpenTabError = None  # type: ignore[assignment]
    OpenTabResponse = None  # type: ignore[assignment]

try:  # Optional: server scheme depends on x402
    from .server_scheme import FourMicaEvmScheme

    __all__.append("FourMicaEvmScheme")
except Exception:
    FourMicaEvmScheme = None  # type: ignore[assignment]


try:  # Optional: client scheme depends on sdk-4mica + eth_account
    from .client_scheme import FourMicaEvmScheme as FourMicaEvmClientScheme
    from .client_scheme import create_default_client_scheme

    __all__.extend(["FourMicaEvmClientScheme", "create_default_client_scheme"])
except Exception:
    FourMicaEvmClientScheme = None  # type: ignore[assignment]
    create_default_client_scheme = None  # type: ignore[assignment]

try:  # Optional: HTTP wrappers depend on x402 + fastapi/flask
    from .http import (
        fastapi_payment_middleware_from_config,
        flask_payment_middleware_from_config,
    )

    __all__.extend(
        [
            "fastapi_payment_middleware_from_config",
            "flask_payment_middleware_from_config",
        ]
    )
except Exception:
    fastapi_payment_middleware_from_config = None  # type: ignore[assignment]
    flask_payment_middleware_from_config = None  # type: ignore[assignment]

try:  # Optional: re-export core x402 types if available
    from x402.schemas import (  # noqa: F401
        PaymentPayload,
        PaymentRequired,
        PaymentRequirements,
    )
    from x402.schemas.v1 import (  # noqa: F401
        PaymentPayloadV1,
        PaymentRequiredV1,
        PaymentRequirementsV1,
    )

    __all__.extend(
        [
            "PaymentPayload",
            "PaymentRequirements",
            "PaymentRequired",
            "PaymentPayloadV1",
            "PaymentRequirementsV1",
            "PaymentRequiredV1",
        ]
    )
except Exception:
    pass
