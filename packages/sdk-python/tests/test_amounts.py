"""``fourmica_sdk.amounts`` against the monorepo's shared cases.

``packages/sdk/amounts.vectors.json`` pins how every SDK reads a human amount;
the TypeScript SDK runs the same file.
"""

import json
from pathlib import Path

import pytest

from fourmica_sdk.amounts import (
    AmountSpec,
    Token,
    format_units,
    is_native_asset,
    parse_amount,
    resolve_token,
    to_base_units,
)
from fourmica_sdk.errors import (
    AmbiguousTokenError,
    AmountPrecisionError,
    InvalidParamsError,
    TokenNotSupportedError,
)
from fourmica_sdk.models import ZERO_ADDRESS

VECTORS_JSON = Path(__file__).resolve().parents[2] / "sdk" / "amounts.vectors.json"
VECTORS = json.loads(VECTORS_JSON.read_text("utf-8")) if VECTORS_JSON.is_file() else {}
ERRORS = {"invalid": InvalidParamsError, "precision": AmountPrecisionError}

USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"
USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a"
TOKENS = [
    Token(symbol="USDC", address=USDC, decimals=6),
    Token(symbol="USDT", address=USDT, decimals=6),
]


def test_shared_vectors_are_present():
    if not VECTORS_JSON.is_file():
        pytest.skip(f"{VECTORS_JSON} not found: not running inside the 4Mica monorepo")
    assert VECTORS["toBaseUnits"] and VECTORS["parseAmount"] and VECTORS["formatUnits"]


@pytest.mark.parametrize("case", VECTORS.get("toBaseUnits", []), ids=repr)
def test_to_base_units_vector(case):
    if "error" not in case:
        assert to_base_units(case["amount"], case["decimals"]) == int(case["base"])
        return
    with pytest.raises(ERRORS[case["error"]]) as raised:
        to_base_units(case["amount"], case["decimals"])
    # AmountPrecisionError is an InvalidParamsError; "invalid" means not that.
    assert isinstance(raised.value, AmountPrecisionError) == (
        case["error"] == "precision"
    )


@pytest.mark.parametrize("case", VECTORS.get("parseAmount", []), ids=repr)
def test_parse_amount_vector(case):
    if "error" in case:
        with pytest.raises(ERRORS[case["error"]]):
            parse_amount(case["input"])
        return
    assert parse_amount(case["input"]) == AmountSpec(case["amount"], case["asset"])


@pytest.mark.parametrize("case", VECTORS.get("formatUnits", []), ids=repr)
def test_format_units_vector(case):
    assert format_units(int(case["base"]), case["decimals"]) == case["amount"]


def test_parse_amount_takes_the_structured_forms():
    expected = AmountSpec("0.5", "USDC")
    assert parse_amount({"amount": " 0.5 ", "asset": " USDC "}) == expected
    assert parse_amount(AmountSpec("0.5", "USDC")) == expected


@pytest.mark.parametrize(
    "value",
    [
        5,
        5.0,
        None,
        {"amount": 5, "asset": "USDC"},
        {"amount": "5"},
        {"amount": "5", "asset": " "},
        AmountSpec(5, "USDC"),
        ["5", "USDC"],
    ],
)
def test_numbers_and_malformed_inputs_are_refused(value):
    with pytest.raises(InvalidParamsError):
        parse_amount(value)


def test_to_base_units_refuses_numbers_and_bad_decimals():
    for amount in (5, 5.0, None):
        with pytest.raises(InvalidParamsError):
            to_base_units(amount, 6)
    for decimals in (-1, 256, 6.0, "6", True):
        with pytest.raises(InvalidParamsError):
            to_base_units("1", decimals)


def test_resolve_token_by_symbol_and_address():
    token = resolve_token(TOKENS, " usdc ")
    assert (token.symbol, token.address, token.decimals) == ("USDC", USDC, 6)
    assert token.native is False
    assert resolve_token(TOKENS, USDT.lower()).symbol == "USDT"


def test_resolve_token_maps_the_native_asset_itself():
    for value in ("ETH", "eth", ZERO_ADDRESS):
        token = resolve_token([], value)
        assert (token.symbol, token.address, token.decimals) == (
            "ETH",
            ZERO_ADDRESS,
            18,
        )
        assert token.native
    assert resolve_token([], "pol", native_symbol="POL").symbol == "POL"
    assert is_native_asset("ETH") and not is_native_asset("ETH", "POL")


def test_resolve_token_names_what_is_accepted():
    with pytest.raises(TokenNotSupportedError) as raised:
        resolve_token(TOKENS, "DAI", network="eip155:84532")
    error = raised.value
    assert (error.asset, error.network, error.supported) == (
        "DAI",
        "eip155:84532",
        TOKENS,
    )
    assert "on eip155:84532" in str(error) and f"USDC ({USDC})" in str(error)
    with pytest.raises(TokenNotSupportedError, match="accepted: none"):
        resolve_token([], "0x" + "11" * 20)


def test_resolve_token_refuses_a_symbol_two_tokens_share():
    twins = [*TOKENS, Token(symbol="usdc", address="0x" + "22" * 20, decimals=18)]
    with pytest.raises(AmbiguousTokenError, match="pass the token address") as raised:
        resolve_token(twins, "USDC")
    assert len(raised.value.matches) == 2
    assert resolve_token(twins, USDC).decimals == 6
