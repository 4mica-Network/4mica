from typing import Optional


class FourMicaError(Exception):
    """Base error for the Python 4Mica SDK."""


class ConfigError(FourMicaError):
    """Raised when configuration values are missing or invalid."""


class RpcError(FourMicaError):
    """Raised when an RPC call to the core service fails."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


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


class ClientInitializationError(FourMicaError):
    """Raised when the client cannot be initialized (chain mismatch, bad keys, etc.)."""


class SigningError(FourMicaError):
    """Raised when payment signing fails."""


class ContractError(FourMicaError):
    """Raised when an on-chain call or transaction fails."""


class ApproveErc20Error(ContractError):
    """Raised when ERC20 approvals fail."""


class DepositError(ContractError):
    """Raised when collateral deposits fail."""


class RequestWithdrawalError(ContractError):
    """Raised when withdrawal requests fail."""


class CancelWithdrawalError(ContractError):
    """Raised when withdrawal cancellations fail."""


class FinalizeWithdrawalError(ContractError):
    """Raised when withdrawal finalization fails."""


class PayTabError(ContractError):
    """Raised when tab payments fail."""


class GetUserError(ContractError):
    """Raised when fetching user collateral fails."""


class TabPaymentStatusError(ContractError):
    """Raised when fetching tab payment status fails."""


class RemunerateError(ContractError):
    """Raised when remunerating a guarantee fails."""


class VerificationError(FourMicaError):
    """Raised when BLS or guarantee verification fails."""


class VerifyGuaranteeError(VerificationError):
    """Raised when a guarantee verification fails."""


class X402Error(FourMicaError):
    """Raised for X402 flow issues (invalid scheme, settlement errors, etc.)."""


class CreateTabError(FourMicaError):
    """Raised when creating payment tabs fails."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class IssuePaymentGuaranteeError(FourMicaError):
    """Raised when issuing payment guarantees fails."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class RecipientQueryError(FourMicaError):
    """Raised when recipient queries fail."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code
