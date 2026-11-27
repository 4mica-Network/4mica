from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from eth_account.messages import encode_defunct, encode_typed_data
from eth_utils import keccak


@dataclass
class CdpAccountConfig:
    api_key_id: str
    api_key_secret: str
    wallet_secret: str
    """Required for account creation and every signing operation."""
    name: str
    """Idempotency key: the same name always yields the same wallet."""


class CdpAccountSigner:
    """The private key never leaves CDP."""

    def __init__(self, address: str, _cdp_client: Any) -> None:
        self._address = address
        self._cdp = _cdp_client

    @property
    def address(self) -> str:
        return self._address

    async def sign_message(self, message: str | bytes) -> str:
        if isinstance(message, bytes):
            prefixed = encode_defunct(primitive=message)
            msg_hash = (
                "0x" + keccak(prefixed.version + prefixed.header + prefixed.body).hex()
            )
            return cast(str, await self._cdp.evm.sign_hash(self._address, msg_hash))

        # Plain string: CDP applies the EIP-191 prefix internally.
        return cast(str, await self._cdp.evm.sign_message(self._address, message))

    async def sign_hash(self, message_hash: bytes) -> str:
        raw: object = message_hash
        digest = raw if isinstance(raw, str) else "0x" + bytes(message_hash).hex()
        return cast(str, await self._cdp.evm.sign_hash(self._address, digest))

    async def sign_typed_data(self, full_message: dict[str, Any]) -> str:
        from cdp.openapi_client.exceptions import ApiException
        from cdp.openapi_client.models.eip712_domain import EIP712Domain

        domain_dict: dict[str, Any] = full_message.get("domain", {})
        types: dict[str, Any] = full_message.get("types", {})
        primary_type: str = full_message.get("primaryType", "")
        message: dict[str, Any] = full_message.get("message", {})

        # CDP takes the domain as a separate object.
        filtered_types = {k: v for k, v in types.items() if k != "EIP712Domain"}

        domain = EIP712Domain(
            name=domain_dict.get("name"),
            version=domain_dict.get("version"),
            chainId=domain_dict.get("chainId"),
            verifyingContract=domain_dict.get("verifyingContract"),
            salt=domain_dict.get("salt"),
        )

        try:
            return cast(
                str,
                await self._cdp.evm.sign_typed_data(
                    self._address, domain, filtered_types, primary_type, message
                ),
            )
        except ApiException:
            encoded = encode_typed_data(full_message=full_message)
            msg_hash = (
                "0x" + keccak(encoded.version + encoded.header + encoded.body).hex()
            )
            return cast(str, await self._cdp.evm.sign_hash(self._address, msg_hash))

    async def close(self) -> None:
        if hasattr(self._cdp, "close"):
            await self._cdp.close()

    async def __aenter__(self) -> CdpAccountSigner:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.close()


async def create_cdp_account(config: CdpAccountConfig) -> CdpAccountSigner:
    from cdp import CdpClient

    cdp = CdpClient(
        api_key_id=config.api_key_id,
        api_key_secret=config.api_key_secret,
        wallet_secret=config.wallet_secret,
    )
    evm_account = await cdp.evm.get_or_create_account(name=config.name)
    return CdpAccountSigner(address=evm_account.address, _cdp_client=cdp)
