"""Shared constants for 4mica x402 integration."""

from __future__ import annotations

from typing import Dict, List

# Base Sepolia only for now: it is the one network running the 2.0 protocol.
# Another network still works when its scheme is registered explicitly.
SUPPORTED_NETWORKS: List[str] = ["eip155:84532"]

DEFAULT_RPC_URLS: Dict[str, str] = {
    "eip155:11155111": "https://ethereum.sepolia.api.4mica.io",
    "eip155:84532": "https://base.sepolia.api.4mica.io",
    "eip155:8453": "https://base.api.4mica.io",
}


class UnsupportedNetworkError(ValueError):
    """Raised when 4mica has no core, or no stablecoin, for a network."""
