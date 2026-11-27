from __future__ import annotations

from dataclasses import dataclass

from .errors import InvalidParamsError


@dataclass(frozen=True)
class NetworkInfo:
    caip2: str

    rpc_url: str

    chain_id: int = 0
    label: str = ""
    facilitator_url: str | None = None
    """``None`` where no facilitator is hosted; everything is then self-funded."""
    explorer_url: str = ""
    native_symbol: str = "ETH"
    testnet: bool = False


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

DEFAULT_NETWORK = "base-sepolia"

_NAMES_BY_CAIP2: dict[str, str] = {info.caip2: name for name, info in NETWORKS.items()}


def resolve_network(network: str) -> tuple[str, NetworkInfo] | None:
    """*network* is a shorthand or CAIP-2, ignoring case. ``None`` for one
    4Mica does not host."""
    key = network.strip().lower()
    name = key if key in NETWORKS else _NAMES_BY_CAIP2.get(key)
    return None if name is None else (name, NETWORKS[name])


def resolve_network_rpc_url(network: str) -> str | None:
    resolved = resolve_network(network)
    return resolved[1].rpc_url if resolved else None


def to_caip2(network: str) -> str:
    """From a shorthand (``base-sepolia``), the app API's name
    (``BASE_SEPOLIA``) or CAIP-2 itself."""
    resolved = resolve_network(network.replace("_", "-"))
    if resolved is None:
        raise InvalidParamsError(f"unknown network: {network}")
    return resolved[1].caip2
