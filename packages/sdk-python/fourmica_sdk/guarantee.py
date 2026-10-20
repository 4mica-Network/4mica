"""EIP-712 payloads the payer and the operator sign, and the domains they are
signed under. Port of ``crates/rpc/src/guarantee/signing.rs``.

The ClearingHouse and GuaranteeRegistry contracts hash these same layouts when
they verify a signature, so the type strings below are pinned literals:
renaming a struct or reordering a field changes the type hash and invalidates
every signature already produced.

Payloads are read by attribute here rather than imported, so
:mod:`fourmica_sdk.models` can build on this module.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Union

from eth_abi import decode as abi_decode
from eth_abi import encode as abi_encode
from eth_keys import keys
from eth_utils import keccak

from .digest import eip712_digest, eip712_domain_separator
from .errors import (
    InvalidParamsError,
    MalformedReceiptError,
    ReceiptSignerMismatchError,
    UnreadableReceiptSignatureError,
)
from .utils import ValidationError, parse_address, parse_u256

#: EIP-712 domain the ClearingHouse verifies every payer-signed payload under.
CLEARING_HOUSE_EIP712_NAME = "4micaClearingHouse"
CLEARING_HOUSE_EIP712_VERSION = "1"

#: EIP-712 domain the GuaranteeRegistry verifies operator receipts under.
GUARANTEE_REGISTRY_EIP712_NAME = "4micaGuaranteeRegistry"
GUARANTEE_REGISTRY_EIP712_VERSION = "1"

#: What a payer authorizes per guarantee. The recipient is bound through
#: ``recipientCommitment`` so the on-chain default path can verify the
#: authorization without learning who was paid.
PAYMENT_AUTHORIZATION_TYPE = (
    "PaymentAuthorization(address payer,bytes32 cycleId,address asset,"
    "uint256 amount,uint256 reqId,uint64 timestamp,bytes32 recipientCommitment)"
)
#: A payer's cumulative authorization for one cycle and asset up to a cutoff.
CHECKPOINT_TYPE = (
    "Checkpoint(address payer,bytes32 cycleId,address asset,"
    "uint256 cumulativeGross,uint64 timestampCutoff)"
)
#: Version 1 of the operator's guarantee receipt. Its type hash is the key the
#: layout's on-chain verifier is registered under.
GUARANTEE_V1_TYPE = (
    "GuaranteeV1(uint256 cycleId,uint256 reqId,address client,address recipient,"
    "uint256 amount,address asset,uint64 timestamp)"
)
VALIDATION_TYPE = (
    "Validation(string validator,bytes32 subject,uint64 deadline,bytes params)"
)

GUARANTEE_V1_TYPE_HASH = keccak(text=GUARANTEE_V1_TYPE)

_PAYMENT_AUTHORIZATION_TYPE_HASH = keccak(text=PAYMENT_AUTHORIZATION_TYPE)
_CHECKPOINT_TYPE_HASH = keccak(text=CHECKPOINT_TYPE)
_VALIDATION_TYPE_HASH = keccak(text=VALIDATION_TYPE)
_GUARANTEE_V1_FIELDS = [
    "uint256",  # cycleId
    "uint256",  # reqId
    "address",  # client
    "address",  # recipient
    "uint256",  # amount
    "address",  # asset
    "uint64",  # timestamp
]
_ZERO_WORD = b"\x00" * 32


def clearing_house_domain_separator(chain_id: int, clearing_house: str) -> bytes:
    """The domain every payer-signed payload is verified under, on-chain and off."""
    return eip712_domain_separator(
        CLEARING_HOUSE_EIP712_NAME,
        CLEARING_HOUSE_EIP712_VERSION,
        chain_id,
        parse_address(clearing_house, "clearing house"),
    )


def guarantee_registry_domain_separator(chain_id: int, registry: str) -> bytes:
    """The domain the operator's guarantee receipts are verified under."""
    return eip712_domain_separator(
        GUARANTEE_REGISTRY_EIP712_NAME,
        GUARANTEE_REGISTRY_EIP712_VERSION,
        chain_id,
        parse_address(registry, "guarantee registry"),
    )


def _word(value: Union[str, bytes]) -> bytes:
    data = bytes(value) if isinstance(value, (bytes, bytearray)) else None
    if data is None:
        data = bytes.fromhex(str(value).removeprefix("0x"))
    if len(data) != 32:
        raise InvalidParamsError(f"expected 32 bytes, got {len(data)}")
    return data


def _address(field: str, value: str) -> str:
    try:
        return parse_address(value, field)
    except ValidationError as exc:
        raise InvalidParamsError(str(exc)) from exc


