from __future__ import annotations

from typing import cast

from ..errors import InvalidParamsError
from ..networks import resolve_network
from .models import AppNetwork

_APP_NETWORKS = frozenset({"BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"})


def to_app_network(network: str) -> AppNetwork:
    """``BASE_SEPOLIA`` from that name, a shorthand (``base-sepolia``) or
    CAIP-2 (``eip155:84532``)."""
    value = network.strip()
    if value.upper() in _APP_NETWORKS:
        return cast(AppNetwork, value.upper())
    resolved = resolve_network(value)
    if resolved is not None:
        return cast(AppNetwork, resolved[0].upper().replace("-", "_"))
    raise InvalidParamsError(f"unknown network: {network}")


def from_app_network(network: str) -> str:
    """The shorthand (``base-sepolia``) for an app API network name."""
    return to_app_network(network).lower().replace("_", "-")
