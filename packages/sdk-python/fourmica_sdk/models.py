from __future__ import annotations

import functools
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from .utils import normalize_address, normalize_bytes32_hex, parse_u256, serialize_u256


def _get_any(raw: Dict[str, Any], *keys: str) -> Any:
    """Return the first present key (even if falsy) to handle snake/camel responses."""
    for key in keys:
        if key in raw:
            return raw[key]
    return None


class SigningScheme(str, Enum):
    EIP712 = "eip712"
    EIP191 = "eip191"


@dataclass
class PaymentSignature:
    signature: str
    scheme: SigningScheme


@dataclass
class PaymentGuaranteeRequestClaims:
    user_address: str
    recipient_address: str
    tab_id: int
    req_id: int
    amount: int
    timestamp: int
    asset_address: str

    def __post_init__(self) -> None:
        self.user_address = normalize_address(self.user_address)
        self.recipient_address = normalize_address(self.recipient_address)
        self.tab_id = parse_u256(self.tab_id)
        self.req_id = parse_u256(self.req_id)
        self.amount = parse_u256(self.amount)
        self.timestamp = int(self.timestamp)
        self.asset_address = normalize_address(self.asset_address)

    @classmethod
    def new(
        cls,
        user_address: str,
        recipient_address: str,
        tab_id: int,
        req_id: int,
        amount: int,
        timestamp: int,
        erc20_token: Optional[str],
    ) -> "PaymentGuaranteeRequestClaims":
        asset = erc20_token or "0x0000000000000000000000000000000000000000"
        return cls(
            user_address=normalize_address(user_address),
            recipient_address=normalize_address(recipient_address),
            tab_id=parse_u256(tab_id),
            req_id=parse_u256(req_id),
            amount=parse_u256(amount),
            timestamp=int(timestamp),
            asset_address=normalize_address(asset),
        )

    def to_payload(self) -> Dict[str, Any]:
        return {
            "version": "v1",
            "user_address": self.user_address,
            "recipient_address": self.recipient_address,
            "tab_id": serialize_u256(self.tab_id),
            "req_id": serialize_u256(self.req_id),
            "amount": serialize_u256(self.amount),
            "asset_address": self.asset_address,
            "timestamp": int(self.timestamp),
        }


@dataclass
class PaymentGuaranteeValidationPolicyV2:
    validation_registry_address: str
    validation_request_hash: str
    validation_chain_id: int
    validator_address: str
    validator_agent_id: int
    min_validation_score: int
    validation_subject_hash: str
    required_validation_tag: str
    job_hash: str

    def __post_init__(self) -> None:
        self.validation_registry_address = normalize_address(
            self.validation_registry_address
        )
        self.validation_request_hash = normalize_bytes32_hex(
            self.validation_request_hash
        )
        self.validation_chain_id = parse_u256(self.validation_chain_id)
        self.validator_address = normalize_address(self.validator_address)
        self.validator_agent_id = parse_u256(self.validator_agent_id)
        self.min_validation_score = int(self.min_validation_score)
        if not 1 <= self.min_validation_score <= 100:
            raise ValueError(
                "min_validation_score must be in [1, 100], "
                f"got {self.min_validation_score}"
            )
        self.validation_subject_hash = normalize_bytes32_hex(
            self.validation_subject_hash
        )
        self.required_validation_tag = str(self.required_validation_tag)
        self.job_hash = normalize_bytes32_hex(self.job_hash)