def _validation_hash(validation: Any) -> bytes:
    params = bytes.fromhex(str(validation.params or "0x").removeprefix("0x"))
    return keccak(
        abi_encode(
            ["bytes32", "bytes32", "bytes32", "uint64", "bytes32"],
            [
                _VALIDATION_TYPE_HASH,
                keccak(text=validation.validator),
                _word(validation.subject),
                int(validation.deadline or 0),
                keccak(params),
            ],
        )
    )


def recipient_commitment(
    recipient: str, salt: Union[str, bytes], validation: Any = None
) -> bytes:
    """Binds the off-chain terms of a guarantee — the recipient and any
    validation requirement — into the one word the payer signs. *salt* keeps
    the recipient from being recovered by guessing."""
    validation_hash = (
        _validation_hash(validation) if validation is not None else _ZERO_WORD
    )
    return keccak(
        abi_encode(
            ["address", "bytes32", "bytes32"],
            [_address("recipient", recipient), _word(salt), validation_hash],
        )
    )


def payment_authorization_hash(payload: Any) -> bytes:
    """``hashStruct`` of the ``PaymentAuthorization`` a payment payload maps to."""
    return keccak(
        abi_encode(
            [
                "bytes32",
                "address",
                "bytes32",
                "address",
                "uint256",
                "uint256",
                "uint64",
                "bytes32",
            ],
            [
                _PAYMENT_AUTHORIZATION_TYPE_HASH,
                _address("user", payload.user_address),
                _word(payload.cycle_id),
                _address("asset", payload.asset_address),
                int(payload.amount),
                int(payload.req_id),
                int(payload.timestamp),
                recipient_commitment(
                    payload.recipient_address, payload.salt, payload.validation
                ),
            ],
        )
    )


def payment_signing_digest(payload: Any, domain_separator: Union[str, bytes]) -> bytes:
    """The digest a payer's wallet signs for a payment payload."""
    return eip712_digest(domain_separator, payment_authorization_hash(payload))


def checkpoint_hash(payload: Any) -> bytes:
    """``hashStruct`` of a ``Checkpoint``."""
    return keccak(
        abi_encode(
            ["bytes32", "address", "bytes32", "address", "uint256", "uint64"],
            [
                _CHECKPOINT_TYPE_HASH,
                _address("payer", payload.payer),
                _word(payload.cycle_id),
                _address("asset", payload.asset_address),
                int(payload.cumulative_gross),
                int(payload.timestamp_cutoff),
            ],
        )
    )


def checkpoint_signing_digest(
    payload: Any, domain_separator: Union[str, bytes]
) -> bytes:
    """The digest a payer's wallet signs for a checkpoint."""
    return eip712_digest(domain_separator, checkpoint_hash(payload))


def recover_signer(digest: bytes, signature: Union[str, bytes]) -> Optional[str]:
    """The checksummed address whose key produced *signature* over *digest*,
    or ``None`` when the signature is not a readable 65-byte ``r‖s‖v``."""
    try:
        raw = (
            bytes(signature)
            if isinstance(signature, (bytes, bytearray))
            else bytes.fromhex(str(signature).removeprefix("0x"))
        )
        if len(raw) != 65:
            return None
        v = raw[64]
        if v >= 27:
            v -= 27
        if v not in (0, 1):
            return None
        sig = keys.Signature(signature_bytes=raw[:64] + bytes([v]))
        return sig.recover_public_key_from_msg_hash(bytes(digest)).to_checksum_address()
    except Exception:
        return None


