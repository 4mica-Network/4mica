"""Wire types mirroring the core service's ``rpc-4mica`` crate.

Core serializes snake_case JSON (``SiweTemplate`` in :mod:`.auth` is the one
camelCase exception); ``from_rpc`` parsers accept both spellings defensively.
U256 amounts serialize as 0x-prefixed hex, matching the Rust types.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from .errors import InvalidParamsError
from .utils import (
    ValidationError,
    normalize_address,
    normalize_bytes32_hex,
    parse_u256,
    serialize_u256,
)

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

#: Current guarantee claims version. Clients always sign at this version; core
#: accepts every version it advertises so older clients keep working.
GUARANTEE_CLAIMS_VERSION = 1


def _get_any(raw: Dict[str, Any], *keys: str) -> Any:
    """Return the first present key (even if falsy) to handle snake/camel responses."""
    for key in keys:
        if key in raw:
            return raw[key]
    return None


def _normalize_hex_bytes(raw: str) -> str:
    """Normalize 0x-prefixed hex of arbitrary length (validator params blobs)."""
    value = str(raw).strip()
    if value.startswith(("0x", "0X")):
        value = value[2:]
    if len(value) % 2 != 0:
        raise ValidationError(f"invalid hex bytes: {raw}")
    bytes.fromhex(value or "")
    return "0x" + value.lower()


class SigningScheme(str, Enum):
    EIP712 = "eip712"
    EIP191 = "eip191"


@dataclass
class PaymentSignature:
    signature: str
    scheme: SigningScheme


@dataclass
class ValidationRequirement:
    """An agreement, signed by the payer, that a guarantee only becomes payable
    once an external validator approves it."""

    validator: str
    subject: str
    deadline: Optional[int] = None
    params: str = "0x"

    def __post_init__(self) -> None:
        self.validator = str(self.validator)
        self.subject = normalize_bytes32_hex(self.subject)
        self.deadline = int(self.deadline) if self.deadline is not None else None
        self.params = _normalize_hex_bytes(self.params or "0x")

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "validator": self.validator,
            "subject": self.subject,
        }
        if self.deadline is not None:
            payload["deadline"] = self.deadline
        if self.params not in ("", "0x"):
            payload["params"] = self.params
        return payload

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "ValidationRequirement":
        return cls(
            validator=str(_get_any(raw, "validator")),
            subject=str(_get_any(raw, "subject")),
            deadline=_get_any(raw, "deadline"),
            params=str(_get_any(raw, "params") or "0x"),
        )


@dataclass
class PaymentGuaranteeRequestClaims:
    """V1 payment guarantee request claims, as signed by the payer's wallet."""

    user_address: str
    recipient_address: str
    req_id: int
    amount: int
    asset_address: str
    timestamp: int
    validation: Optional[ValidationRequirement] = None

    def __post_init__(self) -> None:
        self.user_address = normalize_address(self.user_address)
        self.recipient_address = normalize_address(self.recipient_address)
        self.req_id = parse_u256(self.req_id)
        self.amount = parse_u256(self.amount)
        self.asset_address = normalize_address(self.asset_address)
        self.timestamp = int(self.timestamp)

    @classmethod
    def new(
        cls,
        user_address: str,
        recipient_address: str,
        req_id: int,
        amount: int,
        timestamp: int,
        erc20_token: Optional[str] = None,
    ) -> "PaymentGuaranteeRequestClaims":
        return cls(
            user_address=user_address,
            recipient_address=recipient_address,
            req_id=req_id,
            amount=amount,
            asset_address=erc20_token or ZERO_ADDRESS,
            timestamp=timestamp,
        )

    def with_validation(
        self, validation: ValidationRequirement
    ) -> "PaymentGuaranteeRequestClaims":
        return PaymentGuaranteeRequestClaims(
            user_address=self.user_address,
            recipient_address=self.recipient_address,
            req_id=self.req_id,
            amount=self.amount,
            asset_address=self.asset_address,
            timestamp=self.timestamp,
            validation=validation,
        )

    @property
    def version(self) -> int:
        return GUARANTEE_CLAIMS_VERSION

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "version": "v1",
            "user_address": self.user_address,
            "recipient_address": self.recipient_address,
            "req_id": serialize_u256(self.req_id),
            "amount": serialize_u256(self.amount),
            "asset_address": self.asset_address,
            "timestamp": self.timestamp,
        }
        if self.validation is not None:
            payload["validation"] = self.validation.to_payload()
        return payload


