"""Wire types mirroring the core service's ``rpc-4mica`` crate.

Core serializes snake_case JSON (``SiweTemplate`` in :mod:`.auth` is the one
camelCase exception); ``from_rpc`` parsers accept both spellings defensively.
U256 amounts serialize as 0x-prefixed hex, matching the Rust types.
"""

from __future__ import annotations

import dataclasses
import secrets
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Type, TypeVar, Union

from .errors import InvalidParamsError
from .guarantee import checkpoint_signing_digest, payment_signing_digest
from .utils import (
    ValidationError,
    normalize_address,
    normalize_bytes32_hex,
    parse_address,
    parse_u256,
    serialize_u256,
)

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

#: Current payment payload version. Clients always sign at this version; core
#: accepts every version it advertises so older clients keep working.
PAYMENT_PAYLOAD_VERSION = 1

#: Payment payload versions this SDK can read, keyed by their wire tag.
_PAYLOAD_VERSION_TAGS: Dict[str, int] = {"v1": PAYMENT_PAYLOAD_VERSION}

_U64_MAX = 2**64 - 1


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


def _payload_address(field_name: str, raw: Any) -> str:
    """Validates an address a signed payload carries, keeping its spelling:
    the payload is what the payer signed over, and a resource server may
    compare the recipient as a string."""
    value = str(raw).strip()
    parse_address(value, field_name)
    return value


def _bytes32(raw: Union[str, bytes]) -> str:
    if isinstance(raw, (bytes, bytearray)):
        if len(raw) != 32:
            raise ValidationError(f"expected 32 bytes, got {len(raw)}")
        return "0x" + bytes(raw).hex()
    return normalize_bytes32_hex(raw)


def _u64(raw: Any) -> int:
    value = int(raw)
    if not 0 <= value <= _U64_MAX:
        raise ValidationError(f"value out of u64 range: {raw}")
    return value


def _require(raw: Dict[str, Any], what: str, *keys: str) -> Any:
    value = _get_any(raw, *keys)
    if value is None:
        raise InvalidParamsError(f"{what} is missing {keys[0]}")
    return value


@dataclass
class PaymentRequestPayload:
    """V1 payment request payload.

    What the payer's wallet signs is the ``PaymentAuthorization`` derived from
    these: the collateral-relevant fields plus a commitment to the recipient.
    The recipient, the ``salt`` that blinds it and any validation requirement
    travel alongside as the commitment's opening, so core can check them while
    the on-chain default path never sees them.
    """

    user_address: str
    recipient_address: str
    cycle_id: str
    """On-chain bytes32 settlement cycle id the authorization is scoped to."""
    req_id: int
    amount: int
    asset_address: str
    timestamp: int
    salt: str
    """Random bytes32 blinding the recipient commitment. Must be
    unpredictable, or the recipient can be recovered by trying candidates."""
    validation: Optional[ValidationRequirement] = None
    """Present ⇒ the guarantee is validation-gated. Absent ⇒ payable at
    issuance."""

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
        cycle_id: Union[str, bytes],
        req_id: int,
        amount: int,
        timestamp: int,
        erc20_token: Optional[str] = None,
        salt: Union[str, bytes, None] = None,
    ) -> "PaymentRequestPayload":
        """A payload at the current version. *salt* defaults to fresh random
        bytes, which is what it must be outside of test vectors."""
        return cls(
            user_address=user_address,
            recipient_address=recipient_address,
            cycle_id=cycle_id,
            req_id=req_id,
            amount=amount,
            asset_address=erc20_token or ZERO_ADDRESS,
            timestamp=timestamp,
            salt=salt if salt is not None else secrets.token_bytes(32),
        )

    @property
    def version(self) -> int:
        return PAYMENT_PAYLOAD_VERSION

    def with_validation(
        self, validation: ValidationRequirement
    ) -> "PaymentRequestPayload":
        return dataclasses.replace(self, validation=validation)

    def signing_digest(self, domain_separator: Union[str, bytes]) -> bytes:
        """The digest the payer's wallet signs, under the ClearingHouse
        domain separator."""
        return payment_signing_digest(self, domain_separator)

    def to_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
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
    def from_rpc(cls, raw: Dict[str, Any]) -> "PaymentRequestPayload":
        """Parses a tagged payload. The version tag is what selects a layout,
        so a payload without one, or with one this SDK does not know, is
        refused rather than defaulted."""
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
    """A payer-signed payment request: EIP-712 over the payload's
    ``PaymentAuthorization``, under the ClearingHouse domain."""

    payload: PaymentRequestPayload
    signature: str
    """65-byte signature as 0x-prefixed hex."""

    def to_payload(self) -> Dict[str, Any]:
        return {"payload": self.payload.to_payload(), "signature": self.signature}

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "PaymentRequest":
        return cls(
            payload=PaymentRequestPayload.from_rpc(
                _require(raw, "payment request", "payload")
            ),
            signature=str(_require(raw, "payment request", "signature")),
        )


