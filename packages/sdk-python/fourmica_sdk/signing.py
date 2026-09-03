"""Payer-side request signing."""

from __future__ import annotations

import asyncio
from typing import Protocol, Union

from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data

from .digest import eip191_payload_for_claims, eip712_message_for_claims
from .errors import AddressMismatchError, SigningError
from .models import (
    CorePublicParameters,
    PaymentGuaranteeRequestClaims,
    PaymentSignature,
    SigningScheme,
)
from .utils import ValidationError, normalize_address


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


class PaymentSigner:
    """Signs payment guarantee requests using EIP-712 or EIP-191.

    Refuses to sign claims naming anyone but its own signer as the payer.
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

    async def sign_request(
        self,
        params: CorePublicParameters,
        claims: PaymentGuaranteeRequestClaims,
        scheme: SigningScheme = SigningScheme.EIP712,
    ) -> PaymentSignature:
        if normalize_address(self._signer.address) != normalize_address(
            claims.user_address
        ):
            raise AddressMismatchError(self._signer.address, claims.user_address)

        try:
            if scheme == SigningScheme.EIP712:
                full_message = eip712_message_for_claims(params, claims)
                signature = await self._signer.sign_typed_data(full_message)
            elif scheme == SigningScheme.EIP191:
                payload = eip191_payload_for_claims(claims)
                signature = await self._signer.sign_message(payload)
            else:
                raise SigningError(f"unsupported signing scheme: {scheme}")
        except (ValueError, ValidationError) as exc:
            raise SigningError(str(exc)) from exc

        return PaymentSignature(
            signature=_normalize_signature(signature), scheme=scheme
        )


def _normalize_signature(signature: Union[str, bytes]) -> str:
    sig = signature.hex() if isinstance(signature, bytes) else str(signature)
    if not sig.startswith("0x"):
        sig = "0x" + sig
    return sig
