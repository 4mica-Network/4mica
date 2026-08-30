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

    public_rpc_url: str
    """Reliable public Ethereum RPC for on-chain calls (fallback when server doesn't provide one)."""


#: Hosted 4Mica network deployments, keyed by human-readable shorthand.
#:
#: Pass the shorthand (or the CAIP-2 string) to
#: :meth:`~fourmica_sdk.ConfigBuilder.network` to select a network without
#: writing a URL.
#:
#: Example::
#:
#:     from fourmica_sdk import ConfigBuilder, NETWORKS
#:
#:     cfg = ConfigBuilder().network("base").wallet_private_key("0x...").build()
#:
#:     print(NETWORKS["base"].caip2)    # "eip155:8453"
NETWORKS: dict[str, NetworkInfo] = {
    "base": NetworkInfo(
        caip2="eip155:8453",
        rpc_url="https://base.api.4mica.xyz/",
        public_rpc_url="https://base-rpc.publicnode.com",
    ),
    "base-sepolia": NetworkInfo(
        caip2="eip155:84532",
        rpc_url="https://base.sepolia.api.4mica.xyz/",
        public_rpc_url="https://base-sepolia-rpc.publicnode.com",
    ),
    "ethereum-sepolia": NetworkInfo(
        caip2="eip155:11155111",
        rpc_url="https://ethereum.sepolia.api.4mica.xyz/",
        public_rpc_url="https://ethereum-sepolia-rpc.publicnode.com",
    ),
}

_NETWORKS_BY_CAIP2: dict[str, NetworkInfo] = {n.caip2: n for n in NETWORKS.values()}


def resolve_network_rpc_url(network: str) -> Optional[str]:
    """Return the core API URL for *network* (shorthand or CAIP-2), or ``None``.

    Example::

        resolve_network_rpc_url("base")          # "https://base.api.4mica.xyz/"
        resolve_network_rpc_url("eip155:8453")   # "https://base.api.4mica.xyz/"
        resolve_network_rpc_url("eip155:1")      # None
    """
    info = NETWORKS.get(network) or _NETWORKS_BY_CAIP2.get(network)
    return info.rpc_url if info else None


def resolve_public_rpc_url(caip2: str) -> Optional[str]:
    """Return the reliable public Ethereum RPC URL for *caip2*, or ``None`` for unknown networks."""
    info = _NETWORKS_BY_CAIP2.get(caip2)
    return info.public_rpc_url if info else None
