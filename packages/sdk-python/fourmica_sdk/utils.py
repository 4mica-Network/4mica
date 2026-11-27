from __future__ import annotations

import json
import re
from http import HTTPStatus
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from eth_utils import is_address, to_checksum_address

if TYPE_CHECKING:
    from eth_typing import ChecksumAddress

BYTES32_LENGTH = 32
U256_MAX = 2**256 - 1
SIGNATURE_LENGTH = 65


class ValidationError(ValueError):
    pass


def refused_status(status: int) -> bool:
    return (
        HTTPStatus.BAD_REQUEST <= status < HTTPStatus.INTERNAL_SERVER_ERROR
        and status != HTTPStatus.REQUEST_TIMEOUT
    )


def validate_url(raw: str) -> str:
    parsed = urlparse(raw)
    if not parsed.scheme or not parsed.netloc:
        raise ValidationError(f"invalid URL: {raw}")
    return raw


def normalize_private_key(raw: str) -> str:
    key = raw.removeprefix("0x")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", key):
        raise ValidationError("invalid private key (expected 32 byte hex)")
    return "0x" + key.lower()


def normalize_address(raw: str) -> ChecksumAddress:
    if not is_address(raw):
        raise ValidationError(f"invalid address: {raw}")
    return to_checksum_address(raw)


def parse_address(raw: str, field: str = "address") -> str:
    value = str(raw).strip()
    if not re.fullmatch(r"0[xX][0-9a-fA-F]{40}", value):
        raise ValidationError(f"invalid {field} address: {raw}")
    return to_checksum_address("0x" + value[2:].lower())


def normalize_bytes32_hex(raw: str) -> str:
    if not isinstance(raw, str):
        raise ValidationError(f"invalid bytes32 value type: {type(raw)}")
    value = raw.strip()
    if value.startswith(("0x", "0X")):
        value = value[2:]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        raise ValidationError(f"invalid bytes32 hex: {raw}")
    return "0x" + value.lower()


def parse_u256(value: int | str) -> int:
    if isinstance(value, bool):
        raise ValidationError(f"unsupported numeric type: {type(value)}")
    if isinstance(value, int):
        number = value
    elif isinstance(value, str):
        text = value.strip()
        base = 16 if text.lower().startswith("0x") else 10
        try:
            number = int(text, base=base)
        except ValueError as exc:
            raise ValidationError(f"invalid integer: {value}") from exc
    else:
        raise ValidationError(f"unsupported numeric type: {type(value)}")
    if number < 0:
        raise ValidationError("u256 cannot be negative")
    if number > U256_MAX:
        raise ValidationError(f"{value} does not fit in a u256")
    return number


def load_abi(name: str) -> Any:
    base = Path(__file__).resolve().parent / "contract" / "abi"
    path = base / name
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)["abi"]


def serialize_u256(value: int | str) -> str:
    return hex(parse_u256(value))
