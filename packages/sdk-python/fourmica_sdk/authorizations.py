from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .utils import SIGNATURE_LENGTH, normalize_address, normalize_bytes32_hex


def _hex_quantity(value: int) -> str:
    return hex(int(value))


def _hex_bytes(value: str | bytes | bytearray) -> str:
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    raw = str(value)
    return raw if raw.startswith("0x") else "0x" + raw


@dataclass
class ReceiveAuthorization:
    """EIP-3009 ``receiveWithAuthorization``, as signed by the token holder."""

    from_address: str
    valid_after: int
    valid_before: int
    nonce: str
    v: int
    r: str
    s: str

    def __post_init__(self) -> None:
        self.from_address = normalize_address(self.from_address)
        self.valid_after = int(self.valid_after)
        self.valid_before = int(self.valid_before)
        self.nonce = normalize_bytes32_hex(self.nonce)
        self.v = int(self.v)
        self.r = normalize_bytes32_hex(self.r)
        self.s = normalize_bytes32_hex(self.s)

    def to_payload(self) -> dict[str, Any]:
        return {
            "from": self.from_address,
            "validAfter": _hex_quantity(self.valid_after),
            "validBefore": _hex_quantity(self.valid_before),
            "nonce": self.nonce,
            "v": self.v,
            "r": self.r,
            "s": self.s,
        }


@dataclass
class Permit2Authorization:
    from_address: str
    nonce: int
    deadline: int
    signature: str

    def __post_init__(self) -> None:
        self.from_address = normalize_address(self.from_address)
        self.nonce = int(self.nonce)
        self.deadline = int(self.deadline)
        self.signature = _hex_bytes(self.signature)

    def to_payload(self) -> dict[str, Any]:
        return {
            "from": self.from_address,
            "nonce": _hex_quantity(self.nonce),
            "deadline": _hex_quantity(self.deadline),
            "signature": self.signature,
        }


@dataclass
class Eip2612Permit:
    """``owner`` and ``spender`` are implied (the signer and Permit2); the
    signed values travel as decimal strings."""

    value: int
    deadline: int
    v: int
    r: str
    s: str

    def __post_init__(self) -> None:
        self.value = int(self.value)
        self.deadline = int(self.deadline)
        self.v = int(self.v)
        self.r = normalize_bytes32_hex(self.r)
        self.s = normalize_bytes32_hex(self.s)

    def to_payload(self) -> dict[str, Any]:
        return {
            "value": str(self.value),
            "deadline": str(self.deadline),
            "v": self.v,
            "r": self.r,
            "s": self.s,
        }


@dataclass
class WithdrawalRequestAuthorization:
    user: str
    asset: str
    amount: int
    valid_after: int
    valid_before: int
    nonce: str
    signature: str

    def __post_init__(self) -> None:
        self.user = normalize_address(self.user)
        self.asset = normalize_address(self.asset)
        self.amount = int(self.amount)
        self.valid_after = int(self.valid_after)
        self.valid_before = int(self.valid_before)
        self.nonce = normalize_bytes32_hex(self.nonce)
        self.signature = _hex_bytes(self.signature)

    def to_payload(self) -> dict[str, Any]:
        return {
            "user": self.user,
            "asset": self.asset,
            "amount": _hex_quantity(self.amount),
            "validAfter": _hex_quantity(self.valid_after),
            "validBefore": _hex_quantity(self.valid_before),
            "nonce": self.nonce,
            "signature": self.signature,
        }


@dataclass
class WithdrawalCancelAuthorization:
    """No amount: it clears whatever request is outstanding."""

    user: str
    asset: str
    valid_after: int
    valid_before: int
    nonce: str
    signature: str

    def __post_init__(self) -> None:
        self.user = normalize_address(self.user)
        self.asset = normalize_address(self.asset)
        self.valid_after = int(self.valid_after)
        self.valid_before = int(self.valid_before)
        self.nonce = normalize_bytes32_hex(self.nonce)
        self.signature = _hex_bytes(self.signature)

    def to_payload(self) -> dict[str, Any]:
        return {
            "user": self.user,
            "asset": self.asset,
            "validAfter": _hex_quantity(self.valid_after),
            "validBefore": _hex_quantity(self.valid_before),
            "nonce": self.nonce,
            "signature": self.signature,
        }


def split_signature(signature: str | bytes) -> tuple[int, str, str]:
    raw = signature
    if isinstance(raw, str):
        raw = bytes.fromhex(raw.removeprefix("0x"))
    raw = bytes(raw)
    if len(raw) != SIGNATURE_LENGTH:
        raise ValueError(f"expected a 65-byte signature, got {len(raw)}")
    v = raw[64]
    if v in (0, 1):
        v += 27
    return v, "0x" + raw[0:32].hex(), "0x" + raw[32:64].hex()
