from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal


class FourMicaError(Exception):
    pass


class ConfigError(FourMicaError):
    pass


class RpcError(FourMicaError):
    """Branch on ``code``, not the message text."""

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        code: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.details = details


class InvalidParamsError(FourMicaError):
    """A server response or caller input failed validation."""


class AuthError(FourMicaError):
    pass


class AuthConfigError(AuthError):
    pass


class AuthUrlError(AuthError):
    pass


class AuthTransportError(AuthError):
    pass


class AuthDecodeError(AuthError):
    pass


class AuthStatusError(AuthError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class ClientError(FourMicaError):
    pass


class ClientInitializationError(ClientError):
    pass


class ChainRpcUnavailableError(ClientError):
    """Set ``FOURMICA_ETHEREUM_HTTP_RPC_URL`` or
    ``ConfigBuilder.ethereum_http_rpc_url``."""

    def __init__(self) -> None:
        super().__init__(
            "no Ethereum RPC endpoint is available; set "
            "FOURMICA_ETHEREUM_HTTP_RPC_URL or ConfigBuilder.ethereum_http_rpc_url"
        )


class MissingTokenDomainSeparatorError(ClientError):
    """Only EIP-3009 and EIP-2612 digests need it; Permit2 and self-funded
    routes still work."""

    def __init__(self, token: str) -> None:
        super().__init__(
            f"no EIP-712 domain separator is published for {token}; the token is "
            "either unsupported or does not implement EIP-3009"
        )
        self.token = token


class PaymentError(FourMicaError):
    pass


class SigningError(PaymentError):
    pass


class InvalidPayerAddressError(PaymentError):
    def __init__(self) -> None:
        super().__init__("payer address is not a valid address")


class AddressMismatchError(PaymentError):
    """The signer was asked to sign for a payer other than itself."""

    def __init__(self, signer: str, payer: str) -> None:
        super().__init__(f"signer {signer} cannot sign for payer {payer}")
        self.signer = signer
        self.payer = payer


class MalformedReceiptError(PaymentError):
    pass


class UnreadableReceiptSignatureError(PaymentError):
    pass


class ReceiptSignerMismatchError(PaymentError):
    def __init__(self, expected: str, recovered: str) -> None:
        super().__init__(
            f"guarantee receipt was signed by {recovered}, not by the operator "
            f"{expected}"
        )
        self.expected = expected
        self.recovered = recovered


class UntrustedCheckpointBatchError(PaymentError):
    """Core's checkpoint batch failed a check, so nothing was signed."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"refusing to sign a checkpoint over core's batch: {reason}")
        self.reason = reason


class CoreRefusalError(PaymentError, RpcError):
    """A coded refusal with decoded ``details``; still an :class:`RpcError`."""

    def __init__(
        self,
        message: str,
        details: Any,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        RpcError.__init__(
            self, message, status_code=status_code, code=code, details=details
        )


class CheckpointRequiredError(CoreRefusalError):
    """Submit a checkpoint and retry."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payer {details.payer} has {details.uncheckpointed} uncheckpointed "
            f"guarantees (max {details.max_uncheckpointed}); submit a checkpoint "
            "and retry",
            details,
            **kwargs,
        )


class CheckpointMismatchError(CoreRefusalError):
    """Re-read the batch and sign again."""

    def __init__(self, details: Any, reason: str, **kwargs: Any) -> None:
        super().__init__(
            f"checkpoint for cycle {details.cycle_id} no longer matches what core "
            f"holds: {reason}",
            details,
            **kwargs,
        )
        self.reason = reason


class CycleMismatchError(CoreRefusalError):
    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment was signed for cycle {details.signed_cycle_id} but the "
            f"active cycle is {details.active_cycle_id}",
            details,
            **kwargs,
        )


class FutureTimestampError(CoreRefusalError):
    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment timestamp {details.timestamp} is later than core's clock "
            f"{details.server_time}",
            details,
            **kwargs,
        )


class StaleTimestampError(CoreRefusalError):
    """Stamped before the active cycle opened."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment timestamp {details.timestamp} is before cycle "
            f"{details.cycle_id} opened at {details.period_start}",
            details,
            **kwargs,
        )


class TimestampNotPastCutoffError(CoreRefusalError):
    """Stamped at or before the payer's latest checkpoint cutoff."""

    def __init__(self, details: Any, **kwargs: Any) -> None:
        super().__init__(
            f"payment timestamp {details.timestamp} is not past the payer's "
            f"checkpoint cutoff {details.timestamp_cutoff}",
            details,
            **kwargs,
        )


