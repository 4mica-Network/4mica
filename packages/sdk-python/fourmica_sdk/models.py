from __future__ import annotations

import dataclasses
import secrets
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, TypeVar

from .errors import InvalidParamsError
from .guarantee import checkpoint_signing_digest, payment_signing_digest
from .utils import (
    BYTES32_LENGTH,
    ValidationError,
    normalize_address,
    normalize_bytes32_hex,
    parse_address,
    parse_u256,
    serialize_u256,
)

if TYPE_CHECKING:
    from _typeshed import DataclassInstance

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

PAYMENT_PAYLOAD_VERSION = 1

_PAYLOAD_VERSION_TAGS: dict[str, int] = {"v1": PAYMENT_PAYLOAD_VERSION}

_U64_MAX = 2**64 - 1


def _get_any(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in raw:
            return raw[key]
    return None


def _normalize_hex_bytes(raw: str) -> str:
    value = str(raw).strip()
    if value.startswith(("0x", "0X")):
        value = value[2:]
    if len(value) % 2 != 0:
        raise ValidationError(f"invalid hex bytes: {raw}")
    try:
        bytes.fromhex(value)
    except ValueError:
        raise ValidationError(f"invalid hex bytes: {raw}") from None
    return "0x" + value.lower()


@dataclass
class ValidationRequirement:
    """Signed by the payer: the guarantee only becomes payable once an
    external validator approves it."""

    validator: str
    subject: str
    deadline: int | None = None
    params: str = "0x"

    def __post_init__(self) -> None:
        self.validator = str(self.validator)
        self.subject = normalize_bytes32_hex(self.subject)
        self.deadline = int(self.deadline) if self.deadline is not None else None
        self.params = _normalize_hex_bytes(self.params or "0x")

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "validator": self.validator,
            "subject": self.subject,
        }
        if self.deadline is not None:
            payload["deadline"] = self.deadline
        if self.params not in ("", "0x"):
            payload["params"] = self.params
        return payload

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> ValidationRequirement:
        return cls(
            validator=str(_get_any(raw, "validator")),
            subject=str(_get_any(raw, "subject")),
            deadline=_get_any(raw, "deadline"),
            params=str(_get_any(raw, "params") or "0x"),
        )


def _payload_address(field_name: str, raw: Any) -> str:
    value = str(raw).strip()
    parse_address(value, field_name)
    return value


def _bytes32(raw: str | bytes) -> str:
    if isinstance(raw, (bytes, bytearray)):
        if len(raw) != BYTES32_LENGTH:
            raise ValidationError(f"expected 32 bytes, got {len(raw)}")
        return "0x" + bytes(raw).hex()
    return normalize_bytes32_hex(raw)


def _u64(raw: Any) -> int:
    value = int(raw)
    if not 0 <= value <= _U64_MAX:
        raise ValidationError(f"value out of u64 range: {raw}")
    return value


def _require(raw: dict[str, Any], what: str, *keys: str) -> Any:
    value = _get_any(raw, *keys)
    if value is None:
        raise InvalidParamsError(f"{what} is missing {keys[0]}")
    return value