@dataclass
class PaymentGuaranteeClaims:
    """Guarantee claims as signed by core's BLS key and decoded on-chain.

    ``cycle_id`` is assigned by core — the settlement cycle the guarantee was
    netted into — and never supplied by a client. Validation is enforced
    off-chain and never enters this envelope.
    """

    domain: bytes
    user_address: str
    recipient_address: str
    cycle_id: int
    req_id: int
    amount: int
    asset_address: str
    timestamp: int
    version: int

    def __post_init__(self) -> None:
        self.domain = bytes(self.domain)
        self.user_address = normalize_address(self.user_address)
        self.recipient_address = normalize_address(self.recipient_address)
        self.cycle_id = parse_u256(self.cycle_id)
        self.req_id = parse_u256(self.req_id)
        self.amount = parse_u256(self.amount)
        self.asset_address = normalize_address(self.asset_address)
        self.timestamp = int(self.timestamp)
        self.version = int(self.version)


@dataclass
class BLSCert:
    """BLS certificate: hex-encoded claims bytes plus a compressed G2 signature."""

    claims: str
    signature: str

    def __post_init__(self) -> None:
        self.claims = str(self.claims)
        self.signature = str(self.signature)

    def claims_bytes(self) -> bytes:
        return bytes.fromhex(self.claims.removeprefix("0x"))

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "BLSCert":
        claims = _get_any(raw, "claims")
        signature = _get_any(raw, "signature")
        if claims is None or signature is None:
            raise InvalidParamsError("certificate missing claims or signature")
        return cls(claims=str(claims), signature=str(signature))


@dataclass
class GuaranteeVersionDomain:
    """One guarantee version's EIP-712 domain separator, 0x-prefixed hex."""

    version: int
    domain_separator: str

    def __post_init__(self) -> None:
        self.version = int(self.version)
        self.domain_separator = normalize_bytes32_hex(self.domain_separator)


@dataclass
class CorePublicParameters:
    """Static parameters exposed by the core service (``GET /core/public-params``)."""

    public_key: bytes
    contract_address: str
    eip712_name: str
    eip712_version: str
    chain_id: int
    ethereum_http_rpc_url: str = ""
    supported_guarantee_versions: List[int] = field(
        default_factory=lambda: [GUARANTEE_CLAIMS_VERSION]
    )
    guarantee_domain_separator: str = ""
    guarantee_domains: List[GuaranteeVersionDomain] = field(default_factory=list)
    core_domain_separator: str = ""
    validators: List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.chain_id = int(self.chain_id)
        self.supported_guarantee_versions = [
            int(v) for v in self.supported_guarantee_versions
        ]

    @classmethod
    def from_rpc(cls, payload: Dict[str, Any]) -> "CorePublicParameters":
        def require(*keys: str) -> Any:
            value = _get_any(payload, *keys)
            if value is None:
                raise InvalidParamsError(f"missing core public parameter: {keys[0]}")
            return value

        pk = require("public_key", "publicKey")
        if isinstance(pk, str):
            pk_bytes = bytes.fromhex(pk.removeprefix("0x"))
        else:
            pk_bytes = bytes(pk)

        versions_raw = _get_any(
            payload, "supported_guarantee_versions", "supportedGuaranteeVersions"
        )
        versions = (
            [int(v) for v in versions_raw]
            if isinstance(versions_raw, list) and versions_raw
            else [GUARANTEE_CLAIMS_VERSION]
        )

        domains_raw = _get_any(payload, "guarantee_domains", "guaranteeDomains") or []
        domains = [
            GuaranteeVersionDomain(
                version=_get_any(entry, "version"),
                domain_separator=_get_any(entry, "domain_separator", "domainSeparator"),
            )
            for entry in domains_raw
        ]

        guarantee_domain_separator = str(
            _get_any(payload, "guarantee_domain_separator", "guaranteeDomainSeparator")
            or ""
        )
        if guarantee_domain_separator:
            guarantee_domain_separator = normalize_bytes32_hex(
                guarantee_domain_separator
            )

        core_domain_separator = str(
            _get_any(payload, "core_domain_separator", "coreDomainSeparator") or ""
        )
        if core_domain_separator:
            core_domain_separator = normalize_bytes32_hex(core_domain_separator)

        return cls(
            public_key=pk_bytes,
            contract_address=str(require("contract_address", "contractAddress")),
            eip712_name=str(require("eip712_name", "eip712Name")),
            eip712_version=str(require("eip712_version", "eip712Version")),
            chain_id=int(require("chain_id", "chainId")),
            ethereum_http_rpc_url=str(
                _get_any(payload, "ethereum_http_rpc_url", "ethereumHttpRpcUrl") or ""
            ),
            supported_guarantee_versions=versions,
            guarantee_domain_separator=guarantee_domain_separator,
            guarantee_domains=domains,
            core_domain_separator=core_domain_separator,
            validators=[str(v) for v in _get_any(payload, "validators") or []],
        )


