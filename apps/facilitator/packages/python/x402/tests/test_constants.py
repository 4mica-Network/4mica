from fourmica_x402.constants import (
    DEFAULT_RPC_URLS,
    SUPPORTED_NETWORKS,
)


def test_supported_networks_match_expected():
    assert SUPPORTED_NETWORKS == ["eip155:84532"]


def test_default_rpc_urls_match_expected():
    assert DEFAULT_RPC_URLS["eip155:11155111"] == "https://ethereum.sepolia.api.4mica.io"
    assert DEFAULT_RPC_URLS["eip155:84532"] == "https://base.sepolia.api.4mica.io"
    assert DEFAULT_RPC_URLS["eip155:8453"] == "https://base.api.4mica.io"