class ContractError(FourMicaError):
    pass


class UnknownRevertError(ContractError):
    def __init__(self, selector: str, data: str | None = None) -> None:
        super().__init__(f"unknown revert (selector 0x{selector})")
        self.selector = selector
        self.data = data


class RevertedOnChainError(ContractError):
    """Mined and reverted, so gas was spent."""

    def __init__(self, tx_hash: str) -> None:
        super().__init__(f"transaction {tx_hash} reverted on-chain")
        self.tx_hash = tx_hash


class AmountZeroError(ContractError):
    pass


class InsufficientAvailableError(ContractError):
    pass


class NoWithdrawalRequestedError(ContractError):
    pass


class GracePeriodNotElapsedError(ContractError):
    pass


class TransferFailedError(ContractError):
    pass


class UnsupportedAssetError(ContractError):
    def __init__(self, asset: str) -> None:
        super().__init__(f"unsupported asset: {asset}")
        self.asset = asset


class InsufficientLiquidityError(ContractError):
    """The strategy holds the rest. Retry later, or withdraw less."""


class PoolInsolventError(ContractError):
    """Shares outstanding with nothing backing them; no deposit can be
    priced."""


class DepositsDisabledError(ContractError):
    pass


class StablecoinDepositsDisabledError(ContractError):
    pass


class PausedError(ContractError):
    pass


class ValueMismatchError(ContractError):
    """The token delivered a different amount than expected (fee-on-transfer)."""


class ZeroCollateralCreditError(ContractError):
    """The deposit was too small to mint any pool shares."""


class Erc20AllowanceRequiredError(FourMicaError):
    """Grant it with the matching ``approve()`` terminal and retry."""

    def __init__(self, token: str, spender: str, allowance: int, needed: int) -> None:
        super().__init__(
            f"an allowance is required: {needed} of {token} required but only "
            f"{allowance} approved to {spender}; call approve() first"
        )
        self.token = token
        self.spender = spender
        self.allowance = allowance
        self.needed = needed


class SponsorshipError(FourMicaError):
    pass


class FacilitatorNotConfiguredError(SponsorshipError):
    """No facilitator URL was configured, or the configured one sponsors
    nothing."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            f"the facilitator sponsors no gas: {message}"
            if message
            else "no facilitator configured; set FOURMICA_FACILITATOR_URL or "
            "ConfigBuilder.facilitator_url"
        )


class FacilitatorRejectedError(SponsorshipError):
    """``code`` is verbatim. ``transaction`` is set when the refusal came
    after broadcasting: check it on-chain before doing anything else."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        transaction: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(f"facilitator rejected the request ({code}): {message}")
        self.code = code
        self.retryable = retryable
        self.transaction = transaction
        self.details = details


class SponsorshipTransportError(SponsorshipError):
    """The facilitator never received the request, so it cannot have acted
    on it."""


class OutcomeUnknownError(SponsorshipError):
    """Sent, with no usable answer: it may have gone through, so check before
    retrying. Also covers :class:`TransactionOutcomeUnknownError`."""


