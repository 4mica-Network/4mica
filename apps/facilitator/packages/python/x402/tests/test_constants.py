import pytest

from fourmica_x402.constants import (
    DEFAULT_ASSETS,
    DEFAULT_RPC_URLS,
    SUPPORTED_NETWORKS,
    UnsupportedNetworkError,
    get_default_asset,
)


def test_supported_networks_match_expected():
    assert SUPPORTED_NETWORKS == ["eip155:11155111", "eip155:84532", "eip155:8453"]


def test_default_rpc_urls_match_expected():
    assert DEFAULT_RPC_URLS["eip155:11155111"] == "https://ethereum.sepolia.api.4mica.xyz"
    assert DEFAULT_RPC_URLS["eip155:84532"] == "https://base.sepolia.api.4mica.xyz"
    assert DEFAULT_RPC_URLS["eip155:8453"] == "https://base.api.4mica.xyz"


def test_default_assets_match_expected():
    assert (
        DEFAULT_ASSETS["eip155:11155111"]["address"] == "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
    )
    assert DEFAULT_ASSETS["eip155:11155111"]["decimals"] == 6
    assert DEFAULT_ASSETS["eip155:84532"]["address"] == "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    assert DEFAULT_ASSETS["eip155:84532"]["decimals"] == 6
    assert DEFAULT_ASSETS["eip155:8453"]["address"] == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    assert DEFAULT_ASSETS["eip155:8453"]["decimals"] == 6


def test_default_asset_eip712_domain_names_match_onchain():
    assert DEFAULT_ASSETS["eip155:8453"]["name"] == "USD Coin"
    assert DEFAULT_ASSETS["eip155:84532"]["name"] == "USDC"
    assert DEFAULT_ASSETS["eip155:11155111"]["name"] == "USDC"


def test_get_default_asset_raises_on_unsupported_network():
    with pytest.raises(UnsupportedNetworkError):
        get_default_asset("eip155:1")