@dataclass
class PaymentRequestPayload:
    user_address: str
    recipient_address: str
    cycle_id: str
    """On-chain bytes32 cycle id."""
    req_id: int
    amount: int
    asset_address: str
    timestamp: int
    salt: str
    """Random bytes32. Must be unpredictable, or the recipient can be
    recovered by trying candidates."""
    validation: ValidationRequirement | None = None
    """Present: validation-gated. Absent: payable at issuance."""

    def __post_init__(self) -> None:
        self.user_address = _payload_address("user", self.user_address)
        self.recipient_address = _payload_address("recipient", self.recipient_address)
        self.cycle_id = _bytes32(self.cycle_id)
        self.req_id = parse_u256(self.req_id)
        self.amount = parse_u256(self.amount)
        self.asset_address = _payload_address("asset", self.asset_address)
        self.timestamp = _u64(self.timestamp)
        self.salt = _bytes32(self.salt)

    @classmethod
    def new(
        cls,
        user_address: str,
        recipient_address: str,
        cycle_id: str | bytes,
        req_id: int,
        amount: int,
        timestamp: int,
        erc20_token: str | None = None,
        salt: str | bytes | None = None,
    ) -> PaymentRequestPayload:
        """*salt* defaults to fresh random bytes, which it must be outside of
        test vectors."""
        return cls(
            user_address=user_address,
            recipient_address=recipient_address,
            cycle_id=_bytes32(cycle_id),
            req_id=req_id,
            amount=amount,
            asset_address=erc20_token or ZERO_ADDRESS,
            timestamp=timestamp,
            salt=_bytes32(salt if salt is not None else secrets.token_bytes(32)),
        )

    @property
    def version(self) -> int:
        return PAYMENT_PAYLOAD_VERSION

    def with_validation(
        self, validation: ValidationRequirement
    ) -> PaymentRequestPayload:
        return dataclasses.replace(self, validation=validation)

    def signing_digest(self, domain_separator: str | bytes) -> bytes:
        return payment_signing_digest(self, domain_separator)

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "version": "v1",
            "user_address": self.user_address,
            "recipient_address": self.recipient_address,
            "cycle_id": self.cycle_id,
            "req_id": serialize_u256(self.req_id),
            "amount": serialize_u256(self.amount),
            "asset_address": self.asset_address,
            "timestamp": self.timestamp,
            "salt": self.salt,
        }
        if self.validation is not None:
            payload["validation"] = self.validation.to_payload()
        return payload

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> PaymentRequestPayload:
        """A missing or unknown version tag is refused, not defaulted."""
        if not isinstance(raw, dict):
            raise InvalidParamsError("payment payload must be an object")
        tag = raw.get("version")
        if tag is None:
            raise InvalidParamsError("payment payload is missing its version tag")
        if tag not in _PAYLOAD_VERSION_TAGS:
            raise InvalidParamsError(f"unsupported payment payload version: {tag}")
        what = "payment payload"
        validation_raw = raw.get("validation")
        try:
            return cls(
                user_address=_require(raw, what, "user_address"),
                recipient_address=_require(raw, what, "recipient_address"),
                cycle_id=_require(raw, what, "cycle_id"),
                req_id=_require(raw, what, "req_id"),
                amount=_require(raw, what, "amount"),
                asset_address=_require(raw, what, "asset_address"),
                timestamp=_require(raw, what, "timestamp"),
                salt=_require(raw, what, "salt"),
                validation=ValidationRequirement.from_rpc(validation_raw)
                if validation_raw is not None
                else None,
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid payment payload: {exc}") from exc


@dataclass
class PaymentRequest:
    payload: PaymentRequestPayload
    signature: str
    """65-byte signature as 0x-prefixed hex."""

    def to_payload(self) -> dict[str, Any]:
        return {"payload": self.payload.to_payload(), "signature": self.signature}

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> PaymentRequest:
        return cls(
            payload=PaymentRequestPayload.from_rpc(
                _require(raw, "payment request", "payload")
            ),
            signature=str(_require(raw, "payment request", "signature")),
        )


@dataclass
class CheckpointPayload:
    """Covers every one of the payer's authorizations in the cycle stamped at
    or below ``timestamp_cutoff``."""

    payer: str
    cycle_id: str
    """On-chain bytes32 cycle id."""
    asset_address: str
    cumulative_gross: int
    timestamp_cutoff: int

    def __post_init__(self) -> None:
        self.payer = _payload_address("payer", self.payer)
        self.cycle_id = _bytes32(self.cycle_id)
        self.asset_address = _payload_address("asset", self.asset_address)
        self.cumulative_gross = parse_u256(self.cumulative_gross)
        self.timestamp_cutoff = _u64(self.timestamp_cutoff)

    def signing_digest(self, domain_separator: str | bytes) -> bytes:
        return checkpoint_signing_digest(self, domain_separator)

    def to_payload(self) -> dict[str, Any]:
        return {
            "payer": self.payer,
            "cycle_id": self.cycle_id,
            "asset_address": self.asset_address,
            "cumulative_gross": serialize_u256(self.cumulative_gross),
            "timestamp_cutoff": self.timestamp_cutoff,
        }

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> CheckpointPayload:
        what = "checkpoint"
        try:
            return cls(
                payer=_require(raw, what, "payer"),
                cycle_id=_require(raw, what, "cycle_id"),
                asset_address=_require(raw, what, "asset_address"),
                cumulative_gross=_require(raw, what, "cumulative_gross"),
                timestamp_cutoff=_require(raw, what, "timestamp_cutoff"),
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid checkpoint: {exc}") from exc


@dataclass
class SignedCheckpoint:
    payload: CheckpointPayload
    signature: str
    """65-byte signature as 0x-prefixed hex."""

    def to_payload(self) -> dict[str, Any]:
        return {"payload": self.payload.to_payload(), "signature": self.signature}

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> SignedCheckpoint:
        return cls(
            payload=CheckpointPayload.from_rpc(
                _require(raw, "signed checkpoint", "payload")
            ),
            signature=str(_require(raw, "signed checkpoint", "signature")),
        )


@dataclass
class ActiveCycleResponse:
    cycle_id: str
    """On-chain bytes32 cycle id."""
    cycle_id_text: str
    asset_address: str
    period_start: int
    """Unix seconds; a payment stamped earlier is refused as stale."""
    period_end: int
    """Unix seconds."""
    server_time: int = 0
    """Core's clock, unix seconds. Zero from a core that predates it."""
    max_uncheckpointed: int = 0
    """Guarantees allowed past the latest checkpoint before
    ``CHECKPOINT_REQUIRED``. Zero from a core that predates it."""

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> ActiveCycleResponse:
        what = "active cycle"
        try:
            return cls(
                cycle_id=normalize_bytes32_hex(str(_require(raw, what, "cycle_id"))),
                cycle_id_text=str(_get_any(raw, "cycle_id_text") or ""),
                asset_address=str(_require(raw, what, "asset_address")),
                period_start=_u64(_require(raw, what, "period_start")),
                period_end=_u64(_require(raw, what, "period_end")),
                server_time=_u64(_get_any(raw, "server_time") or 0),
                max_uncheckpointed=int(_get_any(raw, "max_uncheckpointed") or 0),
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid active cycle: {exc}") from exc


@dataclass
class CheckpointBatchResponse:
    """Untrusted until checked."""

    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    previous: SignedCheckpoint | None
    """``None`` for a cycle's first checkpoint."""
    authorizations: list[PaymentRequest]
    max_uncheckpointed: int = 0

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> CheckpointBatchResponse:
        what = "checkpoint batch"
        previous = _get_any(raw, "previous")
        try:
            return cls(
                cycle_id=normalize_bytes32_hex(str(_require(raw, what, "cycle_id"))),
                cycle_id_text=str(_get_any(raw, "cycle_id_text") or ""),
                asset_address=str(_require(raw, what, "asset_address")),
                payer=str(_require(raw, what, "payer")),
                previous=SignedCheckpoint.from_rpc(previous)
                if previous is not None
                else None,
                authorizations=[
                    PaymentRequest.from_rpc(item)
                    for item in _get_any(raw, "authorizations") or []
                ],
                max_uncheckpointed=int(_get_any(raw, "max_uncheckpointed") or 0),
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid checkpoint batch: {exc}") from exc


@dataclass
class CheckpointAcceptedResponse:
    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    cumulative_gross: int
    timestamp_cutoff: int
    covered: int
    """Zero when it repeats the latest accepted checkpoint."""

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> CheckpointAcceptedResponse:
        what = "accepted checkpoint"
        try:
            return cls(
                cycle_id=normalize_bytes32_hex(str(_require(raw, what, "cycle_id"))),
                cycle_id_text=str(_get_any(raw, "cycle_id_text") or ""),
                asset_address=str(_require(raw, what, "asset_address")),
                payer=str(_require(raw, what, "payer")),
                cumulative_gross=parse_u256(_require(raw, what, "cumulative_gross")),
                timestamp_cutoff=_u64(_require(raw, what, "timestamp_cutoff")),
                covered=int(_get_any(raw, "covered") or 0),
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid accepted checkpoint: {exc}") from exc


_Details = TypeVar("_Details", bound="DataclassInstance")


def parse_refusal_details(cls: type[_Details], raw: Any) -> _Details | None:
    if not isinstance(raw, dict):
        return None
    values: dict[str, Any] = {}
    for f in dataclasses.fields(cls):
        if f.name not in raw or raw[f.name] is None:
            if f.default is dataclasses.MISSING:
                return None
            continue
        value = raw[f.name]
        try:
            values[f.name] = parse_u256(value) if f.type == "int" else str(value)
        except (ValidationError, ValueError, TypeError):
            return None
    return cls(**values)


@dataclass
class CheckpointRequiredDetails:
    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    uncheckpointed: int
    max_uncheckpointed: int


@dataclass
class TimestampNotPastCutoffDetails:
    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    timestamp: int
    timestamp_cutoff: int
    """A request must be stamped strictly later than this."""
    cumulative_gross: int
    server_time: int


@dataclass
class CycleMismatchDetails:
    signed_cycle_id: str
    active_cycle_id: str
    active_cycle_id_text: str
    active_period_end: int
    server_time: int = 0


@dataclass
class FutureTimestampDetails:
    timestamp: int
    server_time: int


@dataclass
class StaleTimestampDetails:
    cycle_id: str
    cycle_id_text: str
    timestamp: int
    period_start: int
    period_end: int
    server_time: int


@dataclass
class CheckpointMismatchDetails:
    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str


@dataclass
class CorePublicParameters:
    contract_address: str
    """The Treasury (collateral vault) contract."""
    eip712_name: str
    eip712_version: str
    chain_id: int
    guarantee_signer: str = ""
    """The address whose signature attests the operator's guarantee receipts."""
    guarantee_registry_address: str = ""
    clearing_house_address: str = ""
    ethereum_http_rpc_url: str = ""
    supported_payment_payload_versions: list[int] = field(
        default_factory=lambda: [PAYMENT_PAYLOAD_VERSION]
    )
    core_domain_separator: str = ""
    validators: list[str] = field(default_factory=list)
    """A validation requirement may only name one of these."""

    def __post_init__(self) -> None:
        self.chain_id = int(self.chain_id)
        self.supported_payment_payload_versions = [
            int(v) for v in self.supported_payment_payload_versions
        ]

    @classmethod
    def from_rpc(cls, payload: dict[str, Any]) -> CorePublicParameters:
        def require(*keys: str) -> Any:
            value = _get_any(payload, *keys)
            if value is None:
                raise InvalidParamsError(f"missing core public parameter: {keys[0]}")
            return value

        def optional(*keys: str) -> str:
            return str(_get_any(payload, *keys) or "")

        # Absent: an older core accepting what this SDK signs. Empty: accepts none.
        versions_raw = _get_any(
            payload,
            "supported_payment_payload_versions",
            "supportedPaymentPayloadVersions",
        )
        versions = (
            [int(v) for v in versions_raw]
            if isinstance(versions_raw, list)
            else [PAYMENT_PAYLOAD_VERSION]
        )

        core_domain_separator = optional("core_domain_separator", "coreDomainSeparator")
        if core_domain_separator:
            core_domain_separator = normalize_bytes32_hex(core_domain_separator)

        return cls(
            contract_address=str(require("contract_address", "contractAddress")),
            eip712_name=str(require("eip712_name", "eip712Name")),
            eip712_version=str(require("eip712_version", "eip712Version")),
            chain_id=int(require("chain_id", "chainId")),
            guarantee_signer=optional("guarantee_signer", "guaranteeSigner"),
            guarantee_registry_address=optional(
                "guarantee_registry_address", "guaranteeRegistryAddress"
            ),
            clearing_house_address=optional(
                "clearing_house_address", "clearingHouseAddress"
            ),
            ethereum_http_rpc_url=optional(
                "ethereum_http_rpc_url", "ethereumHttpRpcUrl"
            ),
            supported_payment_payload_versions=versions,
            core_domain_separator=core_domain_separator,
            validators=[str(v) for v in _get_any(payload, "validators") or []],
        )


@dataclass
class SupportedTokenInfo:
    symbol: str
    address: str
    decimals: int
    domain_separator: str | None = None
    """The token's own ``DOMAIN_SEPARATOR()``, relayed by core. ``None`` for
    tokens that do not expose one."""


@dataclass
class SupportedTokensResponse:
    chain_id: int
    tokens: list[SupportedTokenInfo]

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> SupportedTokensResponse:
        tokens = []
        for t in raw.get("tokens", []):
            address = str(t.get("address", ""))
            symbol = t.get("symbol")
            if not isinstance(symbol, str) or not symbol:
                raise InvalidParamsError(
                    f"core's token list has no symbol for {address}"
                )
            try:
                decimals = _token_decimals(t.get("decimals"))
            except ValueError:
                raise InvalidParamsError(
                    f"core's token list has no valid decimals for {address}"
                ) from None
            tokens.append(
                SupportedTokenInfo(
                    symbol=symbol,
                    address=address,
                    decimals=decimals,
                    domain_separator=_get_any(t, "domain_separator", "domainSeparator"),
                )
            )
        return cls(
            chain_id=int(_get_any(raw, "chain_id", "chainId") or 0), tokens=tokens
        )


def _token_decimals(raw: Any) -> int:
    if isinstance(raw, str) and raw.strip().isdigit():
        raw = int(raw)
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 0:
        raise ValueError("not a non-negative integer")
    return raw


class ClearingParticipantRole(str, Enum):
    NET_DEBTOR = "NET_DEBTOR"
    NET_CREDITOR = "NET_CREDITOR"


class ClearingSettlementAction(str, Enum):
    PAY_NET_DEBIT = "pay_net_debit"
    CLAIM_NET_CREDIT = "claim_net_credit"


@dataclass
class ClearingParticipantProof:
    cycle_id: str
    """On-chain bytes32 cycle id."""
    cycle_id_text: str
    """Core's text id (``{asset}:{period_start}``)."""
    asset_address: str
    participant: str
    role: ClearingParticipantRole
    amount: int
    net_debit: int
    net_credit: int
    leaf: str
    merkle_root: str
    proof: list[str]

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> ClearingParticipantProof:
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
    contract_address: str
    function_name: str
    action: ClearingSettlementAction
    cycle_id: str
    """On-chain bytes32 cycle id."""
    cycle_id_text: str
    asset_address: str
    participant: str
    amount: int
    payable_value: int
    """Native value to attach; non-zero only for native-asset debtor payments."""
    proof: list[str]

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> ClearingSettlementActionResponse:
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
    def from_rpc(cls, raw: dict[str, Any]) -> AssetBalanceInfo:
        return cls(
            user_address=_get_any(raw, "user_address", "userAddress"),
            asset_address=_get_any(raw, "asset_address", "assetAddress"),
            total=parse_u256(_get_any(raw, "total")),
            locked=parse_u256(_get_any(raw, "locked")),
            version=int(_get_any(raw, "version")),
            updated_at=int(_get_any(raw, "updated_at", "updatedAt")),
        )


@dataclass
class ClearingPosition:
    cycle_id: str
    """On-chain bytes32 cycle id."""
    cycle_id_text: str
    """Core's text id (``{asset}:{period_start}``), as ``settlement.pay(...)``
    and ``settlement.claim(...)`` take it."""
    asset_address: str
    role: ClearingParticipantRole
    amount: int
    gross_outgoing: int
    gross_incoming: int
    payment_submission_deadline: int
    """Unix seconds on the chain's clock. A debtor's payment is refused after
    it."""
    payment_finality_deadline: int
    """Unix seconds on the chain's clock. After it, an unpaid debit is taken
    from the debtor's collateral."""
    commit_confirmed: bool
    """Until it is, a payment can revert, and both deadlines are core's
    estimate."""

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> ClearingPosition:
        # Every field moves money or a deadline: missing is refused, not defaulted.
        def required(*keys: str) -> Any:
            value = _get_any(raw, *keys)
            if value is None:
                raise InvalidParamsError(
                    f"invalid clearing position: missing {keys[0]}"
                )
            return value

        def unix_seconds(*keys: str) -> int:
            value = required(*keys)
            if isinstance(value, bool) or not isinstance(value, (int, str)):
                raise InvalidParamsError(
                    f"invalid clearing position: {keys[0]} is not a time"
                )
            try:
                seconds = int(value)
            except ValueError:
                seconds = 0
            if seconds <= 0:
                raise InvalidParamsError(
                    f"invalid clearing position: {keys[0]} is not a time"
                )
            return seconds

        role = str(required("role"))
        if role not in ClearingParticipantRole.__members__:
            raise InvalidParamsError(f"invalid clearing position: unknown role {role}")
        commit_confirmed = required("commit_confirmed", "commitConfirmed")
        if not isinstance(commit_confirmed, bool):
            raise InvalidParamsError(
                "invalid clearing position: commit_confirmed is not a boolean"
            )
        try:
            return cls(
                cycle_id=normalize_bytes32_hex(str(required("cycle_id", "cycleId"))),
                cycle_id_text=str(required("cycle_id_text", "cycleIdText")),
                asset_address=normalize_address(
                    str(required("asset_address", "assetAddress"))
                ),
                role=ClearingParticipantRole(role),
                amount=parse_u256(required("amount")),
                gross_outgoing=parse_u256(required("gross_outgoing", "grossOutgoing")),
                gross_incoming=parse_u256(required("gross_incoming", "grossIncoming")),
                payment_submission_deadline=unix_seconds(
                    "payment_submission_deadline", "paymentSubmissionDeadline"
                ),
                payment_finality_deadline=unix_seconds(
                    "payment_finality_deadline", "paymentFinalityDeadline"
                ),
                commit_confirmed=commit_confirmed,
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid clearing position: {exc}") from exc


GUARANTEE_STATUSES = (
    "ISSUED",
    "PENDING_VALIDATION",
    "FINALIZED_PAYABLE",
    "DISPUTED",
    "CANCELLED",
    "NETTED",
    "SETTLED",
    "DEFAULT_REMUNERATED",
)


@dataclass
class PayerGuaranteeInfo:
    guarantee_id: str
    recipient: str
    req_id: int
    amount: int
    timestamp: int
    """Unix seconds."""
    status: str
    """One of :data:`GUARANTEE_STATUSES`, or a newer one as core sent it."""

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> PayerGuaranteeInfo:
        return cls(
            guarantee_id=str(_get_any(raw, "guarantee_id", "guaranteeId") or ""),
            recipient=normalize_address(str(_get_any(raw, "recipient"))),
            req_id=parse_u256(_get_any(raw, "req_id", "reqId") or 0),
            amount=parse_u256(_get_any(raw, "amount") or 0),
            timestamp=int(_get_any(raw, "timestamp") or 0),
            status=str(_get_any(raw, "status")),
        )


@dataclass
class PayerGuaranteesPage:
    cycle_id: str
    """On-chain bytes32 cycle id."""
    cycle_id_text: str
    asset_address: str
    payer: str
    guarantees: list[PayerGuaranteeInfo]
    next_cursor: str | None = None
    """Pass back as ``after`` for the next page. ``None`` on the last one."""

    @classmethod
    def from_rpc(cls, raw: dict[str, Any]) -> PayerGuaranteesPage:
        try:
            items = _get_any(raw, "guarantees")
            cursor = _get_any(raw, "next_cursor", "nextCursor")
            return cls(
                cycle_id=normalize_bytes32_hex(
                    str(_get_any(raw, "cycle_id", "cycleId"))
                ),
                cycle_id_text=str(_get_any(raw, "cycle_id_text", "cycleIdText")),
                asset_address=normalize_address(
                    str(_get_any(raw, "asset_address", "assetAddress"))
                ),
                payer=normalize_address(str(_get_any(raw, "payer"))),
                guarantees=[
                    PayerGuaranteeInfo.from_rpc(item)
                    for item in (items if isinstance(items, list) else [])
                ],
                next_cursor=cursor if isinstance(cursor, str) and cursor else None,
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise InvalidParamsError(f"invalid guarantee list: {exc}") from exc


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
    def from_rpc(cls, raw: dict[str, Any]) -> RecipientPaymentInfo:
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
    def from_rpc(cls, raw: dict[str, Any]) -> UserSuspensionStatus:
        return cls(
            user_address=_get_any(raw, "user_address", "userAddress"),
            suspended=bool(_get_any(raw, "suspended")),
            updated_at=int(_get_any(raw, "updated_at", "updatedAt")),
        )


@dataclass
class TxReceiptWaitOptions:
    timeout_secs: int = 60
    poll_latency_secs: int = 2


__all__: list[str] = [
    "PAYMENT_PAYLOAD_VERSION",
    "ZERO_ADDRESS",
    "ActiveCycleResponse",
    "AssetBalanceInfo",
    "CheckpointAcceptedResponse",
    "CheckpointBatchResponse",
    "CheckpointMismatchDetails",
    "CheckpointPayload",
    "CheckpointRequiredDetails",
    "ClearingParticipantProof",
    "ClearingParticipantRole",
    "ClearingSettlementAction",
    "ClearingSettlementActionResponse",
    "CorePublicParameters",
    "CycleMismatchDetails",
    "FutureTimestampDetails",
    "PaymentRequest",
    "PaymentRequestPayload",
    "RecipientPaymentInfo",
    "SignedCheckpoint",
    "StaleTimestampDetails",
    "SupportedTokenInfo",
    "SupportedTokensResponse",
    "TimestampNotPastCutoffDetails",
    "TxReceiptWaitOptions",
    "UserSuspensionStatus",
    "ValidationRequirement",
]
