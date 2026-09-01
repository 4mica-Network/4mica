from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, Optional, Protocol, Union
from urllib.parse import urljoin

import httpx

from .errors import X402Error
from .models import (
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    PaymentGuaranteeValidationPolicyV2,
    PaymentSignature,
    SigningScheme,
)
from .utils import (
    ValidationError,
    normalize_address,
    normalize_bytes32_hex,
    parse_u256,
    validate_url,
)
from .validation import (
    compute_validation_request_hash,
    compute_validation_subject_hash,
)

if TYPE_CHECKING:
    from .client import Client


def _pick(raw: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    """Return the first present, non-None value from raw by key priority."""
    for key in keys:
        if key in raw and raw[key] is not None:
            return raw[key]
    return default


@dataclass
class PaymentRequirementsV1:
    scheme: str
    network: str
    max_amount_required: str
    pay_to: str
    asset: str
    extra: Dict[str, Any]
    resource: Optional[str] = None
    description: Optional[str] = None
    mime_type: Optional[str] = None
    output_schema: Optional[Any] = None
    max_timeout_seconds: Optional[int] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "PaymentRequirementsV1":
        amount = _pick(raw, "maxAmountRequired")
        pay_to = _pick(raw, "payTo")
        asset = _pick(raw, "asset")
        scheme = _pick(raw, "scheme")
        network = _pick(raw, "network")
        if not all([amount, pay_to, asset, scheme, network]):
            missing = [
                k
                for k, v in [
                    ("scheme", scheme),
                    ("network", network),
                    ("maxAmountRequired", amount),
                    ("payTo", pay_to),
                    ("asset", asset),
                ]
                if not v
            ]
            raise X402Error(
                f"payment requirements missing fields: {', '.join(missing)}"
            )

        return cls(
            scheme=scheme,
            network=network,
            max_amount_required=str(amount),
            pay_to=pay_to,
            asset=asset,
            extra=_pick(raw, "extra", default={}) or {},
            resource=_pick(raw, "resource"),
            description=_pick(raw, "description"),
            mime_type=_pick(raw, "mimeType"),
            output_schema=_pick(raw, "outputSchema"),
            max_timeout_seconds=_pick(raw, "maxTimeoutSeconds"),
        )

    def to_payload(self) -> Dict[str, Any]:
        payload = {
            "scheme": self.scheme,
            "network": self.network,
            "maxAmountRequired": self.max_amount_required,
            "payTo": self.pay_to,
            "asset": self.asset,
            "extra": dict(self.extra or {}),
        }
        if self.resource is not None:
            payload["resource"] = self.resource
        if self.description is not None:
            payload["description"] = self.description
        if self.mime_type is not None:
            payload["mimeType"] = self.mime_type
        if self.output_schema is not None:
            payload["outputSchema"] = self.output_schema
        if self.max_timeout_seconds is not None:
            payload["maxTimeoutSeconds"] = self.max_timeout_seconds
        return payload


@dataclass
class PaymentRequirementsV2:
    scheme: str
    network: str
    asset: str
    amount: str
    pay_to: str
    extra: Dict[str, Any]
    max_timeout_seconds: Optional[int] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "PaymentRequirementsV2":
        amount = _pick(raw, "amount")
        pay_to = _pick(raw, "payTo")
        asset = _pick(raw, "asset")
        scheme = _pick(raw, "scheme")
        network = _pick(raw, "network")
        if not all([amount, pay_to, asset, scheme, network]):
            missing = [
                k
                for k, v in [
                    ("scheme", scheme),
                    ("network", network),
                    ("amount", amount),
                    ("payTo", pay_to),
                    ("asset", asset),
                ]
                if not v
            ]
            raise X402Error(
                f"payment requirements missing fields: {', '.join(missing)}"
            )

        max_timeout_seconds = _pick(raw, "maxTimeoutSeconds")
        if max_timeout_seconds is not None:
            max_timeout_seconds = int(max_timeout_seconds)

        return cls(
            scheme=scheme,
            network=network,
            asset=asset,
            amount=str(amount),
            pay_to=pay_to,
            extra=_pick(raw, "extra", default={}) or {},
            max_timeout_seconds=max_timeout_seconds,
        )

    def to_payload(self) -> Dict[str, Any]:
        payload = {
            "scheme": self.scheme,
            "network": self.network,
            "asset": self.asset,
            "amount": self.amount,
            "payTo": self.pay_to,
            "extra": dict(self.extra or {}),
        }
        if self.max_timeout_seconds is not None:
            payload["maxTimeoutSeconds"] = self.max_timeout_seconds
        return payload


@dataclass
class PaymentRequirementsExtra:
    tab_endpoint: Optional[str]
    validation_registry_address: Optional[str] = None
    validation_chain_id: Optional[int] = None
    validator_address: Optional[str] = None
    validator_agent_id: Optional[int] = None
    min_validation_score: Optional[int] = None
    required_validation_tag: Optional[str] = None
    job_hash: Optional[str] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "PaymentRequirementsExtra":
        raw = raw or {}
        if not isinstance(raw, dict):
            raise X402Error("invalid paymentRequirements.extra")
        tab_endpoint = raw.get("tabEndpoint")
        if tab_endpoint is not None:
            try:
                tab_endpoint = validate_url(str(tab_endpoint))
            except ValidationError as exc:
                raise X402Error(f"invalid tabEndpoint: {exc}") from exc
        validation_registry_address = raw.get("validationRegistryAddress")
        if validation_registry_address is not None:
            try:
                validation_registry_address = normalize_address(
                    str(validation_registry_address)
                )
            except ValidationError as exc:
                raise X402Error(f"invalid validationRegistryAddress: {exc}") from exc

        validation_chain_id = raw.get("validationChainId")
        if validation_chain_id is not None:
            try:
                validation_chain_id = parse_u256(validation_chain_id)
            except ValidationError as exc:
                raise X402Error(f"invalid validationChainId: {exc}") from exc

        validator_address = raw.get("validatorAddress")
        if validator_address is not None:
            try:
                validator_address = normalize_address(str(validator_address))
            except ValidationError as exc:
                raise X402Error(f"invalid validatorAddress: {exc}") from exc

        validator_agent_id = raw.get("validatorAgentId")
        if validator_agent_id is not None:
            try:
                validator_agent_id = parse_u256(validator_agent_id)
            except ValidationError as exc:
                raise X402Error(f"invalid validatorAgentId: {exc}") from exc

        min_validation_score = raw.get("minValidationScore")
        if min_validation_score is not None:
            try:
                min_validation_score = int(min_validation_score)
            except (TypeError, ValueError) as exc:
                raise X402Error(
                    f"invalid minValidationScore: {min_validation_score}"
                ) from exc

        required_validation_tag = raw.get("requiredValidationTag")
        if required_validation_tag is not None:
            required_validation_tag = str(required_validation_tag)

        job_hash = raw.get("jobHash")
        if job_hash is not None:
            try:
                job_hash = normalize_bytes32_hex(str(job_hash))
            except ValidationError as exc:
                raise X402Error(f"invalid jobHash: {exc}") from exc

        return cls(
            tab_endpoint=tab_endpoint,
            validation_registry_address=validation_registry_address,
            validation_chain_id=validation_chain_id,
            validator_address=validator_address,
            validator_agent_id=validator_agent_id,
            min_validation_score=min_validation_score,
            required_validation_tag=required_validation_tag,
            job_hash=job_hash,
        )


@dataclass
class TabResponse:
    tab_id: int
    user_address: str
    next_req_id: Optional[int] = None


@dataclass
class X402ResourceInfo:
    url: str
    description: str
    mime_type: str

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "X402ResourceInfo":
        if not isinstance(raw, dict):
            raise X402Error("invalid resource info")
        url = raw.get("url")
        description = raw.get("description")
        mime_type = raw.get("mimeType")
        if not all([url, description, mime_type]):
            raise X402Error("resource info missing fields")
        return cls(url=str(url), description=str(description), mime_type=str(mime_type))

    def to_payload(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "description": self.description,
            "mimeType": self.mime_type,
        }


@dataclass
class X402PaymentRequired:
    x402_version: int
    resource: X402ResourceInfo
    accepts: list[PaymentRequirementsV2]
    error: Optional[str] = None
    extensions: Optional[Dict[str, Any]] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "X402PaymentRequired":
        if not isinstance(raw, dict):
            raise X402Error("invalid payment required payload")
        x402_version = raw.get("x402Version")
        if x402_version is None:
            raise X402Error("missing x402Version")
        resource = X402ResourceInfo.from_raw(raw.get("resource") or {})
        accepts_raw = raw.get("accepts") or []
        accepts = [PaymentRequirementsV2.from_raw(a) for a in accepts_raw]
        return cls(
            x402_version=int(x402_version),
            resource=resource,
            accepts=accepts,
            error=raw.get("error"),
            extensions=raw.get("extensions"),
        )


@dataclass
class X402PaymentEnvelopeV1:
    x402_version: int
    scheme: str
    network: str
    payload: Dict[str, Any]

    def to_payload(self) -> Dict[str, Any]:
        return {
            "x402Version": self.x402_version,
            "scheme": self.scheme,
            "network": self.network,
            "payload": self.payload,
        }


@dataclass
class X402PaymentEnvelopeV2:
    x402_version: int
    accepted: PaymentRequirementsV2
    payload: Dict[str, Any]
    resource: X402ResourceInfo

    def to_payload(self) -> Dict[str, Any]:
        return {
            "x402Version": self.x402_version,
            "accepted": self.accepted.to_payload(),
            "payload": self.payload,
            "resource": self.resource.to_payload(),
        }


@dataclass
class X402SignedPayment:
    header: str
    payload: Dict[str, Any]
    signature: PaymentSignature


@dataclass
class SettlementReceipt:
    """Typed settlement response from the facilitator's settle endpoint."""

    tab_id: Optional[str]
    guarantee: Optional[Dict[str, Any]]
    receipt: Optional[Dict[str, Any]]
    raw: Dict[str, Any]

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "SettlementReceipt":
        if not isinstance(raw, dict):
            raw = {}
        return cls(
            tab_id=raw.get("tabId") or raw.get("tab_id"),
            guarantee=raw.get("guarantee"),
            receipt=raw.get("receipt"),
            raw=raw,
        )


@dataclass
class X402SettledPayment:
    payment: X402SignedPayment
    settlement: SettlementReceipt


class FlowSigner(Protocol):
    async def sign_payment(
        self,
        claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
        scheme: SigningScheme,
    ) -> PaymentSignature: ...


class X402Flow:
    def __init__(
        self, signer: FlowSigner, client: Optional[httpx.AsyncClient] = None
    ) -> None:
        self.signer = signer
        self.http = client or httpx.AsyncClient()

    @classmethod
    def from_client(cls, client: "Client") -> "X402Flow":  # type: ignore[name-defined]
        return cls(client.user)  # Client.user implements sign_payment

    async def sign_payment(
        self, payment_requirements: PaymentRequirementsV1, user_address: str
    ) -> X402SignedPayment:
        self._validate_scheme(payment_requirements.scheme)
        tab = await self._request_tab(1, payment_requirements, user_address)
        claims = self._build_claims(payment_requirements, tab, user_address)
        try:
            signature = await self.signer.sign_payment(claims, SigningScheme.EIP712)
        except Exception as exc:
            raise X402Error(f"failed to sign payment: {exc}") from exc

        payment_payload = self._build_payment_payload(claims, signature)
        envelope = self._build_envelope_v1(payment_requirements, payment_payload)
        envelope_payload = envelope.to_payload()
        # Backwards-compatibility: facilitators require x402Version at the top level.
        envelope_payload.setdefault("x402Version", envelope.x402_version)
        header_bytes = base64.b64encode(
            self._json_dumps(envelope_payload).encode()
        ).decode()
        return X402SignedPayment(
            header=header_bytes, payload=payment_payload, signature=signature
        )

    async def sign_payment_v2(
        self,
        payment_required: X402PaymentRequired,
        accepted: PaymentRequirementsV2,
        user_address: str,
    ) -> X402SignedPayment:
        self._validate_scheme(accepted.scheme)
        tab = await self._request_tab(
            2, accepted, user_address, payment_required.resource
        )
        claims = self._build_claims_v2(accepted, tab, user_address)
        try:
            signature = await self.signer.sign_payment(claims, SigningScheme.EIP712)
        except Exception as exc:
            raise X402Error(f"failed to sign payment: {exc}") from exc

        payment_payload = self._build_payment_payload(claims, signature)
        envelope = self._build_envelope_v2(
            accepted, payment_required.resource, payment_payload
        )
        envelope_payload = envelope.to_payload()
        envelope_payload.setdefault("x402Version", envelope.x402_version)
        header_bytes = base64.b64encode(
            self._json_dumps(envelope_payload).encode()
        ).decode()
        return X402SignedPayment(
            header=header_bytes, payload=payment_payload, signature=signature
        )

    async def settle_payment(
        self,
        payment: X402SignedPayment,
        payment_requirements: PaymentRequirementsV1,
        facilitator_url: str,
    ) -> X402SettledPayment:
        try:
            base_url = validate_url(facilitator_url)
        except ValidationError as exc:
            raise X402Error(f"invalid facilitator url: {exc}") from exc
        url = urljoin(base_url, "settle")
        try:
            response = await self.http.post(
                url,
                json={
                    "x402Version": 1,
                    "paymentHeader": payment.header,
                    "paymentRequirements": payment_requirements.to_payload(),
                },
            )
        except httpx.HTTPError as exc:
            raise X402Error(str(exc)) from exc
        try:
            settlement = response.json()
        except Exception as exc:
            raise X402Error(f"settlement response invalid JSON: {exc}") from exc
        if not response.is_success:
            raise X402Error(
                f"settlement failed with status {response.status_code}: {settlement}"
            )
        return X402SettledPayment(
            payment=payment, settlement=SettlementReceipt.from_raw(settlement)
        )

    async def _request_tab(
        self,
        x402_version: int,
        payment_requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
        user_address: str,
        resource: X402ResourceInfo | None = None,
    ) -> TabResponse:
        extra = PaymentRequirementsExtra.from_raw(payment_requirements.extra)
        if not extra.tab_endpoint:
            raise X402Error("missing tabEndpoint in paymentRequirements.extra")
        payload = {
            "x402Version": x402_version,
            "userAddress": user_address,
            "paymentRequirements": payment_requirements.to_payload(),
        }
        if resource is not None:
            payload["resource"] = resource.to_payload()
        try:
            response = await self.http.post(extra.tab_endpoint, json=payload)
        except httpx.HTTPError as exc:
            raise X402Error(str(exc)) from exc
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise X402Error(str(exc)) from exc
        try:
            body = response.json()
        except Exception as exc:
            raise X402Error(f"tab response invalid JSON: {exc}") from exc

        raw_tab_id = _pick(body, "tabId", "tab_id")
        raw_req_id = _pick(body, "nextReqId", "next_req_id", "reqId", "req_id")
        try:
            tab_id = parse_u256(raw_tab_id) if raw_tab_id is not None else 0
            next_req_id = parse_u256(raw_req_id) if raw_req_id is not None else None
        except ValidationError as exc:
            raise X402Error(f"invalid tab response fields: {exc}") from exc

        return TabResponse(
            tab_id=tab_id,
            user_address=_pick(body, "userAddress", "user_address"),
            next_req_id=next_req_id,
        )

    def _build_claims(
        self,
        requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
        tab: TabResponse,
        user_address: str,
    ) -> PaymentGuaranteeRequestClaims:
        amount_raw = (
            requirements.max_amount_required
            if isinstance(requirements, PaymentRequirementsV1)
            else requirements.amount
        )
        amount = self._parse_u256(amount_raw)
        if tab.user_address.lower() != user_address.lower():
            raise X402Error(
                f"user mismatch in paymentRequirements: found {tab.user_address}, expected {user_address}"
            )
        try:
            return PaymentGuaranteeRequestClaims.new(
                user_address,
                normalize_address(requirements.pay_to),
                tab.tab_id,
                tab.next_req_id if tab.next_req_id is not None else 0,
                amount,
                int(time.time()),
                requirements.asset,
            )
        except ValidationError as exc:
            raise X402Error(str(exc)) from exc

    def _build_claims_v2(
        self,
        requirements: PaymentRequirementsV2,
        tab: TabResponse,
        user_address: str,
    ) -> PaymentGuaranteeRequestClaimsV2:
        base = self._build_claims(requirements, tab, user_address)
        extra = PaymentRequirementsExtra.from_raw(requirements.extra)

        missing = []
        if extra.validation_registry_address is None:
            missing.append("validationRegistryAddress")
        if extra.validator_address is None:
            missing.append("validatorAddress")
        if extra.validator_agent_id is None:
            missing.append("validatorAgentId")
        if extra.min_validation_score is None:
            missing.append("minValidationScore")
        if extra.job_hash is None:
            missing.append("jobHash")
        if missing:
            raise X402Error(
                f"payment requirements missing V2 validation fields: {', '.join(missing)}"
            )

        expected_validation_chain_id = self._parse_validation_chain_id_from_network(
            requirements.network
        )
        if (
            extra.validation_chain_id is not None
            and extra.validation_chain_id != expected_validation_chain_id
        ):
            raise X402Error(
                "validationChainId does not match paymentRequirements.network: "
                f"{extra.validation_chain_id} != {expected_validation_chain_id}"
            )

        # Compute hashes in order: subject first (depends on base claims),
        # then request (depends on subject hash + policy inputs).
        # validation_request_hash is NOT an input to its own computation.
        validation_subject_hash = compute_validation_subject_hash(base)
        policy_inputs = PaymentGuaranteeValidationPolicyV2(
            validation_registry_address=extra.validation_registry_address,
            validation_request_hash="0x" + "00" * 32,  # placeholder, not used in hash
            validation_chain_id=expected_validation_chain_id,
            validator_address=extra.validator_address,
            validator_agent_id=extra.validator_agent_id,
            min_validation_score=extra.min_validation_score,
            validation_subject_hash=validation_subject_hash,
            required_validation_tag=extra.required_validation_tag or "",
            job_hash=extra.job_hash,
        )
        validation_request_hash = compute_validation_request_hash(policy_inputs)

        return PaymentGuaranteeRequestClaimsV2.new(
            user_address=base.user_address,
            recipient_address=base.recipient_address,
            tab_id=base.tab_id,
            req_id=base.req_id,
            amount=base.amount,
            timestamp=base.timestamp,
            erc20_token=base.asset_address,
            validation_registry_address=policy_inputs.validation_registry_address,
            validation_request_hash=validation_request_hash,
            validation_chain_id=policy_inputs.validation_chain_id,
            validator_address=policy_inputs.validator_address,
            validator_agent_id=policy_inputs.validator_agent_id,
            min_validation_score=policy_inputs.min_validation_score,
            validation_subject_hash=validation_subject_hash,
            required_validation_tag=policy_inputs.required_validation_tag,
            job_hash=policy_inputs.job_hash,
        )

    @staticmethod
    def _parse_validation_chain_id_from_network(network: str) -> int:
        prefix, sep, value = network.partition(":")
        if prefix != "eip155" or sep != ":" or not value:
            raise X402Error(
                f"invalid network '{network}': expected CAIP-2 eip155:<chainId>"
            )
        try:
            chain_id = int(value, 10)
        except ValueError as exc:
            raise X402Error(
                f"invalid network '{network}': chain id must be a decimal integer"
            ) from exc
        if chain_id <= 0:
            raise X402Error(
                f"invalid network '{network}': chain id must be greater than zero"
            )
        return chain_id

    @staticmethod
    def _validate_scheme(scheme: str) -> None:
        if "4mica" not in scheme.lower():
            raise X402Error(f"invalid scheme: {scheme}")

    @staticmethod
    def _parse_u256(raw: Optional[str]) -> int:
        try:
            return parse_u256(raw or "0")
        except ValidationError as exc:
            raise X402Error(f"invalid number for field {raw}: {exc}") from exc

    @staticmethod
    def _build_payment_payload(
        claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
        signature: PaymentSignature,
    ) -> Dict[str, Any]:
        return {
            "claims": claims.to_payload(),
            "signature": signature.signature,
            "scheme": signature.scheme.value,
        }

    @staticmethod
    def _build_envelope_v1(
        payment_requirements: PaymentRequirementsV1,
        payment_payload: Dict[str, Any],
    ) -> X402PaymentEnvelopeV1:
        return X402PaymentEnvelopeV1(
            x402_version=1,
            scheme=payment_requirements.scheme,
            network=payment_requirements.network,
            payload=payment_payload,
        )

    @staticmethod
    def _build_envelope_v2(
        accepted: PaymentRequirementsV2,
        resource: X402ResourceInfo,
        payment_payload: Dict[str, Any],
    ) -> X402PaymentEnvelopeV2:
        return X402PaymentEnvelopeV2(
            x402_version=2,
            accepted=accepted,
            payload=payment_payload,
            resource=resource,
        )

    @staticmethod
    def _json_dumps(obj: Any) -> str:
        import json

        def default(o: Any) -> Any:
            if isinstance(o, Enum):
                return o.value
            raise TypeError(
                f"Object of type {type(o).__name__} is not JSON serializable"
            )

        return json.dumps(obj, default=default)


# Backwards-compatible alias for older code
PaymentRequirements = PaymentRequirementsV1
