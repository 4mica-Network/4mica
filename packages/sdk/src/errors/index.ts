/**
 * Error taxonomy for the 4Mica SDK.
 *
 * Mirrors the Rust SDK's per-area error enums (`sdk-rust/src/error.rs`) as a
 * class hierarchy rooted at {@link FourMicaError}. Facilitator error codes are
 * carried verbatim on {@link FacilitatorRejectedError} so callers can branch
 * on codes this SDK predates.
 */

/** Base class for all 4Mica SDK errors. Sets `error.name` to the subclass name. */
export class FourMicaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Thrown when the SDK configuration is invalid (e.g. missing required fields or bad URL). */
export class ConfigError extends FourMicaError {}

/** Thrown when a 4Mica core RPC call fails. Includes the HTTP status and raw response body. */
export class RpcError extends FourMicaError {
  readonly status?: number;
  readonly body?: unknown;

  constructor(message: string, options?: { status?: number; body?: unknown }) {
    super(message);
    this.status = options?.status;
    this.body = options?.body;
  }
}

/** Thrown when a server response or caller input fails validation. */
export class InvalidParamsError extends FourMicaError {}

// --- auth ---------------------------------------------------------------

/** Base class for authentication-related errors. */
export class AuthError extends FourMicaError {}

/** Thrown when auth configuration is invalid. */
export class AuthConfigError extends AuthError {}

/** Thrown when an authenticated operation is attempted without auth being configured. */
export class AuthMissingConfigError extends AuthConfigError {}

/** Thrown when the auth URL is invalid or unreachable. */
export class AuthUrlError extends AuthError {}

/** Thrown when a network-level error occurs during authentication. */
export class AuthTransportError extends AuthError {}

/** Thrown when the auth server response cannot be decoded. */
export class AuthDecodeError extends AuthError {}

/** Thrown when the auth server returns an error response. Includes HTTP status and body. */
export class AuthApiError extends AuthError {
  readonly status?: number;
  readonly body?: unknown;

  constructor(message: string, options?: { status?: number; body?: unknown }) {
    super(message);
    this.status = options?.status;
    this.body = options?.body;
  }
}

// --- client / connection ------------------------------------------------

/** Base class for client-side connection and initialization failures. */
export class ClientError extends FourMicaError {}

/** Thrown when the client cannot be initialized (chain mismatch, bad keys, etc.). */
export class ClientInitializationError extends ClientError {}

/**
 * No Ethereum RPC endpoint is available, so nothing that reads chain state or
 * sends a transaction can run. Set `4MICA_ETHEREUM_HTTP_RPC_URL` or
 * {@link ConfigBuilder.ethereumHttpRpcUrl}.
 */
export class ChainRpcUnavailableError extends ClientError {
  constructor() {
    super(
      "no Ethereum RPC endpoint is available; set 4MICA_ETHEREUM_HTTP_RPC_URL " +
        "or ConfigBuilder.ethereumHttpRpcUrl",
    );
  }
}

/**
 * Core publishes no EIP-712 domain separator for this token, so no EIP-3009 or
 * EIP-2612 digest can be built for it. Scheme-scoped, not fatal: Permit2 and
 * self-funded routes need no token domain.
 */
export class MissingTokenDomainSeparatorError extends ClientError {
  readonly token: string;

  constructor(token: string) {
    super(
      `no EIP-712 domain separator is published for ${token}; the token is ` +
        "either unsupported or does not implement EIP-3009",
    );
    this.token = token;
  }
}

// --- payment guarantees -------------------------------------------------

/** Base class for the payment-guarantee flow: signing, issuing, or verifying. */
export class PaymentError extends FourMicaError {}

/** Thrown when payment signing fails. */
export class SigningError extends PaymentError {}

/** Thrown when the signer address does not equal `claims.userAddress`. */
export class AddressMismatchError extends PaymentError {
  readonly signer: string;
  readonly claimsUser: string;

  constructor(signer: string, claimsUser: string) {
    super(
      `address mismatch: signer ${signer} != claims.user_address ${claimsUser}`,
    );
    this.signer = signer;
    this.claimsUser = claimsUser;
  }
}

/** Thrown when a BLS certificate cannot be decoded or verified structurally. */
export class InvalidCertificateError extends PaymentError {}

/** Thrown when a certificate's BLS signature does not verify. */
export class CertificateMismatchError extends PaymentError {}

/** Thrown when a certificate's domain separator is not the expected one. */
export class GuaranteeDomainMismatchError extends PaymentError {}

/** Thrown for a guarantee claims version this client has no domain for. */
export class UnsupportedGuaranteeVersionError extends PaymentError {
  readonly version: number;

  constructor(version: number) {
    super(`unsupported guarantee version: ${version}`);
    this.version = version;
  }
}

