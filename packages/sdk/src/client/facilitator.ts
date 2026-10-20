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

export const NAMES_THE_REQUEST: ReadonlySet<string> = new Set([
  "INVALID_REQUEST",
  "MALFORMED_SIGNATURE",
  "SIGNATURE_MISMATCH",
  "EXPIRED",
  "NOT_YET_VALID",
  "NONCE_ALREADY_USED",
  "SIMULATION_REVERTED",
]);

export const NAMES_THE_CLAIM: ReadonlySet<string> = new Set([
  "INVALID_REQUEST",
  "ACTION_UNAVAILABLE",
  "ACTION_MISMATCH",
  "SIMULATION_REVERTED",
  "REVERTED_ON_CHAIN",
  "RECEIPT_UNAVAILABLE",
]);

export const NAMES_THE_PAYMENT: ReadonlySet<string> = new Set([
  ...NAMES_THE_CLAIM,
  "MALFORMED_SIGNATURE",
  "SIGNATURE_MISMATCH",
  "EXPIRED",
  "NOT_YET_VALID",
  "NONCE_ALREADY_USED",
  "INSUFFICIENT_BALANCE",
]);

const NEVER_ARRIVED_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EADDRNOTAVAIL",
  "ERR_INVALID_URL",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export function neverArrived(err: unknown): boolean {
  for (
    let cur: unknown = err;
    cur instanceof Error;
    cur = (cur as { cause?: unknown }).cause
  ) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code !== "string") continue;
    if (NEVER_ARRIVED_CODES.has(code) || code.startsWith("ERR_TLS_")) {
      return true;
    }
  }
  return false;
}

export class Facilitator {
  private baseUrl?: string;
  private fetchFn: FetchFn;

  constructor(baseUrl: string | undefined, fetchFn: FetchFn = fetch) {
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
    const fetchFn = this.fetchFn;
    let response: Response;
    try {
      response = await fetchFn(base + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const message = `facilitator request failed: ${err instanceof Error ? err.message : String(err)}`;
      throw neverArrived(err)
        ? new SponsorshipTransportError(message)
        : new OutcomeUnknownError(message);
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
