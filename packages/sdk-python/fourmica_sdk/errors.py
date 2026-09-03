"""Exception taxonomy for the 4Mica Python SDK.

Mirrors the Rust SDK's per-area error enums (``sdk-rust/src/error.rs``) as an
exception hierarchy rooted at :class:`FourMicaError`. Facilitator error codes
are carried verbatim on :class:`FacilitatorRejectedError` so callers can branch
on codes this SDK predates.
"""

from __future__ import annotations

from typing import List, Optional


class FourMicaError(Exception):
    """Base error for the 4Mica Python SDK."""


class ConfigError(FourMicaError):
    """Raised when configuration values are missing or invalid."""


class RpcError(FourMicaError):
    """Raised when an API call to the core service fails."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


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


class AddressMismatchError(PaymentError):
    """Raised when the signer address does not equal ``claims.user_address``."""

    def __init__(self, signer: str, claims_user: str) -> None:
        super().__init__(
            f"address mismatch: signer {signer} != claims.user_address {claims_user}"
        )
        self.signer = signer
        self.claims_user = claims_user


class InvalidCertificateError(PaymentError):
    """Raised when a BLS certificate cannot be decoded or verified structurally."""


class CertificateMismatchError(PaymentError):
    """Raised when a certificate's BLS signature does not verify."""


class GuaranteeDomainMismatchError(PaymentError):
    """Raised when a certificate's domain separator is not the expected one."""


class UnsupportedGuaranteeVersionError(PaymentError):
    """Raised for a guarantee claims version this client has no domain for."""

    def __init__(self, version: int) -> None:
        super().__init__(f"unsupported guarantee version: {version}")
        self.version = version


class VerificationError(FourMicaError):
    """Raised when BLS material or guarantee claims bytes cannot be decoded."""


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


class StablecoinWithdrawShortfallError(ContractError):
    """The stablecoin withdrawal delivered less than requested."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


class AaveNotConfiguredError(ContractError):
    """Aave is not configured for this deployment."""


class ValueMismatchError(ContractError):
    """The token delivered a different amount than expected (fee-on-transfer)."""


class ZeroCollateralCreditError(ContractError):
    """The deposit was too small to mint any scaled collateral."""


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
    "AaveNotConfiguredError",
    "AuthConfigError",
    "AuthDecodeError",
    "AuthError",
    "AuthStatusError",
    "AuthTransportError",
    "AuthUrlError",
    "CertificateMismatchError",
    "ChainRpcUnavailableError",
    "ClientError",
    "ClientInitializationError",
    "ConfigError",
    "ContractError",
    "Erc20AllowanceRequiredError",
    "FacilitatorNotConfiguredError",
    "FacilitatorRejectedError",
    "FourMicaError",
    "GracePeriodNotElapsedError",
    "GuaranteeDomainMismatchError",
    "InsufficientAvailableError",
    "InvalidCertificateError",
    "InvalidParamsError",
    "MissingTokenDomainSeparatorError",
    "NoWithdrawalRequestedError",
    "OutcomeUnknownError",
    "PaymentError",
    "Permit2AllowanceRequiredError",
    "RevertedOnChainError",
    "RpcError",
    "SigningError",
    "SponsorshipError",
    "SponsorshipTransportError",
    "StablecoinWithdrawShortfallError",
    "TransferFailedError",
    "UnknownRevertError",
    "UnsupportedAssetError",
    "UnsupportedGuaranteeVersionError",
    "ValueMismatchError",
    "VerificationError",
    "X402Error",
    "ZeroCollateralCreditError",
]
