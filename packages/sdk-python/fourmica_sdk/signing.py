from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import List, Protocol, Union

from eth_abi import encode as abi_encode
from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data

from .errors import SigningError
from .models import (
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    PaymentSignature,
    SigningScheme,
)
from .utils import ValidationError, normalize_address, normalize_bytes32_hex
from .validation import VALIDATION_REQUEST_BINDING_DOMAIN_V1


def _build_typed_message(
    params: "CorePublicParameters",
    claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
):
    """Mirror the Solidity struct hashing used in the Rust SDK."""
    if isinstance(claims, PaymentGuaranteeRequestClaimsV2):
        return {
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "version", "type": "string"},
                    {"name": "chainId", "type": "uint256"},
                ],
                "SolGuaranteeRequestClaimsV2": [
                    {"name": "user", "type": "address"},
                    {"name": "recipient", "type": "address"},
                    {"name": "tabId", "type": "uint256"},
                    {"name": "reqId", "type": "uint256"},
                    {"name": "amount", "type": "uint256"},
                    {"name": "asset", "type": "address"},
                    {"name": "timestamp", "type": "uint64"},
                    {"name": "validationRegistryAddress", "type": "address"},
                    {"name": "validationRequestHash", "type": "bytes32"},
                    {"name": "validationChainId", "type": "uint256"},
                    {"name": "validatorAddress", "type": "address"},
                    {"name": "validatorAgentId", "type": "uint256"},
                    {"name": "minValidationScore", "type": "uint8"},
                    {"name": "validationSubjectHash", "type": "bytes32"},
                    {"name": "jobHash", "type": "bytes32"},
                    {"name": "requiredValidationTag", "type": "string"},
                ],
            },
            "primaryType": "SolGuaranteeRequestClaimsV2",
            "domain": {
                "name": params.eip712_name,
                "version": params.eip712_version,
                "chainId": params.chain_id,
            },
            "message": {
                "user": claims.user_address,
                "recipient": claims.recipient_address,
                "tabId": int(claims.tab_id),
                "reqId": int(claims.req_id),
                "amount": int(claims.amount),
                "asset": claims.asset_address,
                "timestamp": int(claims.timestamp),
                "validationRegistryAddress": claims.validation_registry_address,
                "validationRequestHash": normalize_bytes32_hex(
                    claims.validation_request_hash
                ),
                "validationChainId": int(claims.validation_chain_id),
                "validatorAddress": claims.validator_address,
                "validatorAgentId": int(claims.validator_agent_id),
                "minValidationScore": int(claims.min_validation_score),
                "validationSubjectHash": normalize_bytes32_hex(
                    claims.validation_subject_hash
                ),
                "jobHash": normalize_bytes32_hex(claims.job_hash),
                "requiredValidationTag": claims.required_validation_tag,
            },
        }

    return {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
            ],
            "SolGuaranteeRequestClaimsV1": [
                {"name": "user", "type": "address"},
                {"name": "recipient", "type": "address"},
                {"name": "tabId", "type": "uint256"},
                {"name": "reqId", "type": "uint256"},
                {"name": "amount", "type": "uint256"},
                {"name": "asset", "type": "address"},
                {"name": "timestamp", "type": "uint64"},
            ],
        },
        "primaryType": "SolGuaranteeRequestClaimsV1",
        "domain": {
            "name": params.eip712_name,
            "version": params.eip712_version,
            "chainId": params.chain_id,
        },
        "message": {
            "user": claims.user_address,
            "recipient": claims.recipient_address,
            "tabId": int(claims.tab_id),
            "reqId": int(claims.req_id),
            "amount": int(claims.amount),
            "asset": claims.asset_address,
            "timestamp": int(claims.timestamp),
        },
    }


def _encode_eip191(
    claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
) -> bytes:
    if isinstance(claims, PaymentGuaranteeRequestClaimsV2):
        return abi_encode(
            [
                "address",
                "address",
                "uint256",
                "uint256",
                "uint256",
                "address",
                "uint64",
                "address",
                "bytes32",
                "uint256",
                "address",
                "uint256",
                "uint8",
                "bytes32",
                "bytes32",
                "string",
            ],
            [
                claims.user_address,
                claims.recipient_address,
                int(claims.tab_id),
                int(claims.req_id),
                int(claims.amount),
                claims.asset_address,
                int(claims.timestamp),
                claims.validation_registry_address,
                bytes.fromhex(
                    normalize_bytes32_hex(claims.validation_request_hash).removeprefix(
                        "0x"
                    )
                ),
                int(claims.validation_chain_id),
                claims.validator_address,
                int(claims.validator_agent_id),
                int(claims.min_validation_score),
                bytes.fromhex(
                    normalize_bytes32_hex(claims.validation_subject_hash).removeprefix(
                        "0x"
                    )
                ),
                bytes.fromhex(
                    normalize_bytes32_hex(claims.job_hash).removeprefix("0x")
                ),
                claims.required_validation_tag,
            ],
        )

    payload = abi_encode(
        ["address", "address", "uint256", "uint256", "uint256", "address", "uint64"],
        [
            claims.user_address,
            claims.recipient_address,
            int(claims.tab_id),
            int(claims.req_id),
            int(claims.amount),
            claims.asset_address,
            int(claims.timestamp),
        ],
    )
    return payload


