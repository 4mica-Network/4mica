"""Hosted 4Mica network registry."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class NetworkInfo:
    """Metadata for a hosted 4Mica network deployment."""

    caip2: str
    """CAIP-2 network identifier (e.g. ``eip155:84532``)."""

    rpc_url: str
    """Hosted 4Mica core API URL for this network."""


#: Hosted 4Mica network deployments, keyed by human-readable shorthand.
#:
#: Pass the shorthand (or the CAIP-2 string) to
#: :meth:`~fourmica_sdk.ConfigBuilder.network` to select a network without
#: writing a URL.
NETWORKS: dict[str, NetworkInfo] = {
    "base": NetworkInfo(
        caip2="eip155:8453",
        rpc_url="https://base.api.4mica.xyz/",
    ),
    "base-sepolia": NetworkInfo(
        caip2="eip155:84532",
        rpc_url="https://base.sepolia.api.4mica.xyz/",
    ),
    "ethereum-sepolia": NetworkInfo(
        caip2="eip155:11155111",
        rpc_url="https://ethereum.sepolia.api.4mica.xyz/",
    ),
}

_NETWORKS_BY_CAIP2: dict[str, NetworkInfo] = {n.caip2: n for n in NETWORKS.values()}


def resolve_network_rpc_url(network: str) -> Optional[str]:
    """Return the core API URL for *network* (shorthand or CAIP-2), or ``None``."""
    info = NETWORKS.get(network) or _NETWORKS_BY_CAIP2.get(network)
    return info.rpc_url if info else None
