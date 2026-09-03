from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Union
from urllib.parse import urlparse

from eth_utils import is_address, to_checksum_address


class ValidationError(ValueError):
    """Raised when input validation fails."""


def validate_url(raw: str) -> str:
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise ValidationError(f"invalid URL: {raw}")
    return raw


def normalize_private_key(raw: str) -> str:
    key = raw[2:] if raw.startswith("0x") else raw
    if not re.fullmatch(r"[0-9a-fA-F]{64}", key):
        raise ValidationError("invalid private key (expected 32 byte hex)")
    return "0x" + key.lower()


def normalize_address(raw: str) -> str:
    if not is_address(raw):
        raise ValidationError(f"invalid address: {raw}")
    return to_checksum_address(raw)


def normalize_bytes32_hex(raw: str) -> str:
    if not isinstance(raw, str):
        raise ValidationError(f"invalid bytes32 value type: {type(raw)}")
    value = raw.strip()
    if value.startswith("0x") or value.startswith("0X"):
        value = value[2:]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        raise ValidationError(f"invalid bytes32 hex: {raw}")
    return "0x" + value.lower()


def parse_u256(value: Union[int, str]) -> int:
    if isinstance(value, int):
        if value < 0:
            raise ValidationError("u256 cannot be negative")
        return value
    if isinstance(value, str):
        text = value.strip()
        base = 16 if text.lower().startswith("0x") else 10
        try:
            number = int(text, base=base)
        except ValueError as exc:
            raise ValidationError(f"invalid integer: {value}") from exc
        if number < 0:
            raise ValidationError("u256 cannot be negative")
        return number
    raise ValidationError(f"unsupported numeric type: {type(value)}")


def load_abi(name: str) -> Any:
    """Load a bundled ABI JSON file."""
    base = Path(__file__).resolve().parent / "contract" / "abi"
    path = base / name
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)["abi"]


def serialize_u256(value: Union[int, str]) -> str:
    """Serialize integers the way the Rust SDK expects (0x-prefixed hex)."""
    return hex(parse_u256(value))