/** Thrown when BLS material or guarantee claims bytes cannot be decoded. */
export class VerificationError extends FourMicaError {}

// --- on-chain -----------------------------------------------------------

/** Thrown when an on-chain contract call fails or returns an unexpected result. */
export class ContractError extends FourMicaError {}

/** A revert whose selector matches no known custom error. */
export class UnknownRevertError extends ContractError {
  readonly selector: string;
  readonly data?: string;

  constructor(selector: string, data?: string) {
    super(`unknown revert (selector ${selector})`);
    this.selector = selector;
    this.data = data;
  }
}

/** Mined and reverted, so gas *was* spent — as opposed to a refusal before broadcasting. */
export class RevertedOnChainError extends ContractError {
  readonly txHash: string;

  constructor(txHash: string) {
    super(`transaction ${txHash} reverted on-chain`);
    this.txHash = txHash;
  }
}

/** The contract rejected a zero amount. */
export class AmountZeroError extends ContractError {}

/** The contract has less available than the operation needs. */
export class InsufficientAvailableError extends ContractError {}

/** No withdrawal request is outstanding to cancel or finalize. */
export class NoWithdrawalRequestedError extends ContractError {}

/** The withdrawal grace period has not elapsed yet. */
export class GracePeriodNotElapsedError extends ContractError {}

/** The asset transfer inside the contract failed. */
export class TransferFailedError extends ContractError {}

/** The contract does not support this asset. */
export class UnsupportedAssetError extends ContractError {
  readonly asset: string;

  constructor(asset: string) {
    super(`unsupported asset: ${asset}`);
    this.asset = asset;
  }
}

/** The stablecoin withdrawal delivered less than requested. */
export class StablecoinWithdrawShortfallError extends ContractError {}

/** Aave is not configured for this deployment. */
export class AaveNotConfiguredError extends ContractError {}

/** The token delivered a different amount than expected (fee-on-transfer). */
export class ValueMismatchError extends ContractError {}

/** The deposit was too small to mint any scaled collateral. */
export class ZeroCollateralCreditError extends ContractError {}

/**
 * A self-funded token pull needs an ERC-20 allowance that is not in place.
 * Grant it with the matching `approve()` terminal and retry.
 */
export class Erc20AllowanceRequiredError extends FourMicaError {
  readonly token: string;
  readonly spender: string;
  readonly allowance: bigint;
  readonly needed: bigint;

  constructor(options: {
    token: string;
    spender: string;
    allowance: bigint;
    needed: bigint;
  }) {
    super(
      `an allowance is required: ${options.needed} of ${options.token} required ` +
        `but only ${options.allowance} approved to ${options.spender}; call ` +
        "approve() first",
    );
    this.token = options.token;
    this.spender = options.spender;
    this.allowance = options.allowance;
    this.needed = options.needed;
  }
}

// --- facilitator sponsorship (used from Cycle 2 onward) -------------------

/** A sponsored action the facilitator declined, or could not be asked to perform at all. */
export class SponsorshipError extends FourMicaError {}

/** No facilitator URL was configured, so there is nobody to pay the gas. */
export class FacilitatorNotConfiguredError extends SponsorshipError {
  constructor() {
    super(
      "no facilitator configured; set 4MICA_FACILITATOR_URL or " +
        "ConfigBuilder.facilitatorUrl",
    );
  }
}

/**
 * The facilitator refused. `code` is carried verbatim so a caller can branch
 * on a code this SDK predates.
 */
export class FacilitatorRejectedError extends SponsorshipError {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(`facilitator rejected the request (${code}): ${message}`);
    this.code = code;
    this.retryable = retryable;
  }
}

/** The facilitator never received the request, so it cannot have acted on it. */
export class SponsorshipTransportError extends SponsorshipError {}

/**
 * The request reached the facilitator but no usable answer came back, so
 * whether it submitted a transaction is unknown. Do not blindly retry: the
 * first attempt may already have settled.
 */
export class OutcomeUnknownError extends SponsorshipError {}

/**
 * Permit2 needs a one-time on-chain `approve(PERMIT2, ...)` the signer has not
 * made. When `eip2612Nonce` is present the approval can be signed (EIP-2612)
 * rather than transacted.
 */
export class Permit2AllowanceRequiredError extends SponsorshipError {
  readonly eip2612Nonce?: bigint;

  constructor(message: string, eip2612Nonce?: bigint) {
    super(`permit2 requires a prior approve(PERMIT2, ...): ${message}`);
    this.eip2612Nonce = eip2612Nonce;
  }
}

// --- x402 ---------------------------------------------------------------

/** Thrown for x402 flow issues (invalid scheme, settlement errors, etc.). */
export class X402Error extends FourMicaError {}
