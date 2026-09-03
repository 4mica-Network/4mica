/**
 * Transport for the service that submits signed authorizations and pays the
 * gas for them. Port of `sdk-rust/src/client/facilitator.rs`.
 *
 * The facilitator reports rejections in the body with a 200, so a non-success
 * status is a transport or routing problem rather than a refused request; a
 * request that provably never arrived is a {@link SponsorshipTransportError},
 * while anything that may have been acted on is an {@link OutcomeUnknownError}
 * — retrying those blindly risks paying twice.
 */

import {
  FacilitatorNotConfiguredError,
  FacilitatorRejectedError,
  MissingTokenDomainSeparatorError,
  OutcomeUnknownError,
  Permit2AllowanceRequiredError,
  SponsorshipError,
  SponsorshipTransportError,
} from "@/errors";
import type { FetchFn } from "@/rpc";
import { isRecord } from "@/serde";

// Rejections that describe the request itself rather than the facilitator's
// willingness to pay. The caller's own transaction would fail for the same
// reason, so falling back to self-funding just burns their gas on a revert.
export const NAMES_THE_REQUEST: ReadonlySet<string> = new Set([
  "INVALID_REQUEST",
  "MALFORMED_SIGNATURE",
  "SIGNATURE_MISMATCH",
  "EXPIRED",
  "NOT_YET_VALID",
  "NONCE_ALREADY_USED",
  "SIMULATION_REVERTED",
]);

// Additional claim-shaped rejections: the self-funded path resolves the same
// terms from the same core and submits to the same contract.
export const NAMES_THE_CLAIM: ReadonlySet<string> = new Set([
  "INVALID_REQUEST",
  "ACTION_UNAVAILABLE",
  "ACTION_MISMATCH",
  "SIMULATION_REVERTED",
  "REVERTED_ON_CHAIN",
  "RECEIPT_UNAVAILABLE",
]);

// Beyond the claim codes, the debtor's side of the bargain: a refused
// signature means this SDK signed over the wrong terms, and an insufficient
// balance fails the self-funded route just the same.
export const NAMES_THE_PAYMENT: ReadonlySet<string> = new Set([
  ...NAMES_THE_CLAIM,
  "MALFORMED_SIGNATURE",
  "SIGNATURE_MISMATCH",
  "EXPIRED",
  "NOT_YET_VALID",
  "NONCE_ALREADY_USED",
  "INSUFFICIENT_BALANCE",
]);

export class Facilitator {
  private baseUrl?: string;
  private fetchFn: FetchFn;

  constructor(baseUrl: string | undefined, fetchFn: FetchFn = fetch) {
    // undefined when none was configured; every call then fails with
    // FacilitatorNotConfiguredError rather than silently doing nothing.
    this.baseUrl = baseUrl;
    this.fetchFn = fetchFn;
  }

  isConfigured(): boolean {
    return this.baseUrl !== undefined;
  }

  async aclose(): Promise<void> {
    // no-op for symmetry with the Python SDK
  }

  async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.baseUrl === undefined) {
      throw new FacilitatorNotConfiguredError();
    }
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;

    let response: Response;
    try {
      response = await this.fetchFn(base + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // A rejected fetch is almost always a bad URL, DNS, or a refused
      // connection — nothing arrived, so the facilitator never acted.
      throw new SponsorshipTransportError(
        `facilitator request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const message = `facilitator returned ${response.status}: ${text}`;
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408
      ) {
        throw new SponsorshipTransportError(message);
      }
      throw new OutcomeUnknownError(message);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new OutcomeUnknownError(
        `malformed facilitator response: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!isRecord(payload)) {
      throw new OutcomeUnknownError(
        "malformed facilitator response: not an object",
      );
    }
    return payload;
  }
}

/**
 * Check a value the facilitator echoed back against what was asked for,
 * taking the request's own value when the echo is omitted. One that disagrees
 * — or cannot be read — means the receipt would describe a transaction nobody
 * asked for, and is refused as an unknown outcome.
 */
export function confirmFacilitatorEcho(
  field: string,
  raw: unknown,
  expected: string,
): string {
  if (raw === null || raw === undefined) {
    return expected;
  }
  if (String(raw).toLowerCase() === expected.toLowerCase()) {
    return expected;
  }
  throw new OutcomeUnknownError(
    `facilitator echoed ${field} ${raw}, expected ${expected}`,
  );
}

/**
 * The EIP-2612 nonce attached to a `PERMIT2_ALLOWANCE_REQUIRED` rejection —
 * the one value a client with no chain access cannot compute.
 */
export function eip2612NonceFrom(
  payload: Record<string, unknown>,
): bigint | undefined {
  const allowance = payload.permit2Allowance;
  if (!isRecord(allowance)) {
    return undefined;
  }
  const raw = allowance.eip2612Nonce;
  if (raw === null || raw === undefined) {
    return undefined;
  }
  try {
    return BigInt(String(raw));
  } catch {
    return undefined;
  }
}

/**
 * The typed rejection for a `success: false` / `isValid: false` body.
 * `errorCode` is carried verbatim so a caller can branch on a code this SDK
 * predates; absent `retryable` means "not retryable" — a facilitator that
 * omits it is not promising anything.
 */
export function rejectionError(
  payload: Record<string, unknown>,
  message: unknown,
): SponsorshipError {
  const code = payload.errorCode || "UNKNOWN";
  const text = String(message || payload.error || "facilitator gave no reason");
  if (code === "PERMIT2_ALLOWANCE_REQUIRED") {
    return new Permit2AllowanceRequiredError(text, eip2612NonceFrom(payload));
  }
  if (code === "NO_RELAYER_CONFIGURED" || code === "NO_RELAYER") {
    return new FacilitatorNotConfiguredError();
  }
  return new FacilitatorRejectedError(
    String(code),
    text,
    Boolean(payload.retryable),
  );
}

/**
 * Whether an error means "nobody sponsored this", as opposed to "this request
 * is bad" or "we do not know what happened". Only the first is worth paying
 * for a self-funded retry: a rejection naming the request would revert the
 * caller's own transaction too, and an unknown outcome may mean the
 * facilitator already submitted.
 */
export function sponsorshipUnavailable(
  err: unknown,
  namesTheRequest: ReadonlySet<string>,
): boolean {
  if (err instanceof OutcomeUnknownError) {
    return false;
  }
  if (err instanceof Permit2AllowanceRequiredError) {
    return false;
  }
  if (err instanceof FacilitatorRejectedError) {
    return !namesTheRequest.has(err.code);
  }
  return err instanceof SponsorshipError;
}

/**
 * Whether a rejection means "this token cannot take an EIP-3009
 * authorization" rather than "this request is bad". A token without
 * `receiveWithAuthorization` reverts opaquely, reported as a failed
 * simulation — retrying over Permit2 is a guess, but a cheap one: the
 * simulation spent no gas, and a genuinely bad request fails the second route
 * with its own error.
 */
export function refusesTheAuthorization(err: unknown): boolean {
  if (err instanceof MissingTokenDomainSeparatorError) {
    return true;
  }
  return (
    err instanceof FacilitatorRejectedError &&
    (err.code === "SIMULATION_REVERTED" ||
      err.code === "UNSUPPORTED_TRANSFER_METHOD")
  );
}
