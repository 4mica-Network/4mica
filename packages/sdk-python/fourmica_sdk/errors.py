"""Exception taxonomy for the 4Mica Python SDK.

Mirrors the Rust SDK's per-area error enums (``sdk-rust/src/error.rs``) as an
exception hierarchy rooted at :class:`FourMicaError`. Facilitator error codes
are carried verbatim on :class:`FacilitatorRejectedError` so callers can branch
on codes this SDK predates.
"""

from __future__ import annotations

from typing import Any, List, Optional


class FourMicaError(Exception):
    """Base error for the 4Mica Python SDK."""


class ConfigError(FourMicaError):
    """Raised when configuration values are missing or invalid."""


class RpcError(FourMicaError):
    """Raised when an API call to the core service fails. ``code`` and
    ``details`` are what core attached to a coded refusal — stable across
    message wording changes, so branch on ``code`` rather than the text."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        code: Optional[str] = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.details = details


class InvalidParamsError(FourMicaError):
    """Raised when a server response or caller input fails validation."""


# --- auth ---------------------------------------------------------------


class AuthError(FourMicaError):
    """Raised when authentication flows fail."""


class AuthConfigError(AuthError):
    """Raised when auth configuration is missing or invalid."""


class AuthUrlError(AuthError):
    """Raised when an auth URL is invalid."""


class AuthTransportError(AuthError):
    """Raised when auth requests fail to reach the server."""


class AuthDecodeError(AuthError):
    """Raised when auth responses cannot be decoded."""


class AuthStatusError(AuthError):
    """Raised when auth endpoints return a non-success status."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# --- client / connection ------------------------------------------------


class ClientError(FourMicaError):
    """Raised for client-side connection and initialization failures."""


class ClientInitializationError(ClientError):
    """Raised when the client cannot be initialized (chain mismatch, bad keys, etc.)."""


class ChainRpcUnavailableError(ClientError):
    """No Ethereum RPC endpoint is available, so nothing that reads chain state
    or sends a transaction can run. Set ``4MICA_ETHEREUM_HTTP_RPC_URL`` or
    ``ConfigBuilder.ethereum_http_rpc_url``."""

    def __init__(self) -> None:
        super().__init__(
            "no Ethereum RPC endpoint is available; set 4MICA_ETHEREUM_HTTP_RPC_URL "
            "or ConfigBuilder.ethereum_http_rpc_url"
        )


class MissingTokenDomainSeparatorError(ClientError):
    """Core publishes no EIP-712 domain separator for this token, so no
    EIP-3009 or EIP-2612 digest can be built for it. Scheme-scoped, not fatal:
    Permit2 and self-funded routes need no token domain."""

    def __init__(self, token: str) -> None:
        super().__init__(
            f"no EIP-712 domain separator is published for {token}; the token is "
            "either unsupported or does not implement EIP-3009"
        )
        self.token = token


# --- payment guarantees -------------------------------------------------


class PaymentError(FourMicaError):
    """Raised by the payment-guarantee flow: signing, issuing, or verifying."""


class SigningError(PaymentError):
    """Raised when payment signing fails."""


class InvalidPayerAddressError(PaymentError):
    """The payload's payer is not a valid address."""

    def __init__(self) -> None:
        super().__init__("payer address is not a valid address")


class AddressMismatchError(PaymentError):
    """The signer was asked to sign for a payer other than itself."""

    def __init__(self, signer: str, payer: str) -> None:
        super().__init__(f"signer {signer} cannot sign for payer {payer}")
        self.signer = signer
        self.payer = payer


class MalformedReceiptError(PaymentError):
    """A guarantee receipt that does not decode: not hex, too short, an
    unknown layout, or a payload that is not its layout."""


class UnreadableReceiptSignatureError(PaymentError):
    """A guarantee receipt whose signature is not a readable ECDSA signature."""


class ReceiptSignerMismatchError(PaymentError):
    """A guarantee receipt signed by someone other than the operator."""

    def __init__(self, expected: str, recovered: str) -> None:
        super().__init__(
            f"guarantee receipt was signed by {recovered}, not by the operator "
            f"{expected}"
        )
        self.expected = expected
        self.recovered = recovered