@dataclass
class CheckpointPayload:
    """A payer's cumulative authorization for one cycle and asset, as signed
    by the payer. Covers every one of the payer's authorizations in the cycle
    stamped at or below ``timestamp_cutoff``."""

    payer: str
    cycle_id: str
    """On-chain bytes32 settlement cycle id."""
    asset_address: str
    cumulative_gross: int
    timestamp_cutoff: int

    def __post_init__(self) -> None:
        self.payer = _payload_address("payer", self.payer)
        self.cycle_id = _bytes32(self.cycle_id)
        self.asset_address = _payload_address("asset", self.asset_address)
        self.cumulative_gross = parse_u256(self.cumulative_gross)
        self.timestamp_cutoff = _u64(self.timestamp_cutoff)

    def signing_digest(self, domain_separator: Union[str, bytes]) -> bytes:
        """The digest the payer's wallet signs, under the ClearingHouse
        domain separator."""
        return checkpoint_signing_digest(self, domain_separator)

    def to_payload(self) -> Dict[str, Any]:
        return {
            "payer": self.payer,
            "cycle_id": self.cycle_id,
            "asset_address": self.asset_address,
            "cumulative_gross": serialize_u256(self.cumulative_gross),
            "timestamp_cutoff": self.timestamp_cutoff,
        }

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "CheckpointPayload":
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
    """A checkpoint with the payer's EIP-712 signature over it, under the
    ClearingHouse domain."""

    payload: CheckpointPayload
    signature: str
    """65-byte signature as 0x-prefixed hex."""

    def to_payload(self) -> Dict[str, Any]:
        return {"payload": self.payload.to_payload(), "signature": self.signature}

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "SignedCheckpoint":
        return cls(
            payload=CheckpointPayload.from_rpc(
                _require(raw, "signed checkpoint", "payload")
            ),
            signature=str(_require(raw, "signed checkpoint", "signature")),
        )


@dataclass
class ActiveCycleResponse:
    """``GET /core/cycles/active?asset=``: the cycle a payment for *asset*
    must be signed for right now."""

    cycle_id: str
    """On-chain bytes32 cycle id, the value a payment request is signed with."""
    cycle_id_text: str
    asset_address: str
    period_start: int
    """Unix seconds; a payment stamped earlier is refused as stale."""
    period_end: int
    """Unix seconds; core opens the next cycle from this moment on."""
    server_time: int = 0
    """Core's clock, unix seconds. Zero from a core that predates it."""
    max_uncheckpointed: int = 0
    """How many guarantees a payer may hold past its latest checkpoint before
    core refuses the next with ``CHECKPOINT_REQUIRED``. Zero from a core that
    predates it."""

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "ActiveCycleResponse":
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
    """``GET /core/payers/{payer}/checkpoint-batch``: what a payer needs to
    sign its next checkpoint. Untrusted until checked — see
    :meth:`~fourmica_sdk.client.payment.PaymentClient.checkpoint_cycle`."""

    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    previous: Optional[SignedCheckpoint]
    """The latest accepted checkpoint, which the next one extends. ``None``
    for a cycle's first checkpoint."""
    authorizations: List[PaymentRequest]
    """Every accepted authorization newer than ``previous``."""
    max_uncheckpointed: int = 0

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "CheckpointBatchResponse":
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
    """``POST /core/checkpoints``: the checkpoint core now holds."""

    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    cumulative_gross: int
    timestamp_cutoff: int
    covered: int
    """Authorizations this checkpoint newly covers. Zero when it repeats the
    latest accepted one, which core accepts rather than refuses."""

    @classmethod
    def from_rpc(cls, raw: Dict[str, Any]) -> "CheckpointAcceptedResponse":
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