class TransactionOutcomeUnknownError(OutcomeUnknownError):
    """``stage="broadcast"``: the node may have taken it, and there is no hash.
    ``stage="receipt"``: accepted as ``tx_hash``; it may still be mined.
    Either way a retry can send it twice: check first."""

    def __init__(self, message: str, stage: str, tx_hash: str | None = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.tx_hash = tx_hash


class Permit2AllowanceRequiredError(SponsorshipError):
    """With ``eip2612_nonce`` set, the approval can be signed (EIP-2612)
    rather than transacted."""

    def __init__(self, message: str, eip2612_nonce: int | None = None) -> None:
        super().__init__(f"permit2 requires a prior approve(PERMIT2, ...): {message}")
        self.eip2612_nonce = eip2612_nonce


class X402Error(FourMicaError):
    pass


def _list_tokens(tokens: Sequence[Any]) -> str:
    if not tokens:
        return "none"
    return ", ".join(f"{t.symbol} ({t.address})" for t in tokens)


class TokenNotSupportedError(InvalidParamsError):
    """``supported`` is core's token list, each entry with ``symbol`` and
    ``address``."""

    def __init__(
        self, asset: str, supported: Sequence[Any], network: str | None = None
    ) -> None:
        where = f" on {network}" if network else ""
        super().__init__(
            f"{asset} is not accepted{where}; accepted: "
            f"{_list_tokens(supported)}, or the native asset"
        )
        self.asset = asset
        self.network = network
        self.supported = list(supported)


class AmbiguousTokenError(InvalidParamsError):
    """Two accepted tokens report this symbol; name the one meant by address."""

    def __init__(self, symbol: str, matches: Sequence[Any]) -> None:
        super().__init__(
            f"{symbol} matches more than one accepted token: "
            f"{_list_tokens(matches)}; pass the token address instead"
        )
        self.symbol = symbol
        self.matches = list(matches)


class AmountPrecisionError(InvalidParamsError):
    """More decimal places than the token has. Never rounded."""

    def __init__(self, amount: str, decimals: int) -> None:
        super().__init__(
            f"{amount} has more decimal places than the token's {decimals}; "
            "round it yourself, the SDK never rounds an amount"
        )
        self.amount = amount
        self.decimals = decimals


class InsufficientBalanceError(FourMicaError):
    """``needed`` and ``available`` are decimal strings in the asset's own
    units."""

    def __init__(self, asset: str, needed: str, available: str) -> None:
        super().__init__(
            f"the wallet holds {available} {asset} but this needs {needed}; "
            "fund the wallet first"
        )
        self.asset = asset
        self.needed = needed
        self.available = available


class GasRequiredError(FourMicaError):
    pass


class SpendLimitError(PaymentError):
    """Nothing was signed. ``limit`` is ``"per_payment"``, ``"total"``,
    ``"assets"`` or ``"pay_to"``."""

    def __init__(self, limit: str, url: str, detail: str) -> None:
        super().__init__(
            f"payment for {url} refused by the session's spend limits ({limit}): "
            f"{detail}; raise the limit in FourMica.connect(spend=...) to allow it"
        )
        self.limit = limit
        self.url = url


class SpendAuthorizationError(PaymentError):
    """Nothing was signed. ``reason`` is ``"denied"`` by the organization's
    spending policies or ``"approval_timeout"``."""

    def __init__(
        self,
        reason: Literal["denied", "approval_timeout"],
        url: str,
        authorization_id: str,
        denied_reason: str | None = None,
        approval_request_id: str | None = None,
    ) -> None:
        if reason == "denied":
            message = (
                f"payment for {url} refused by your organization's spending "
                f"policies ({denied_reason or 'denied'})"
            )
        else:
            message = f"payment for {url} timed out waiting for approval" + (
                f" {approval_request_id}" if approval_request_id else ""
            )
        super().__init__(message)
        self.reason = reason
        self.denied_reason = denied_reason
        self.authorization_id = authorization_id
        self.approval_request_id = approval_request_id
        self.url = url


class SpendAccountingError(PaymentError):
    """A spend authorization could not be consumed or released. ``accounting``
    is ``"failed"``, or ``"pending"`` when the caller was cancelled while
    retrying."""

    def __init__(
        self,
        transition: Literal["consume", "release"],
        authorization_id: str,
        accounting: Literal["pending", "failed"],
        cause: BaseException,
        req_id: str | None = None,
    ) -> None:
        super().__init__(
            f"could not {transition} spend authorization {authorization_id}"
            + (" before the request was cancelled" if accounting == "pending" else "")
            + f": {cause}"
        )
        self.transition = transition
        self.authorization_id = authorization_id
        self.accounting = accounting
        self.req_id = req_id
        self.__cause__ = cause


__all__: list[str] = [
    "AddressMismatchError",
    "AmbiguousTokenError",
    "AmountPrecisionError",
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
    "GasRequiredError",
    "GracePeriodNotElapsedError",
    "InsufficientAvailableError",
    "InsufficientBalanceError",
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
    "SpendAccountingError",
    "SpendAuthorizationError",
    "SpendLimitError",
    "SponsorshipError",
    "SponsorshipTransportError",
    "StablecoinDepositsDisabledError",
    "StaleTimestampError",
    "TimestampNotPastCutoffError",
    "TokenNotSupportedError",
    "TransactionOutcomeUnknownError",
    "TransferFailedError",
    "UnknownRevertError",
    "UnreadableReceiptSignatureError",
    "UnsupportedAssetError",
    "UntrustedCheckpointBatchError",
    "ValueMismatchError",
    "X402Error",
    "ZeroCollateralCreditError",
]