@dataclass
class CorePublicParameters:
    """Network parameters returned by the facilitator."""

    public_key: bytes
    contract_address: str
    ethereum_http_rpc_url: str
    eip712_name: str
    eip712_version: str
    chain_id: int
    max_accepted_guarantee_version: int = 1
    accepted_guarantee_versions: List[int] = field(default_factory=list)
    active_guarantee_domain_separator: str = ""
    trusted_validation_registries: List[str] = field(default_factory=list)
    validation_hash_canonicalization_version: str = field(
        default=VALIDATION_REQUEST_BINDING_DOMAIN_V1
    )

    def __post_init__(self) -> None:
        self.chain_id = int(self.chain_id)
        self.max_accepted_guarantee_version = int(self.max_accepted_guarantee_version)
        self.accepted_guarantee_versions = list(self.accepted_guarantee_versions)
        self.trusted_validation_registries = list(self.trusted_validation_registries)

    @classmethod
    def from_rpc(cls, payload: dict) -> "CorePublicParameters":
        def pick(*keys: str, default=None):
            for key in keys:
                if key in payload and payload[key] is not None:
                    return payload[key]
            return default

        def require(*keys: str):
            value = pick(*keys)
            if value is None:
                raise ValueError(f"missing core public parameter: {keys[0]}")
            return value

        pk = require("public_key", "publicKey")
        if isinstance(pk, str):
            pk_bytes = bytes.fromhex(pk.removeprefix("0x"))
        else:
            pk_bytes = bytes(pk)

        active_guarantee_domain_separator = str(
            pick(
                "active_guarantee_domain_separator",
                "activeGuaranteeDomainSeparator",
                default="",
            )
            or ""
        )
        if active_guarantee_domain_separator:
            active_guarantee_domain_separator = normalize_bytes32_hex(
                active_guarantee_domain_separator
            )

        accepted_versions_raw = pick(
            "accepted_guarantee_versions", "acceptedGuaranteeVersions", default=[]
        )
        accepted_versions = (
            [int(version) for version in accepted_versions_raw]
            if isinstance(accepted_versions_raw, list)
            else []
        )

        registries_raw = pick(
            "trusted_validation_registries",
            "trustedValidationRegistries",
            default=[],
        )
        trusted_validation_registries = (
            [normalize_address(str(address)) for address in registries_raw]
            if isinstance(registries_raw, list)
            else []
        )

        return cls(
            public_key=pk_bytes,
            contract_address=require("contract_address", "contractAddress"),
            ethereum_http_rpc_url=require(
                "ethereum_http_rpc_url", "ethereumHttpRpcUrl"
            ),
            eip712_name=require("eip712_name", "eip712Name"),
            eip712_version=require("eip712_version", "eip712Version"),
            chain_id=int(require("chain_id", "chainId")),
            max_accepted_guarantee_version=int(
                pick(
                    "max_accepted_guarantee_version",
                    "maxAcceptedGuaranteeVersion",
                    default=1,
                )
            ),
            accepted_guarantee_versions=accepted_versions,
            active_guarantee_domain_separator=active_guarantee_domain_separator,
            trusted_validation_registries=trusted_validation_registries,
            validation_hash_canonicalization_version=str(
                pick(
                    "validation_hash_canonicalization_version",
                    "validationHashCanonicalizationVersion",
                    default=VALIDATION_REQUEST_BINDING_DOMAIN_V1,
                )
            ),
        )

    def accepted_guarantee_versions_or_default(self) -> List[int]:
        if self.accepted_guarantee_versions:
            return list(self.accepted_guarantee_versions)
        return list(range(1, int(self.max_accepted_guarantee_version) + 1))


class EvmSigner(Protocol):
    """Signer interface for EVM-compatible accounts."""

    @property
    def address(self) -> str: ...

    async def sign_typed_data(self, full_message: dict) -> Union[str, bytes]: ...

    async def sign_message(self, message: Union[str, bytes]) -> Union[str, bytes]: ...


class LocalAccountSigner:
    """Default signer backed by an eth_account.Account."""

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


class PaymentSigner:
    """Signs payment guarantee requests using EIP-712 or EIP-191."""

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
        claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
        scheme: SigningScheme = SigningScheme.EIP712,
    ) -> PaymentSignature:
        if normalize_address(self._signer.address) != normalize_address(
            claims.user_address
        ):
            raise SigningError(
                f"address mismatch: signer {self._signer.address} "
                f"!= claims.user_address {claims.user_address}"
            )

        try:
            if scheme == SigningScheme.EIP712:
                full_message = _build_typed_message(params, claims)
                signature = await self._signer.sign_typed_data(full_message)
            elif scheme == SigningScheme.EIP191:
                payload = _encode_eip191(claims)
                signature = await self._signer.sign_message(payload)
            else:
                raise SigningError(f"unsupported signing scheme: {scheme}")
        except (ValueError, ValidationError) as exc:
            raise SigningError(str(exc)) from exc

        signature_hex = _normalize_signature(signature)
        return PaymentSignature(signature=signature_hex, scheme=scheme)


def _normalize_signature(signature: Union[str, bytes]) -> str:
    if isinstance(signature, bytes):
        sig = signature.hex()
    else:
        sig = str(signature)
    if not sig.startswith("0x"):
        sig = "0x" + sig
    return sig
