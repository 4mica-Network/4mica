"""Hosted 4Mica network registry.

A copy of the monorepo's ``packages/sdk/networks.json``, kept here so the
package has no build-time dependency on it; ``tests/test_networks_drift.py``
fails when the two disagree.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from .errors import InvalidParamsError


@dataclass(frozen=True)
class NetworkInfo:
    """Metadata for a hosted 4Mica network deployment."""

    caip2: str
    """CAIP-2 network identifier (e.g. ``eip155:84532``)."""

    rpc_url: str
    """Hosted 4Mica core API URL for this network."""

    chain_id: int = 0
    label: str = ""
    facilitator_url: Optional[str] = None
    """``None`` where no facilitator is hosted; everything is then self-funded."""
    explorer_url: str = ""
    native_symbol: str = "ETH"
    testnet: bool = False


#: Hosted 4Mica network deployments, keyed by human-readable shorthand.
#:
#: Pass the shorthand (or the CAIP-2 string) to
#: :meth:`~fourmica_sdk.ConfigBuilder.network` to select a network without
#: writing a URL.
NETWORKS: dict[str, NetworkInfo] = {
    "base": NetworkInfo(
        caip2="eip155:8453",
        chain_id=8453,
        label="Base",
        rpc_url="https://base.api.4mica.io/",
        facilitator_url=None,
        explorer_url="https://basescan.org",
        native_symbol="ETH",
        testnet=False,
    ),
    "base-sepolia": NetworkInfo(
        caip2="eip155:84532",
        chain_id=84532,
        label="Base Sepolia",
        rpc_url="https://base.sepolia.api.4mica.io/",
        facilitator_url="https://testnet.payment.4mica.io/",
        explorer_url="https://sepolia.basescan.org",
        native_symbol="ETH",
        testnet=True,
    ),
    "ethereum-sepolia": NetworkInfo(
        caip2="eip155:11155111",
        chain_id=11155111,
        label="Ethereum Sepolia",
        rpc_url="https://ethereum.sepolia.api.4mica.io/",
        facilitator_url=None,
        explorer_url="https://sepolia.etherscan.io",
        native_symbol="ETH",
        testnet=True,
    ),
}

#: ``base`` once the 2.0 mainnet upgrade lands.
DEFAULT_NETWORK = "base-sepolia"

_NAMES_BY_CAIP2: dict[str, str] = {info.caip2: name for name, info in NETWORKS.items()}


def resolve_network(network: str) -> Optional[Tuple[str, NetworkInfo]]:
    """The shorthand and metadata for *network* (shorthand or CAIP-2, ignoring
    case and surrounding space), or ``None`` for one 4Mica does not host."""
    key = network.strip().lower()
    name = key if key in NETWORKS else _NAMES_BY_CAIP2.get(key)
    return None if name is None else (name, NETWORKS[name])


def resolve_network_rpc_url(network: str) -> Optional[str]:
    """Return the core API URL for *network* (shorthand or CAIP-2), or ``None``."""
    resolved = resolve_network(network)
    return resolved[1].rpc_url if resolved else None


def to_caip2(network: str) -> str:
    """The CAIP-2 id x402 wants (``eip155:8453``), from any form of a hosted
    network's name: shorthand (``base-sepolia``), the app API's
    (``BASE_SEPOLIA``) or CAIP-2 itself."""
    resolved = resolve_network(network.replace("_", "-"))
    if resolved is None:
        raise InvalidParamsError(f"unknown network: {network}")
    return resolved[1].caip2
