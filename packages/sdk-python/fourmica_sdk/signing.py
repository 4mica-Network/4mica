from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, Protocol, cast

from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data
from eth_account.signers.local import LocalAccount

if TYPE_CHECKING:
    from eth_typing import Hash32

from .errors import (
    AddressMismatchError,
    InvalidParamsError,
    InvalidPayerAddressError,
    SigningError,
)
from .models import (
    CheckpointPayload,
    PaymentRequest,
    PaymentRequestPayload,
    SignedCheckpoint,
)
from .utils import SIGNATURE_LENGTH, ValidationError, parse_address


class EvmSigner(Protocol):
    @property
    def address(self) -> str: ...

    async def sign_typed_data(self, full_message: dict[str, Any]) -> str | bytes: ...

    async def sign_message(self, message: str | bytes) -> str | bytes: ...

    async def sign_hash(self, message_hash: bytes) -> str | bytes:
        """Signs a raw 32-byte digest, unprefixed."""
        ...


class LocalAccountSigner:
    def __init__(self, private_key: str) -> None:
        try:
            self._account: LocalAccount = Account.from_key(private_key)
        except Exception as exc:
            raise SigningError(f"invalid wallet private key: {exc}") from exc

    @property
    def address(self) -> str:
        return self._account.address

    async def sign_typed_data(self, full_message: dict[str, Any]) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: self._sign_typed_data_sync(full_message)
        )

    async def sign_message(self, message: str | bytes) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: self._sign_message_sync(message)
        )

    def _sign_typed_data_sync(self, full_message: dict[str, Any]) -> str:
        message = encode_typed_data(full_message=full_message)
        signed = self._account.sign_message(message)
        return signed.signature.hex()

    def _sign_message_sync(self, message: str | bytes) -> str:
        if isinstance(message, str):
            message = message.encode()
        signed = self._account.sign_message(encode_defunct(primitive=message))
        return signed.signature.hex()

    async def sign_hash(self, message_hash: bytes) -> str:
        digest: Hash32 = cast("Hash32", message_hash)
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._account.unsafe_sign_hash(digest).signature.hex
        )


class PayerSigner:
    """Refuses to sign for any payer but its own signer."""

    def __init__(self, signer: EvmSigner | str) -> None:
        self._signer: EvmSigner
        if isinstance(signer, str):
            self._signer = LocalAccountSigner(signer)
        else:
            self._signer = signer

    @property
    def address(self) -> str:
        return self._signer.address

    async def sign_payment_request(
        self, domain_separator: str | bytes, payload: PaymentRequestPayload
    ) -> PaymentRequest:
        self._require_signer_is(payload.user_address)
        signature = await self._sign(lambda: payload.signing_digest(domain_separator))
        return PaymentRequest(payload=payload, signature=signature)

    async def sign_checkpoint(
        self, domain_separator: str | bytes, payload: CheckpointPayload
    ) -> SignedCheckpoint:
        self._require_signer_is(payload.payer)
        signature = await self._sign(lambda: payload.signing_digest(domain_separator))
        return SignedCheckpoint(payload=payload, signature=signature)

    def _require_signer_is(self, payer: str) -> None:
        try:
            expected = parse_address(payer, "payer")
        except ValidationError as exc:
            raise InvalidPayerAddressError() from exc
        signer = parse_address(self._signer.address, "signer")
        if signer != expected:
            raise AddressMismatchError(signer, expected)

    async def _sign(self, digest: Callable[[], bytes]) -> str:
        try:
            message_hash = digest()
        except (InvalidParamsError, ValidationError, ValueError) as exc:
            raise SigningError(f"failed to sign the payment: {exc}") from exc
        try:
            signature = await self._signer.sign_hash(message_hash)
        except Exception as exc:
            raise SigningError(f"failed to sign the payment: {exc}") from exc
        return _normalize_signature(signature)


_SECP256K1_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141


def _normalize_signature(signature: str | bytes) -> str:
    sig = signature.hex() if isinstance(signature, bytes) else str(signature)
    if not sig.startswith("0x"):
        sig = "0x" + sig
    try:
        raw = bytes.fromhex(sig[2:])
    except ValueError:
        return sig
    if len(raw) != SIGNATURE_LENGTH:
        return sig
    r, s, v = raw[:32], int.from_bytes(raw[32:64], "big"), raw[64]
    if not 0 < int.from_bytes(r, "big") < _SECP256K1_ORDER:
        raise SigningError("the signer returned a signature with r out of range")
    if not 0 < s < _SECP256K1_ORDER:
        raise SigningError("the signer returned a signature with s out of range")
    if v in (0, 1):
        v += 27
    if v not in (27, 28):
        raise SigningError(
            f"the signer returned a signature with v of {v}; expected 0, 1, 27 or 28"
        )
    if s > _SECP256K1_ORDER // 2:
        s = _SECP256K1_ORDER - s
        v = 55 - v
    return "0x" + (r + s.to_bytes(32, "big") + bytes([v])).hex()
