import pytest
from x402.schemas import PaymentRequirements

from fourmica_x402.constants import UnsupportedNetworkError
from fourmica_x402.server_scheme import FourMicaEvmScheme

pytest.importorskip("x402")


def test_parse_price_asset_amount_passthrough():
    scheme = FourMicaEvmScheme("http://tab")
    price = {"amount": "123", "asset": "0xabc", "extra": {"k": "v"}}
    parsed = scheme.parse_price(price, "eip155:11155111")
    assert parsed.amount == "123"
    assert parsed.asset == "0xabc"
    assert parsed.extra == {"k": "v"}


def test_parse_price_money_default_conversion():
    scheme = FourMicaEvmScheme("http://tab")
    parsed = scheme.parse_price("$0.10", "eip155:11155111")
    assert parsed.amount == "100000"  # 0.10 USDC with 6 decimals
    assert parsed.asset == "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"


def test_parse_price_unsupported_network():
    scheme = FourMicaEvmScheme("http://tab")
    with pytest.raises(UnsupportedNetworkError):
        scheme.parse_price("$1.00", "eip155:1")


def test_enhance_payment_requirements_injects_tab_endpoint():
    scheme = FourMicaEvmScheme("http://tab")
    req = PaymentRequirements(
        scheme="4mica-credit",
        network="eip155:11155111",
        asset="0xabc",
        amount="1",
        pay_to="0xdef",
        max_timeout_seconds=60,
        extra={},
    )
    result = scheme.enhance_payment_requirements(req, supported_kind={}, extensions=[])
    assert result.extra["tabEndpoint"] == "http://tab"
