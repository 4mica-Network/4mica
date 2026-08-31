"""Gasless authorizations: signed here, redeemed on-chain by a facilitator at
its own expense. Each binds the signer, the amount, and a deadline into the
digest, so a submitter can alter nothing — the worst they can do is not
submit.

Wire form is camelCase with uint256/bytes32 values as 0x-prefixed hex, exactly
as the Rust SDK serializes them (``sdk-rust/src/contract/mod.rs``). Note an
EIP-3009 authorization carries no ``to``/``value``: the facilitator derives
them from the request it travels in.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from .utils import normalize_address, normalize_bytes32_hex


def _hex_quantity(value: int) -> str:
    return hex(int(value))


def _hex_bytes(value) -> str:
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

    def to_payload(self) -> Dict[str, Any]:
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
    """Permit2 ``PermitTransferFrom`` authorization."""

    from_address: str
    nonce: int
    deadline: int
    signature: str

    def __post_init__(self) -> None:
        self.from_address = normalize_address(self.from_address)
        self.nonce = int(self.nonce)
        self.deadline = int(self.deadline)
        self.signature = _hex_bytes(self.signature)

    def to_payload(self) -> Dict[str, Any]:
        return {
            "from": self.from_address,
            "nonce": _hex_quantity(self.nonce),
            "deadline": _hex_quantity(self.deadline),
            "signature": self.signature,
        }


@dataclass
class Eip2612Permit:
    """An EIP-2612 permit granting Permit2 its allowance. ``owner`` and
    ``spender`` are implied — the signer and the canonical Permit2 — so only
    the signed values travel, as decimal strings."""

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

    def to_payload(self) -> Dict[str, Any]:
        return {
            "value": str(self.value),
            "deadline": str(self.deadline),
            "v": self.v,
            "r": self.r,
            "s": self.s,
        }


@dataclass
class WithdrawalRequestAuthorization:
    """Core4Mica's signed struct for opening a withdrawal request without
    transacting. The asset, the amount and the window are all bound."""

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

    def to_payload(self) -> Dict[str, Any]:
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
    """Core4Mica's signed struct for cancelling a pending withdrawal request.
    No amount: a cancellation clears whatever request is outstanding."""

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

    def to_payload(self) -> Dict[str, Any]:
        return {
            "user": self.user,
            "asset": self.asset,
            "validAfter": _hex_quantity(self.valid_after),
            "validBefore": _hex_quantity(self.valid_before),
            "nonce": self.nonce,
            "signature": self.signature,
        }


def split_signature(signature) -> tuple:
    """Split a 65-byte signature into ``(v, r, s)``, with ``v`` left in
    Electrum notation (27/28) as ``ecrecover`` expects."""
    raw = signature
    if isinstance(raw, str):
        raw = bytes.fromhex(raw.removeprefix("0x"))
    raw = bytes(raw)
    if len(raw) != 65:
        raise ValueError(f"expected a 65-byte signature, got {len(raw)}")
    v = raw[64]
    if v in (0, 1):
        v += 27
    return v, "0x" + raw[0:32].hex(), "0x" + raw[32:64].hex()