@dataclass
class PaymentGuaranteeRequestClaimsV2(PaymentGuaranteeRequestClaims):
    validation_registry_address: str
    validation_request_hash: str
    validation_chain_id: int
    validator_address: str
    validator_agent_id: int
    min_validation_score: int
    validation_subject_hash: str
    required_validation_tag: str
    job_hash: str

    def __post_init__(self) -> None:
        super().__post_init__()
        self.validation_registry_address = normalize_address(
            self.validation_registry_address
        )
        self.validation_request_hash = normalize_bytes32_hex(
            self.validation_request_hash
        )
        self.validation_chain_id = parse_u256(self.validation_chain_id)
        self.validator_address = normalize_address(self.validator_address)
        self.validator_agent_id = parse_u256(self.validator_agent_id)
        self.min_validation_score = int(self.min_validation_score)
        if not 1 <= self.min_validation_score <= 100:
            raise ValueError(
                "min_validation_score must be in [1, 100], "
                f"got {self.min_validation_score}"
            )
        self.validation_subject_hash = normalize_bytes32_hex(
            self.validation_subject_hash
        )
        self.required_validation_tag = str(self.required_validation_tag)
        self.job_hash = normalize_bytes32_hex(self.job_hash)

    @classmethod
    def new(
        cls,
        user_address: str,
        recipient_address: str,
        tab_id: int,
        req_id: int,
        amount: int,
        timestamp: int,
        erc20_token: Optional[str],
        validation_registry_address: str,
        validation_request_hash: str,
        validation_chain_id: int,
        validator_address: str,
        validator_agent_id: int,
        min_validation_score: int,
        validation_subject_hash: str,
        required_validation_tag: str,
        job_hash: str,
    ) -> "PaymentGuaranteeRequestClaimsV2":
        asset = erc20_token or "0x0000000000000000000000000000000000000000"
        return cls(
            user_address=normalize_address(user_address),
            recipient_address=normalize_address(recipient_address),
            tab_id=parse_u256(tab_id),
            req_id=parse_u256(req_id),
            amount=parse_u256(amount),
            timestamp=int(timestamp),
            asset_address=normalize_address(asset),
            validation_registry_address=normalize_address(validation_registry_address),
            validation_request_hash=normalize_bytes32_hex(validation_request_hash),
            validation_chain_id=parse_u256(validation_chain_id),
            validator_address=normalize_address(validator_address),
            validator_agent_id=parse_u256(validator_agent_id),
            min_validation_score=int(min_validation_score),
            validation_subject_hash=normalize_bytes32_hex(validation_subject_hash),
            required_validation_tag=str(required_validation_tag),
            job_hash=normalize_bytes32_hex(job_hash),
        )

    @functools.cached_property
    def validation_policy(self) -> PaymentGuaranteeValidationPolicyV2:
        return PaymentGuaranteeValidationPolicyV2(
            validation_registry_address=self.validation_registry_address,
            validation_request_hash=self.validation_request_hash,
            validation_chain_id=self.validation_chain_id,
            validator_address=self.validator_address,
            validator_agent_id=self.validator_agent_id,
            min_validation_score=self.min_validation_score,
            validation_subject_hash=self.validation_subject_hash,
            required_validation_tag=self.required_validation_tag,
            job_hash=self.job_hash,
        )

    def to_payload(self) -> Dict[str, Any]:
        payload = super().to_payload()
        payload.update(
            {
                "version": "v2",
                "validation_registry_address": self.validation_registry_address,
                "validation_request_hash": self.validation_request_hash,
                "validation_chain_id": int(self.validation_chain_id),
                "validator_address": self.validator_address,
                "validator_agent_id": serialize_u256(self.validator_agent_id),
                "min_validation_score": int(self.min_validation_score),
                "validation_subject_hash": self.validation_subject_hash,
                "required_validation_tag": self.required_validation_tag,
                "job_hash": self.job_hash,
            }
        )
        return payload


@dataclass
class PaymentGuaranteeClaims:
    domain: bytes
    user_address: str
    recipient_address: str
    tab_id: int
    req_id: int
    amount: int
    total_amount: int
    asset_address: str
    timestamp: int
    version: int
    validation_policy: Optional[PaymentGuaranteeValidationPolicyV2] = None


@dataclass
class BLSCert:
    claims: str  # hex of abi-encoded guarantee claims (with version prefix)
    signature: str  # hex of compressed G2 signature (96 bytes)


@dataclass
class TabPaymentStatus:
    paid: int
    remunerated: bool
    asset: str

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "TabPaymentStatus":
        paid = raw.get("paid") if "paid" in raw else raw.get("paidAmount")
        remunerated = (
            raw.get("remunerated") if "remunerated" in raw else raw.get("paidOut")
        )
        asset = raw.get("asset") if "asset" in raw else raw.get("assetAddress")
        return cls(
            paid=parse_u256(paid),
            remunerated=bool(remunerated),
            asset=asset,
        )


@dataclass
class UserInfo:
    asset: str
    collateral: int
    withdrawal_request_amount: int
    withdrawal_request_timestamp: int


