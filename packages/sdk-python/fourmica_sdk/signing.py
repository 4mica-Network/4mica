"""Payer-side signing: the signer interface, and the payloads a payer
authorizes under the ClearingHouse domain."""

from __future__ import annotations

import asyncio
from typing import Protocol, Union

from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data

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
from .utils import ValidationError, parse_address


class EvmSigner(Protocol):
    """Signer interface for EVM-compatible accounts."""

    @property
    def address(self) -> str: ...

    async def sign_typed_data(self, full_message: dict) -> Union[str, bytes]: ...

    async def sign_message(self, message: Union[str, bytes]) -> Union[str, bytes]: ...

    async def sign_hash(self, message_hash: bytes) -> Union[str, bytes]:
        """Sign a raw 32-byte digest, unprefixed. Gasless authorizations need
        this: their EIP-712 digests build on opaque domain separators (a
        token's own ``DOMAIN_SEPARATOR()``), which typed-data signing cannot
        reconstruct."""
        ...


class LocalAccountSigner:
    """Default signer backed by an ``eth_account.Account``."""

    def __init__(self, private_key: str) -> None:
        try:
            self._account = Account.from_key(private_key)
        except Exception as exc:
            raise SigningError(f"invalid wallet private key: {exc}") from exc

    @property
    def address(self) -> str:
        return self._account.address

    async def sign_typed_data(self, full_message: dict) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: self._sign_typed_data_sync(full_message)
        )

    async def sign_message(self, message: Union[str, bytes]) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: self._sign_message_sync(message)
        )

    def _sign_typed_data_sync(self, full_message: dict) -> str:
        message = encode_typed_data(full_message=full_message)
        signed = self._account.sign_message(message)
        return signed.signature.hex()

    def _sign_message_sync(self, message: Union[str, bytes]) -> str:
        if isinstance(message, str):
            message = message.encode()
        signed = self._account.sign_message(encode_defunct(primitive=message))
        return signed.signature.hex()

    async def sign_hash(self, message_hash: bytes) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, lambda: self._account.unsafe_sign_hash(message_hash).signature.hex()
        )


class PayerSigner:
    """Signs the payloads a payer authorizes — payment requests and
    checkpoints — under the ClearingHouse domain. Both are signed by digest,
    as the contract verifies them.

    Refuses to sign for any payer but its own signer.
    """

    def __init__(self, signer: Union[EvmSigner, str]) -> None:
        self._signer: EvmSigner
        if isinstance(signer, str):
            self._signer = LocalAccountSigner(signer)
        else:
            self._signer = signer

    @property
    def address(self) -> str:
        return self._signer.address

    async def sign_payment_request(
        self, domain_separator: Union[str, bytes], payload: PaymentRequestPayload
    ) -> PaymentRequest:
        self._require_signer_is(payload.user_address)
        signature = await self._sign(lambda: payload.signing_digest(domain_separator))
        return PaymentRequest(payload=payload, signature=signature)

    async def sign_checkpoint(
        self, domain_separator: Union[str, bytes], payload: CheckpointPayload
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

    async def _sign(self, digest) -> str:
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


def _normalize_signature(signature: Union[str, bytes]) -> str:
    """0x-prefixed hex, in the one form core and the facilitator accept for a
    payer's signature: ``v`` of 27 or 28 and a low ``s``. A local key already
    signs that way; a remote signer may answer with ``v`` of 0 or 1, or the
    other ``s``, which is the same signature written differently. 65 bytes
    that cannot be a signature at all, with ``r`` or ``s`` outside the curve
    order or any other ``v``, raise :class:`SigningError`. Anything that is
    not 65 bytes is passed through for the server to refuse."""
    sig = signature.hex() if isinstance(signature, bytes) else str(signature)
    if not sig.startswith("0x"):
        sig = "0x" + sig
    try:
        raw = bytes.fromhex(sig[2:])
    except ValueError:
        return sig
    if len(raw) != 65:
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
