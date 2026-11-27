import json
from pathlib import Path

import pytest

from fourmica_sdk.networks import (
    DEFAULT_NETWORK,
    NETWORKS,
    resolve_network,
    resolve_network_rpc_url,
)

NETWORKS_JSON = Path(__file__).resolve().parents[2] / "sdk" / "networks.json"
SOURCE = "packages/sdk/networks.json"


@pytest.fixture(scope="module")
def canonical() -> dict:
    if not NETWORKS_JSON.is_file():
        pytest.skip(f"{NETWORKS_JSON} not found: not running inside the 4Mica monorepo")
    return json.loads(NETWORKS_JSON.read_text(encoding="utf-8"))


def test_same_network_shorthands(canonical: dict) -> None:
    assert set(NETWORKS) == set(canonical), (
        f"fourmica_sdk/networks.py NETWORKS keys {sorted(NETWORKS)} drifted "
        f"from {SOURCE} keys {sorted(canonical)}"
    )


@pytest.mark.parametrize("shorthand", sorted(NETWORKS))
def test_network_matches_source_of_truth(canonical: dict, shorthand: str) -> None:
    if shorthand not in canonical:
        pytest.fail(f"{shorthand!r} is in NETWORKS but missing from {SOURCE}")
    info = NETWORKS[shorthand]
    ours = {
        "caip2": info.caip2,
        "chainId": info.chain_id,
        "label": info.label,
        "rpcUrl": info.rpc_url,
        "facilitatorUrl": info.facilitator_url,
        "explorerUrl": info.explorer_url,
        "nativeSymbol": info.native_symbol,
        "testnet": info.testnet,
    }
    assert ours == canonical[shorthand], (
        f"{shorthand}: fourmica_sdk/networks.py drifted from {SOURCE}"
    )


def test_default_network_is_hosted() -> None:
    assert DEFAULT_NETWORK in NETWORKS


def test_resolve_network_by_shorthand_or_caip2() -> None:
    base = NETWORKS["base"]
    assert resolve_network("base") == ("base", base)
    assert resolve_network(" Base ") == ("base", base)
    assert resolve_network("eip155:8453") == ("base", base)
    assert resolve_network("EIP155:8453") == ("base", base)
    assert resolve_network("solana") is None
    assert resolve_network_rpc_url("eip155:8453") == base.rpc_url
    assert resolve_network_rpc_url("solana") is None
