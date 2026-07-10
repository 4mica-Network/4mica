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

/** Thrown when the SDK client fails to initialise (e.g. chain ID mismatch). */
export class ClientInitializationError extends FourMicaError {}

/** Thrown when signing a payment claim fails (e.g. unsupported scheme, address mismatch). */
export class SigningError extends FourMicaError {}

/** Thrown when an on-chain contract call fails or returns an unexpected result. */
export class ContractError extends FourMicaError {}

/** Thrown when BLS certificate verification fails (e.g. domain mismatch, invalid encoding). */
export class VerificationError extends FourMicaError {}

/** Thrown when an x402 HTTP payment flow encounters an error. */
export class X402Error extends FourMicaError {}

/** Base class for authentication-related errors. */
export class AuthError extends FourMicaError {}

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

/** Thrown when auth configuration is invalid. */
export class AuthConfigError extends AuthError {}

/** Thrown when an authenticated operation is attempted without auth being configured. */
export class AuthMissingConfigError extends AuthConfigError {}