@dataclass
class TabInfo:
    tab_id: int
    user_address: str
    recipient_address: str
    asset_address: str
    start_timestamp: int
    ttl_seconds: int
    status: str
    settlement_status: str
    created_at: int
    updated_at: int
    total_amount: int = 0
    paid_amount: int = 0

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "TabInfo":
        return cls(
            tab_id=parse_u256(_get_any(raw, "tab_id", "tabId")),
            user_address=_get_any(raw, "user_address", "userAddress"),
            recipient_address=_get_any(raw, "recipient_address", "recipientAddress"),
            asset_address=_get_any(raw, "asset_address", "assetAddress"),
            start_timestamp=int(_get_any(raw, "start_timestamp", "startTimestamp")),
            ttl_seconds=int(_get_any(raw, "ttl_seconds", "ttlSeconds")),
            status=_get_any(raw, "status"),
            settlement_status=_get_any(raw, "settlement_status", "settlementStatus"),
            created_at=int(_get_any(raw, "created_at", "createdAt")),
            updated_at=int(_get_any(raw, "updated_at", "updatedAt")),
            total_amount=parse_u256(_get_any(raw, "total_amount", "totalAmount") or 0),
            paid_amount=parse_u256(_get_any(raw, "paid_amount", "paidAmount") or 0),
        )


@dataclass
class GuaranteeInfo:
    tab_id: int
    req_id: int
    from_address: str
    to_address: str
    asset_address: str
    amount: int
    timestamp: int
    certificate: Optional[str]

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "GuaranteeInfo":
        return cls(
            tab_id=parse_u256(_get_any(raw, "tab_id", "tabId")),
            req_id=parse_u256(_get_any(raw, "req_id", "reqId")),
            from_address=_get_any(raw, "from_address", "fromAddress"),
            to_address=_get_any(raw, "to_address", "toAddress"),
            asset_address=_get_any(raw, "asset_address", "assetAddress"),
            amount=parse_u256(_get_any(raw, "amount")),
            timestamp=int(
                _get_any(raw, "start_timestamp", "startTimestamp", "timestamp") or 0
            ),
            certificate=_get_any(raw, "certificate"),
        )


@dataclass
class PendingRemunerationInfo:
    tab: TabInfo
    latest_guarantee: Optional[GuaranteeInfo]

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "PendingRemunerationInfo":
        return cls(
            tab=TabInfo.from_rpc(_get_any(raw, "tab")),
            latest_guarantee=GuaranteeInfo.from_rpc(
                _get_any(raw, "latest_guarantee", "latestGuarantee")
            )
            if _get_any(raw, "latest_guarantee", "latestGuarantee")
            else None,
        )


@dataclass
class CollateralEventInfo:
    id: str
    user_address: str
    asset_address: str
    amount: int
    event_type: str
    tab_id: Optional[int]
    req_id: Optional[int]
    tx_id: Optional[str]
    created_at: int

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "CollateralEventInfo":
        return cls(
            id=_get_any(raw, "id"),
            user_address=_get_any(raw, "user_address", "userAddress"),
            asset_address=_get_any(raw, "asset_address", "assetAddress"),
            amount=parse_u256(_get_any(raw, "amount")),
            event_type=_get_any(raw, "event_type", "eventType"),
            tab_id=parse_u256(_get_any(raw, "tab_id", "tabId"))
            if _get_any(raw, "tab_id", "tabId") is not None
            else None,
            req_id=parse_u256(_get_any(raw, "req_id", "reqId"))
            if _get_any(raw, "req_id", "reqId") is not None
            else None,
            tx_id=_get_any(raw, "tx_id", "txId"),
            created_at=int(_get_any(raw, "created_at", "createdAt")),
        )


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
class SupportedTokenInfo:
    symbol: str
    address: str
    decimals: Optional[int] = None


@dataclass
class SupportedTokensResponse:
    chain_id: int
    tokens: List["SupportedTokenInfo"]

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "SupportedTokensResponse":
        chain_id = int(_get_any(raw, "chain_id", "chainId") or 0)
        tokens = [
            SupportedTokenInfo(
                symbol=t.get("symbol", ""),
                address=t.get("address", ""),
                decimals=int(t["decimals"]) if t.get("decimals") is not None else None,
            )
            for t in raw.get("tokens", [])
        ]
        return cls(chain_id=chain_id, tokens=tokens)


@dataclass
class TxReceiptWaitOptions:
    timeout_secs: int = 60
    poll_latency_secs: int = 2


__all__: List[str] = [
    "AssetBalanceInfo",
    "BLSCert",
    "CollateralEventInfo",
    "GuaranteeInfo",
    "PaymentGuaranteeClaims",
    "PaymentGuaranteeRequestClaims",
    "PaymentGuaranteeRequestClaimsV2",
    "PaymentGuaranteeValidationPolicyV2",
    "PaymentSignature",
    "PendingRemunerationInfo",
    "RecipientPaymentInfo",
    "SigningScheme",
    "SupportedTokenInfo",
    "SupportedTokensResponse",
    "TabInfo",
    "TabPaymentStatus",
    "TxReceiptWaitOptions",
    "UserInfo",
]