class UntrustedCheckpointBatchError(PaymentError):
    """Core's checkpoint batch failed a check, so it was not signed: an
    operator that slipped in a payment the payer never made would inflate what
    the payer can be charged on default."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"refusing to sign a checkpoint over core's batch: {reason}")
        self.reason = reason


class CoreRefusalError(PaymentError, RpcError):
    """A coded refusal from core, carrying the decoded ``details`` the caller
    needs to act on. Still an :class:`RpcError`, so handlers written against
    core's plain errors keep catching it."""

    def __init__(
        self,
        message: str,
        details: Any,
        status_code: Optional[int] = None,
        code: Optional[str] = None,
    ) -> None:
        RpcError.__init__(
            self, message, status_code=status_code, code=code, details=details
        )


class CheckpointRequiredError(CoreRefusalError):
    """``CHECKPOINT_REQUIRED``: the payer holds too many guarantees past its
    latest checkpoint. Submit one and retry."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payer {details.payer} has {details.uncheckpointed} uncheckpointed "
            f"guarantees (max {details.max_uncheckpointed}); submit a checkpoint "
            "and retry",
            details,
            **kwargs,
        )


class CheckpointMismatchError(CoreRefusalError):
    """``CHECKPOINT_MISMATCH``: the checkpoint no longer matches what core
    holds. Re-read the batch and sign again."""

    def __init__(self, details: Any, reason: str, **kwargs: Any) -> None:
        super().__init__(
            f"checkpoint for cycle {details.cycle_id} no longer matches what core "
            f"holds: {reason}",
            details,
            **kwargs,
        )
        self.reason = reason


class CycleMismatchError(CoreRefusalError):
    """``CYCLE_MISMATCH``: signed for a cycle other than the active one."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment was signed for cycle {details.signed_cycle_id} but the "
            f"active cycle is {details.active_cycle_id}",
            details,
            **kwargs,
        )


class FutureTimestampError(CoreRefusalError):
    """``FUTURE_TIMESTAMP``: stamped later than core's clock."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment timestamp {details.timestamp} is later than core's clock "
            f"{details.server_time}",
            details,
            **kwargs,
        )


class StaleTimestampError(CoreRefusalError):
    """``STALE_TIMESTAMP``: stamped before the active cycle opened."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment timestamp {details.timestamp} is before cycle "
            f"{details.cycle_id} opened at {details.period_start}",
            details,
            **kwargs,
        )