# --- details core attaches to its coded refusals -------------------------
#
# Shapes from ``crates/rpc/src/core.rs``. Ids stay as core spelled them.

_Details = TypeVar("_Details")


def parse_refusal_details(cls: Type[_Details], raw: Any) -> Optional[_Details]:
    """*raw* decoded as *cls*, or ``None`` when it is absent or malformed —
    a refusal whose details cannot be read stays a plain RPC error."""
    if not isinstance(raw, dict):
        return None
    values: Dict[str, Any] = {}
    for f in dataclasses.fields(cls):  # type: ignore[arg-type]
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
    """``CHECKPOINT_REQUIRED``: the payer hit the uncheckpointed bound."""

    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str
    uncheckpointed: int
    max_uncheckpointed: int


@dataclass
class TimestampNotPastCutoffDetails:
    """``TIMESTAMP_NOT_PAST_CUTOFF``: stamped at or before the payer's latest
    checkpoint cutoff, where nothing could ever cover it."""

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
    """``CYCLE_MISMATCH``: signed for a cycle other than the active one."""

    signed_cycle_id: str
    active_cycle_id: str
    active_cycle_id_text: str
    active_period_end: int
    server_time: int = 0


@dataclass
class FutureTimestampDetails:
    """``FUTURE_TIMESTAMP``: stamped later than core's clock."""

    timestamp: int
    server_time: int


@dataclass
class StaleTimestampDetails:
    """``STALE_TIMESTAMP``: names the active cycle but stamped before it
    opened, usually because the payer's clock is behind."""

    cycle_id: str
    cycle_id_text: str
    timestamp: int
    period_start: int
    period_end: int
    server_time: int


@dataclass
class CheckpointMismatchDetails:
    """``CHECKPOINT_MISMATCH``: the checkpoint no longer matches what core
    holds, typically because a guarantee landed after the batch was read."""

    cycle_id: str
    cycle_id_text: str
    asset_address: str
    payer: str


@dataclass
class CorePublicParameters:
    """Static parameters exposed by the core service (``GET /core/public-params``)."""

    contract_address: str
    """The on-chain Treasury (collateral vault) contract."""
    eip712_name: str
    """EIP-712 domain name for payer-signed payloads; always
    ``4micaClearingHouse``."""
    eip712_version: str
    chain_id: int
    guarantee_signer: str = ""
    """The address whose signature attests the operator's guarantee receipts,
    as registered on-chain for the layout core signs."""
    guarantee_registry_address: str = ""
    """Verifying contract of the domain guarantee receipts are signed under."""
    clearing_house_address: str = ""
    """Verifying contract of the domain every payer-signed payload (payment
    request, checkpoint) is signed under."""
    ethereum_http_rpc_url: str = ""
    supported_payment_payload_versions: List[int] = field(
        default_factory=lambda: [PAYMENT_PAYLOAD_VERSION]
    )
    core_domain_separator: str = ""
    """The Treasury's own EIP-712 ``DOMAIN_SEPARATOR()``, read on-chain by core."""
    validators: List[str] = field(default_factory=list)
    """Validators this operator whitelisted; a validation requirement may only
    name one of these."""

    def __post_init__(self) -> None:
        self.chain_id = int(self.chain_id)
        self.supported_payment_payload_versions = [
            int(v) for v in self.supported_payment_payload_versions
        ]

    @classmethod
    def from_rpc(cls, payload: Dict[str, Any]) -> "CorePublicParameters":
        def require(*keys: str) -> Any:
            value = _get_any(payload, *keys)
            if value is None:
                raise InvalidParamsError(f"missing core public parameter: {keys[0]}")
            return value

        def optional(*keys: str) -> str:
            return str(_get_any(payload, *keys) or "")

        # Absent means a core that predates the field, which accepts what this
        # SDK signs; present-but-empty means a core that accepts nothing.
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
    "PAYMENT_PAYLOAD_VERSION",
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
    "ZERO_ADDRESS",
]
