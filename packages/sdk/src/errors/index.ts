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

/**
 * Thrown when a 4Mica core RPC call fails. Includes the HTTP status and raw
 * response body. `code` and `details` are what core attached to a coded
 * refusal — stable across message wording changes, so branch on `code`
 * rather than the text.
 */
export class RpcError extends FourMicaError {
  readonly status?: number;
  readonly body?: unknown;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options?: {
      status?: number;
      body?: unknown;
      code?: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.status = options?.status;
    this.body = options?.body;
    this.code = options?.code;
    this.details = options?.details;
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

/** The payload's payer is not a valid address. */
export class InvalidPayerAddressError extends PaymentError {
  constructor() {
    super("payer address is not a valid address");
  }
}

/** The signer was asked to sign for a payer other than itself. */
export class AddressMismatchError extends PaymentError {
  readonly signer: string;
  readonly payer: string;

  constructor(signer: string, payer: string) {
    super(`signer ${signer} cannot sign for payer ${payer}`);
    this.signer = signer;
    this.payer = payer;
  }
}

/**
 * A guarantee receipt that does not decode: not hex, too short, an unknown
 * layout, or a payload that is not its layout.
 */
export class MalformedReceiptError extends PaymentError {}

/** A guarantee receipt whose signature is not a readable ECDSA signature. */
export class UnreadableReceiptSignatureError extends PaymentError {}

/** A guarantee receipt signed by someone other than the operator. */
export class ReceiptSignerMismatchError extends PaymentError {
  readonly expected: string;
  readonly recovered: string;

  constructor(expected: string, recovered: string) {
    super(
      `guarantee receipt was signed by ${recovered}, not by the operator ${expected}`,
    );
    this.expected = expected;
    this.recovered = recovered;
  }
}

/**
 * Core's checkpoint batch failed a check, so it was not signed: an operator
 * that slipped in a payment the payer never made would inflate what the payer
 * can be charged on default.
 */
export class UntrustedCheckpointBatchError extends PaymentError {
  readonly reason: string;

  constructor(reason: string) {
    super(`refusing to sign a checkpoint over core's batch: ${reason}`);
    this.reason = reason;
  }
}

/**
 * A coded refusal from core, carrying the decoded `details` the caller needs
 * to act on. An {@link RpcError}, so handlers written against core's plain
 * errors keep catching it.
 */
export class CoreRefusalError<D = unknown> extends RpcError {
  declare readonly details: D;

  constructor(
    message: string,
    details: D,
    options?: { status?: number; body?: unknown; code?: string },
  ) {
    super(message, { ...options, details });
  }
}

type RefusalOptions = { status?: number; body?: unknown; code?: string };

/**
 * `CHECKPOINT_REQUIRED`: the payer holds too many guarantees past its latest
 * checkpoint. Submit one and retry.
 */
export class CheckpointRequiredError extends CoreRefusalError<{
  payer: string;
  uncheckpointed: number;
  maxUncheckpointed: number;
  cycleId: string;
  cycleIdText: string;
  assetAddress: string;
}> {
  constructor(
    details: CheckpointRequiredError["details"],
    options?: RefusalOptions,
  ) {
    super(
      `payer ${details.payer} has ${details.uncheckpointed} uncheckpointed ` +
        `guarantees (max ${details.maxUncheckpointed}); submit a checkpoint and retry`,
      details,
      options,
    );
  }
}

/**
 * `CHECKPOINT_MISMATCH`: the checkpoint no longer matches what core holds.
 * Re-read the batch and sign again.
 */
export class CheckpointMismatchError extends CoreRefusalError<{
  cycleId: string;
  cycleIdText: string;
  assetAddress: string;
  payer: string;
}> {
  readonly reason: string;

  constructor(
    details: CheckpointMismatchError["details"],
    reason: string,
    options?: RefusalOptions,
  ) {
    super(
      `checkpoint for cycle ${details.cycleId} no longer matches what core holds: ${reason}`,
      details,
      options,
    );
    this.reason = reason;
  }
}

/** `CYCLE_MISMATCH`: signed for a cycle other than the active one. */
export class CycleMismatchError extends CoreRefusalError<{
  signedCycleId: string;
  activeCycleId: string;
  activeCycleIdText: string;
  activePeriodEnd: number;
  serverTime: number;
}> {
  constructor(
    details: CycleMismatchError["details"],
    options?: RefusalOptions,
  ) {
    super(
      `payment was signed for cycle ${details.signedCycleId} but the active ` +
        `cycle is ${details.activeCycleId}`,
      details,
      options,
    );
  }
}

/** `FUTURE_TIMESTAMP`: stamped later than core's clock. */
export class FutureTimestampError extends CoreRefusalError<{
  timestamp: number;
  serverTime: number;
}> {
  constructor(
    details: FutureTimestampError["details"],
    options?: RefusalOptions,
  ) {
    super(
      `payment timestamp ${details.timestamp} is later than core's clock ${details.serverTime}`,
      details,
      options,
    );
  }
}

/** `STALE_TIMESTAMP`: stamped before the active cycle opened. */
export class StaleTimestampError extends CoreRefusalError<{
  cycleId: string;
  cycleIdText: string;
  timestamp: number;
  periodStart: number;
  periodEnd: number;
  serverTime: number;
}> {
  constructor(
    details: StaleTimestampError["details"],
    options?: RefusalOptions,
  ) {
    super(
      `payment timestamp ${details.timestamp} is before cycle ${details.cycleId} ` +
        `opened at ${details.periodStart}`,
      details,
      options,
    );
  }
}

/**
 * `TIMESTAMP_NOT_PAST_CUTOFF`: stamped at or before the payer's latest
 * checkpoint cutoff.
 */
export class TimestampNotPastCutoffError extends CoreRefusalError<{
  cycleId: string;
  cycleIdText: string;
  assetAddress: string;
  payer: string;
  timestamp: number;
  timestampCutoff: number;
  cumulativeGross: bigint;
  serverTime: number;
}> {
  constructor(
    details: TimestampNotPastCutoffError["details"],
    options?: RefusalOptions,
  ) {
    super(
      `payment timestamp ${details.timestamp} is not past the payer's ` +
        `checkpoint cutoff ${details.timestampCutoff}`,
      details,
      options,
    );
  }
}

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

/**
 * The pool cannot pay this much out right now; its strategy holds the rest.
 * Retry later, or withdraw `available` or less.
 */
export class InsufficientLiquidityError extends ContractError {
  readonly asset: string;
  readonly requested: bigint;
  readonly available: bigint;

  constructor(asset: string, requested: bigint, available: bigint) {
    super(
      `insufficient liquidity in ${asset}: requested ${requested}, available ${available}`,
    );
    this.asset = asset;
    this.requested = requested;
    this.available = available;
  }
}

/**
 * The pool has shares outstanding but nothing backing them, so no deposit can
 * be priced.
 */
export class PoolInsolventError extends ContractError {
  readonly asset: string;

  constructor(asset: string) {
    super(`the ${asset} pool is insolvent`);
    this.asset = asset;
  }
}

/** The Treasury is not accepting deposits. */
export class DepositsDisabledError extends ContractError {}

/** The Treasury is not accepting deposits of this stablecoin. */
export class StablecoinDepositsDisabledError extends ContractError {
  readonly asset: string;

  constructor(asset: string) {
    super(`deposits of ${asset} are disabled`);
    this.asset = asset;
  }
}

/** The Treasury is paused. */
export class PausedError extends ContractError {}

/** The token delivered a different amount than expected (fee-on-transfer). */
export class ValueMismatchError extends ContractError {}

/** The deposit was too small to mint any pool shares. */
export class ZeroCollateralCreditError extends ContractError {}

/** The signed authorization's `validBefore` has already passed. */
export class AuthorizationExpiredError extends ContractError {
  readonly validBefore: bigint;

  constructor(validBefore: bigint) {
    super(`authorization expired at ${validBefore}`);
    this.validBefore = validBefore;
  }
}

/** The signed authorization's `validAfter` is still in the future. */
export class AuthorizationNotYetValidError extends ContractError {
  readonly validAfter: bigint;

  constructor(validAfter: bigint) {
    super(`authorization is not valid until ${validAfter}`);
    this.validAfter = validAfter;
  }
}

/** The authorization nonce was already consumed for this user. */
export class AuthorizationAlreadyUsedError extends ContractError {
  readonly user: string;
  readonly nonce: string;

  constructor(user: string, nonce: string) {
    super(`authorization nonce ${nonce} was already used by ${user}`);
    this.user = user;
    this.nonce = nonce;
  }
}

/** Escrow holds less than the operation needs. */
export class EscrowUnderflowError extends ContractError {}

// --- ClearingHouse ------------------------------------------------------

/** The Merkle proof does not place this participant's leaf under the committed root. */
export class InvalidProofError extends ContractError {}

/** No clearing cycle is committed under this id. */
export class CycleNotFoundError extends ContractError {
  readonly cycleId: string;

  constructor(cycleId: string) {
    super(`clearing cycle ${cycleId} not found`);
    this.cycleId = cycleId;
  }
}

/** The cycle is not in a status that allows this action. */
export class InvalidCycleStatusError extends ContractError {
  readonly cycleId: string;
  readonly status: number;

  constructor(cycleId: string, status: number) {
    super(`clearing cycle ${cycleId} is in status ${status}`);
    this.cycleId = cycleId;
    this.status = status;
  }
}

/** This debtor's net debit for the cycle was already paid. */
export class AlreadyPaidError extends ContractError {
  readonly cycleId: string;
  readonly debtor: string;

  constructor(cycleId: string, debtor: string) {
    super(`${debtor} already paid its net debit for cycle ${cycleId}`);
    this.cycleId = cycleId;
    this.debtor = debtor;
  }
}

/** This creditor's net credit for the cycle was already claimed. */
export class AlreadyClaimedError extends ContractError {
  readonly cycleId: string;
  readonly creditor: string;

  constructor(cycleId: string, creditor: string) {
    super(`${creditor} already claimed its net credit for cycle ${cycleId}`);
    this.cycleId = cycleId;
    this.creditor = creditor;
  }
}

/** The cycle's payment window closed at `deadline`; the debit can no longer be paid. */
export class PaymentWindowElapsedError extends ContractError {
  readonly deadline: bigint;

  constructor(deadline: bigint) {
    super(`payment window elapsed at ${deadline}`);
    this.deadline = deadline;
  }
}

/** Debits may still arrive until `deadline`; claims open after it. */
export class PaymentFinalityPendingError extends ContractError {
  readonly deadline: bigint;

  constructor(deadline: bigint) {
    super(`payment finality pending until ${deadline}`);
    this.deadline = deadline;
  }
}

/** The native value attached did not equal the committed net debit. */
export class ExactPaymentRequiredError extends ContractError {
  readonly expected: bigint;
  readonly actual: bigint;

  constructor(expected: bigint, actual: bigint) {
    super(`exact payment required: expected ${expected}, got ${actual}`);
    this.expected = expected;
    this.actual = actual;
  }
}

/** The cycle has less funded liquidity than this claim needs. */
export class ClaimExceedsFundedLiquidityError extends ContractError {
  readonly available: bigint;
  readonly requested: bigint;

  constructor(available: bigint, requested: bigint) {
    super(
      `claim of ${requested} exceeds the cycle's funded liquidity of ${available}`,
    );
    this.available = available;
    this.requested = requested;
  }
}

/** The gasless authorization was signed for a different cycle. */
export class AuthorizationCycleMismatchError extends ContractError {
  readonly nonce: string;
  readonly cycleId: string;

  constructor(nonce: string, cycleId: string) {
    super(`authorization nonce ${nonce} is not bound to cycle ${cycleId}`);
    this.nonce = nonce;
    this.cycleId = cycleId;
  }
}

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
  /** The facilitator's own wording, without this SDK's prefix. */
  readonly reason: string;
  readonly eip2612Nonce?: bigint;

  constructor(reason: string, eip2612Nonce?: bigint) {
    super(`permit2 requires a prior approve(PERMIT2, ...): ${reason}`);
    this.reason = reason;
    this.eip2612Nonce = eip2612Nonce;
  }
}

// --- x402 ---------------------------------------------------------------

/** Thrown for x402 flow issues (invalid scheme, settlement errors, etc.). */
export class X402Error extends FourMicaError {}