class TimestampNotPastCutoffError(CoreRefusalError):
    """``TIMESTAMP_NOT_PAST_CUTOFF``: stamped at or before the payer's latest
    checkpoint cutoff."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment timestamp {details.timestamp} is not past the payer's "
            f"checkpoint cutoff {details.timestamp_cutoff}",
            details,
            **kwargs,
        )


# --- on-chain -----------------------------------------------------------


class ContractError(FourMicaError):
    """Raised when an on-chain call or transaction fails."""


class UnknownRevertError(ContractError):
    """A revert whose selector matches no known custom error."""

    def __init__(self, selector: str, data: Optional[str] = None) -> None:
        super().__init__(f"unknown revert (selector 0x{selector})")
        self.selector = selector
        self.data = data


class RevertedOnChainError(ContractError):
    """Mined and reverted, so gas *was* spent — as opposed to a refusal before
    broadcasting."""

    def __init__(self, tx_hash: str) -> None:
        super().__init__(f"transaction {tx_hash} reverted on-chain")
        self.tx_hash = tx_hash


class AmountZeroError(ContractError):
    """The contract rejected a zero amount."""


class InsufficientAvailableError(ContractError):
    """The contract has less available than the operation needs."""


class NoWithdrawalRequestedError(ContractError):
    """No withdrawal request is outstanding to cancel or finalize."""


class GracePeriodNotElapsedError(ContractError):
    """The withdrawal grace period has not elapsed yet."""


class TransferFailedError(ContractError):
    """The asset transfer inside the contract failed."""


class UnsupportedAssetError(ContractError):
    """The contract does not support this asset."""

    def __init__(self, asset: str) -> None:
        super().__init__(f"unsupported asset: {asset}")
        self.asset = asset


class InsufficientLiquidityError(ContractError):
    """The pool cannot pay this much out right now; its strategy holds the
    rest. Retry later, or withdraw less."""


class PoolInsolventError(ContractError):
    """The pool has shares outstanding but nothing backing them, so no
    deposit can be priced."""


class DepositsDisabledError(ContractError):
    """The Treasury is not accepting deposits."""


class StablecoinDepositsDisabledError(ContractError):
    """The Treasury is not accepting deposits of this stablecoin."""


class PausedError(ContractError):
    """The Treasury is paused."""


class ValueMismatchError(ContractError):
    """The token delivered a different amount than expected (fee-on-transfer)."""


class ZeroCollateralCreditError(ContractError):
    """The deposit was too small to mint any pool shares."""


class Erc20AllowanceRequiredError(FourMicaError):
    """A self-funded token pull needs an ERC-20 allowance that is not in place.
    Grant it with the matching ``approve()`` terminal and retry."""

    def __init__(self, token: str, spender: str, allowance: int, needed: int) -> None:
        super().__init__(
            f"an allowance is required: {needed} of {token} required but only "
            f"{allowance} approved to {spender}; call approve() first"
        )
        self.token = token
        self.spender = spender
        self.allowance = allowance
        self.needed = needed


# --- facilitator sponsorship (used from Cycle 2 onward) ------------------


class SponsorshipError(FourMicaError):
    """A sponsored action the facilitator declined, or could not be asked to
    perform at all."""


class FacilitatorNotConfiguredError(SponsorshipError):
    """No facilitator URL was configured, so there is nobody to pay the gas."""

    def __init__(self) -> None:
        super().__init__(
            "no facilitator configured; set 4MICA_FACILITATOR_URL or "
            "ConfigBuilder.facilitator_url"
        )


class FacilitatorRejectedError(SponsorshipError):
    """The facilitator refused. ``code`` is carried verbatim so a caller can
    branch on a code this SDK predates."""

    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(f"facilitator rejected the request ({code}): {message}")
        self.code = code
        self.retryable = retryable


class SponsorshipTransportError(SponsorshipError):
    """The facilitator never received the request, so it cannot have acted on it."""


class OutcomeUnknownError(SponsorshipError):
    """The request reached the facilitator but no usable answer came back, so
    whether it submitted a transaction is unknown. Do not blindly retry: the
    first attempt may already have settled."""


class Permit2AllowanceRequiredError(SponsorshipError):
    """Permit2 needs a one-time on-chain ``approve(PERMIT2, ...)`` the signer
    has not made. When ``eip2612_nonce`` is present the approval can be signed
    (EIP-2612) rather than transacted."""

    def __init__(self, message: str, eip2612_nonce: Optional[int] = None) -> None:
        super().__init__(f"permit2 requires a prior approve(PERMIT2, ...): {message}")
        self.eip2612_nonce = eip2612_nonce


# --- x402 ---------------------------------------------------------------


class X402Error(FourMicaError):
    """Raised for x402 flow issues (invalid scheme, settlement errors, etc.)."""


__all__: List[str] = [
    "AddressMismatchError",
    "AmountZeroError",
    "AuthConfigError",
    "AuthDecodeError",
    "AuthError",
    "AuthStatusError",
    "AuthTransportError",
    "AuthUrlError",
    "ChainRpcUnavailableError",
    "CheckpointMismatchError",
    "CheckpointRequiredError",
    "ClientError",
    "ClientInitializationError",
    "ConfigError",
    "ContractError",
    "CoreRefusalError",
    "CycleMismatchError",
    "DepositsDisabledError",
    "Erc20AllowanceRequiredError",
    "FacilitatorNotConfiguredError",
    "FacilitatorRejectedError",
    "FourMicaError",
    "FutureTimestampError",
    "GracePeriodNotElapsedError",
    "InsufficientAvailableError",
    "InsufficientLiquidityError",
    "InvalidParamsError",
    "InvalidPayerAddressError",
    "MalformedReceiptError",
    "MissingTokenDomainSeparatorError",
    "NoWithdrawalRequestedError",
    "OutcomeUnknownError",
    "PausedError",
    "PaymentError",
    "Permit2AllowanceRequiredError",
    "PoolInsolventError",
    "ReceiptSignerMismatchError",
    "RevertedOnChainError",
    "RpcError",
    "SigningError",
    "SponsorshipError",
    "SponsorshipTransportError",
    "StablecoinDepositsDisabledError",
    "StaleTimestampError",
    "TimestampNotPastCutoffError",
    "TransferFailedError",
    "UnknownRevertError",
    "UnreadableReceiptSignatureError",
    "UnsupportedAssetError",
    "UntrustedCheckpointBatchError",
    "ValueMismatchError",
    "X402Error",
    "ZeroCollateralCreditError",
]
