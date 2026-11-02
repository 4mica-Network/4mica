"""Drift check: ``fourmica_sdk.networks.NETWORKS`` against the monorepo's list.

``packages/sdk/networks.json`` is the single source of truth for 4Mica's
hosted networks. The Python SDK keeps its own copy so it has no build-time
dependency on the monorepo; this test fails when the two disagree.
"""

import json
from pathlib import Path

import pytest

from fourmica_sdk.networks import NETWORKS

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
    entry = canonical[shorthand]
    assert info.caip2 == entry["caip2"], (
        f"{shorthand}: caip2 {info.caip2!r} != {SOURCE} {entry['caip2']!r}"
    )
    assert info.rpc_url == entry["rpcUrl"], (
        f"{shorthand}: rpc_url {info.rpc_url!r} != {SOURCE} rpcUrl {entry['rpcUrl']!r}"
    )
