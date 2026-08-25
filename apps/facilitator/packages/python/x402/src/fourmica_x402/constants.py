"""Shared constants for 4mica x402 integration."""

from __future__ import annotations

from typing import Dict, List, TypedDict

SUPPORTED_NETWORKS: List[str] = ["eip155:11155111", "eip155:84532", "eip155:8453"]

DEFAULT_RPC_URLS: Dict[str, str] = {
    "eip155:11155111": "https://ethereum.sepolia.api.4mica.xyz",
    "eip155:84532": "https://base.sepolia.api.4mica.xyz",
    "eip155:8453": "https://base.api.4mica.xyz",
}


class DefaultAsset(TypedDict):
    address: str
    name: str
    version: str
    decimals: int


DEFAULT_ASSETS: Dict[str, DefaultAsset] = {
    # Ethereum Sepolia USDC
    "eip155:11155111": {
        "address": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        "name": "USDC",
        "version": "2",
        "decimals": 6,
    },
    # Base Sepolia USDC
    "eip155:84532": {
        "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "name": "USDC",
        "version": "2",
        "decimals": 6,
    },
    # Base mainnet USDC
    "eip155:8453": {
        "address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "name": "USD Coin",
        "version": "2",
        "decimals": 6,
    },
}


class UnsupportedNetworkError(ValueError):
    """Raised when a network is not supported by 4mica defaults."""


def get_default_asset(network: str) -> DefaultAsset:
    try:
        return DEFAULT_ASSETS[network]
    except KeyError as exc:
        raise UnsupportedNetworkError(f"No default asset configured for network {network}") from exc