@dataclass
class SupportedTokenInfo:
    symbol: str
    address: str
    decimals: Optional[int] = None
    domain_separator: Optional[str] = None
    """The token's own EIP-712 ``DOMAIN_SEPARATOR()``, relayed by core so
    clients can build gasless-deposit signatures without an Ethereum RPC.
    ``None`` for tokens that do not expose one."""


@dataclass
class SupportedTokensResponse:
    chain_id: int
    tokens: List[SupportedTokenInfo]

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "SupportedTokensResponse":
        tokens = [
            SupportedTokenInfo(
                symbol=str(t.get("symbol", "")),
                address=str(t.get("address", "")),
                decimals=int(t["decimals"]) if t.get("decimals") is not None else None,
                domain_separator=_get_any(t, "domain_separator", "domainSeparator"),
            )
            for t in raw.get("tokens", [])
        ]
        return cls(
            chain_id=int(_get_any(raw, "chain_id", "chainId") or 0), tokens=tokens
        )


class ClearingParticipantRole(str, Enum):
    NET_DEBTOR = "NET_DEBTOR"
    NET_CREDITOR = "NET_CREDITOR"


class ClearingSettlementAction(str, Enum):
    PAY_NET_DEBIT = "pay_net_debit"
    CLAIM_NET_CREDIT = "claim_net_credit"


