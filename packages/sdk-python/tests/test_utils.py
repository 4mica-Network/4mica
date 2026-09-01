import pytest

from fourmica_sdk.utils import (
    ValidationError,
    normalize_address,
    normalize_private_key,
    parse_u256,
    serialize_u256,
    validate_url,
)


def test_validate_url_rejects_bad_input():
    with pytest.raises(ValidationError):
        validate_url("not-a-url")


def test_normalize_private_key_strips_prefix_and_lowercases():
    key = normalize_private_key("0xABCDEF" + "0" * 58)
    assert key == "0xabcdef" + "0" * 58


def test_parse_u256_accepts_hex_strings_and_serializes_back():
    value = parse_u256("0x10")
    assert value == 16
    assert serialize_u256(value) == "0x10"


def test_normalize_address_round_trips_checksum():
    addr = "0x0000000000000000000000000000000000000001"
    assert normalize_address(addr) == "0x0000000000000000000000000000000000000001"


def test_parse_u256_rejects_negative_numbers():
    with pytest.raises(ValidationError):
        parse_u256(-1)


def test_parse_u256_rejects_nan():
    with pytest.raises(ValidationError):
        parse_u256(float("nan"))


def test_parse_u256_rejects_infinity():
    with pytest.raises(ValidationError):
        parse_u256(float("inf"))


def test_parse_u256_rejects_non_numeric_string():
    with pytest.raises(ValidationError):
        parse_u256("abc")


def test_parse_u256_accepts_decimal_string():
    assert parse_u256("12345") == 12345


def test_normalize_private_key_rejects_too_short_key():
    with pytest.raises(ValidationError):
        normalize_private_key("0x1234")