@dataclass(frozen=True)
class Guarantee:
    """The operator's guarantee, at the layout core currently signs
    (``GuaranteeV1``). ``cycle_id`` is the on-chain bytes32 cycle id read as
    an integer, which is how the layout carries it."""

    cycle_id: int
    req_id: int
    client: str
    recipient: str
    amount: int
    asset: str
    timestamp: int

    @property
    def version(self) -> int:
        return 1

    @property
    def type_hash(self) -> bytes:
        """EIP-712 type hash of this guarantee's layout."""
        return GUARANTEE_V1_TYPE_HASH

    @classmethod
    def from_payment(
        cls, payload: Any, cycle_id: Union[int, str, bytes]
    ) -> "Guarantee":
        """The guarantee core issues for *payload* in *cycle_id*."""
        if isinstance(cycle_id, (bytes, bytearray)):
            cycle_id = int.from_bytes(cycle_id, "big")
        return cls(
            cycle_id=parse_u256(cycle_id),
            req_id=int(payload.req_id),
            client=_address("user", payload.user_address),
            recipient=_address("recipient", payload.recipient_address),
            amount=int(payload.amount),
            asset=_address("asset", payload.asset_address),
            timestamp=int(payload.timestamp),
        )

    @classmethod
    def decode(cls, data: Union[str, bytes]) -> "Guarantee":
        """Inverse of :meth:`receipt_bytes`. Refuses what the chain would:
        a short prefix, an unknown layout, or a payload that does not decode
        as its layout."""
        if isinstance(data, str):
            try:
                data = bytes.fromhex(data.removeprefix("0x"))
            except ValueError as exc:
                raise MalformedReceiptError(f"receipt is not hex: {exc}") from exc
        data = bytes(data)
        if len(data) < 32:
            raise MalformedReceiptError("receipt is shorter than a type hash")
        prefix, payload = data[:32], data[32:]
        if prefix != GUARANTEE_V1_TYPE_HASH:
            raise MalformedReceiptError(
                f"receipt type hash 0x{prefix.hex()} is not a layout this SDK knows"
            )
        if len(payload) != 32 * len(_GUARANTEE_V1_FIELDS):
            raise MalformedReceiptError(
                f"receipt payload is {len(payload)} bytes, not a GuaranteeV1"
            )
        try:
            cycle_id, req_id, client, recipient, amount, asset, timestamp = abi_decode(
                _GUARANTEE_V1_FIELDS, payload
            )
        except Exception as exc:
            raise MalformedReceiptError(
                f"receipt payload does not decode as its layout: {exc}"
            ) from exc
        return cls(
            cycle_id=int(cycle_id),
            req_id=int(req_id),
            client=parse_address(client),
            recipient=parse_address(recipient),
            amount=int(amount),
            asset=parse_address(asset),
            timestamp=int(timestamp),
        )

    def struct_hash(self) -> bytes:
        return keccak(
            abi_encode(
                ["bytes32", *_GUARANTEE_V1_FIELDS],
                [GUARANTEE_V1_TYPE_HASH, *self._values()],
            )
        )

    def signing_digest(self, domain_separator: Union[str, bytes]) -> bytes:
        """The digest the operator signs, under the GuaranteeRegistry domain."""
        return eip712_digest(domain_separator, self.struct_hash())

    def receipt_bytes(self) -> bytes:
        """What ``GuaranteeRegistry.verifyGuarantee`` takes: the type hash,
        then the layout ABI-encoded."""
        return GUARANTEE_V1_TYPE_HASH + abi_encode(_GUARANTEE_V1_FIELDS, self._values())

    def _values(self) -> list:
        return [
            self.cycle_id,
            self.req_id,
            self.client,
            self.recipient,
            self.amount,
            self.asset,
            self.timestamp,
        ]


@dataclass
class GuaranteeReceipt:
    """The operator's attestation of an issued guarantee: exactly what
    ``GuaranteeRegistry.verifyGuarantee`` takes. :meth:`guarantee` decodes it."""

    receipt: str
    """The signed bytes, hex: the guarantee's type hash, then the guarantee
    ABI-encoded."""
    signature: str
    """Operator signature over the guarantee, hex."""

    @classmethod
    def new(cls, guarantee: Guarantee, signature: str) -> "GuaranteeReceipt":
        return cls(receipt="0x" + guarantee.receipt_bytes().hex(), signature=signature)

    def guarantee(self) -> Guarantee:
        """The guarantee :attr:`receipt` encodes."""
        return Guarantee.decode(self.receipt)

    def to_payload(self) -> dict:
        return {"receipt": self.receipt, "signature": self.signature}

    @classmethod
    def from_rpc(cls, raw: Any) -> "GuaranteeReceipt":
        if not isinstance(raw, dict):
            raise InvalidParamsError("guarantee receipt must be an object")
        receipt, signature = raw.get("receipt"), raw.get("signature")
        if receipt is None or signature is None:
            raise InvalidParamsError("guarantee receipt missing receipt or signature")
        return cls(receipt=str(receipt), signature=str(signature))


def verify_guarantee_receipt(
    receipt: GuaranteeReceipt,
    domain_separator: Union[str, bytes],
    guarantee_signer: str,
) -> Guarantee:
    """Checks that *receipt* carries *guarantee_signer*'s signature over the
    guarantee it holds, and returns that guarantee. Offline.

    Standalone so a service that never builds a :class:`~fourmica_sdk.Client`
    — a facilitator vouching for a receipt it is asked to act on — can run the
    same check. *domain_separator* is
    :func:`guarantee_registry_domain_separator` for the deployment the receipt
    was issued by."""
    guarantee = receipt.guarantee()
    recovered = recover_signer(
        guarantee.signing_digest(domain_separator), receipt.signature
    )
    if recovered is None:
        raise UnreadableReceiptSignatureError(
            "guarantee receipt carries an unreadable signature"
        )
    expected = parse_address(guarantee_signer, "guarantee signer")
    if recovered != expected:
        raise ReceiptSignerMismatchError(expected, recovered)
    return guarantee