@dataclass
class ClearingParticipantProof:
    """A participant's committed Merkle leaf and proof for one clearing cycle."""

    cycle_id: str
    """On-chain bytes32 cycle identifier."""
    cycle_id_text: str
    """Core database cycle identifier (``{asset}:{period_start}``)."""
    asset_address: str
    participant: str
    role: ClearingParticipantRole
    amount: int
    """Amount used with the participant's role-specific ClearingHouse call."""
    net_debit: int
    net_credit: int
    leaf: str
    merkle_root: str
    proof: List[str]

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "ClearingParticipantProof":
        try:
            return cls(
                cycle_id=normalize_bytes32_hex(
                    str(_get_any(raw, "cycle_id", "cycleId"))
                ),
                cycle_id_text=str(_get_any(raw, "cycle_id_text", "cycleIdText")),
                asset_address=normalize_address(
                    str(_get_any(raw, "asset_address", "assetAddress"))
                ),
                participant=normalize_address(str(_get_any(raw, "participant"))),
                role=ClearingParticipantRole(str(_get_any(raw, "role"))),
                amount=parse_u256(_get_any(raw, "amount")),
                net_debit=parse_u256(_get_any(raw, "net_debit", "netDebit")),
                net_credit=parse_u256(_get_any(raw, "net_credit", "netCredit")),
                leaf=normalize_bytes32_hex(str(_get_any(raw, "leaf"))),
                merkle_root=normalize_bytes32_hex(
                    str(_get_any(raw, "merkle_root", "merkleRoot"))
                ),
                proof=[
                    normalize_bytes32_hex(str(item))
                    for item in _get_any(raw, "proof") or []
                ],
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid clearing proof: {exc}") from exc


@dataclass
class ClearingSettlementActionResponse:
    """A ClearingHouse call prepared by core from a participant's committed leaf."""

    contract_address: str
    """ClearingHouse contract address."""
    function_name: str
    """Contract function name to call (``payNetDebit`` / ``claimNetCreditFor``)."""
    action: ClearingSettlementAction
    cycle_id: str
    """On-chain bytes32 cycle identifier."""
    cycle_id_text: str
    asset_address: str
    participant: str
    """Participant whose committed Merkle leaf is proven."""
    amount: int
    payable_value: int
    """Native value to attach; non-zero only for native-asset debtor payments."""
    proof: List[str]

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "ClearingSettlementActionResponse":
        try:
            return cls(
                contract_address=normalize_address(
                    str(_get_any(raw, "contract_address", "contractAddress"))
                ),
                function_name=str(_get_any(raw, "function_name", "functionName")),
                action=ClearingSettlementAction(str(_get_any(raw, "action"))),
                cycle_id=normalize_bytes32_hex(
                    str(_get_any(raw, "cycle_id", "cycleId"))
                ),
                cycle_id_text=str(_get_any(raw, "cycle_id_text", "cycleIdText")),
                asset_address=normalize_address(
                    str(_get_any(raw, "asset_address", "assetAddress"))
                ),
                participant=normalize_address(str(_get_any(raw, "participant"))),
                amount=parse_u256(_get_any(raw, "amount")),
                payable_value=parse_u256(
                    _get_any(raw, "payable_value", "payableValue")
                ),
                proof=[
                    normalize_bytes32_hex(str(item))
                    for item in _get_any(raw, "proof") or []
                ],
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid clearing action: {exc}") from exc


@dataclass
class AssetBalanceInfo:
    user_address: str
    asset_address: str
    total: int
    locked: int
    version: int
    updated_at: int

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "AssetBalanceInfo":
        return cls(
            user_address=_get_any(raw, "user_address", "userAddress"),
            asset_address=_get_any(raw, "asset_address", "assetAddress"),
            total=parse_u256(_get_any(raw, "total")),
            locked=parse_u256(_get_any(raw, "locked")),
            version=int(_get_any(raw, "version")),
            updated_at=int(_get_any(raw, "updated_at", "updatedAt")),
        )


@dataclass
class RecipientPaymentInfo:
    user_address: str
    recipient_address: str
    tx_hash: str
    amount: int
    verified: bool
    finalized: bool
    failed: bool
    created_at: int

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "RecipientPaymentInfo":
        return cls(
            user_address=_get_any(raw, "user_address", "userAddress"),
            recipient_address=_get_any(raw, "recipient_address", "recipientAddress"),
            tx_hash=_get_any(raw, "tx_hash", "txHash"),
            amount=parse_u256(_get_any(raw, "amount")),
            verified=bool(_get_any(raw, "verified")),
            finalized=bool(_get_any(raw, "finalized")),
            failed=bool(_get_any(raw, "failed")),
            created_at=int(_get_any(raw, "created_at", "createdAt")),
        )


@dataclass
class UserSuspensionStatus:
    user_address: str
    suspended: bool
    updated_at: int

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "UserSuspensionStatus":
        return cls(
            user_address=_get_any(raw, "user_address", "userAddress"),
            suspended=bool(_get_any(raw, "suspended")),
            updated_at=int(_get_any(raw, "updated_at", "updatedAt")),
        )


@dataclass
class TxReceiptWaitOptions:
    timeout_secs: int = 60
    poll_latency_secs: int = 2


__all__: List[str] = [
    "AssetBalanceInfo",
    "BLSCert",
    "ClearingParticipantProof",
    "ClearingParticipantRole",
    "ClearingSettlementAction",
    "ClearingSettlementActionResponse",
    "CorePublicParameters",
    "GUARANTEE_CLAIMS_VERSION",
    "GuaranteeVersionDomain",
    "PaymentGuaranteeClaims",
    "PaymentGuaranteeRequestClaims",
    "PaymentSignature",
    "RecipientPaymentInfo",
    "SigningScheme",
    "SupportedTokenInfo",
    "SupportedTokensResponse",
    "TxReceiptWaitOptions",
    "UserSuspensionStatus",
    "ValidationRequirement",
    "ZERO_ADDRESS",
]
