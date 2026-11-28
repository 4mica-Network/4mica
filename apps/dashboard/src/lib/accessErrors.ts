import { HttpError } from "@4mica/http";

export const ACCESS_ERROR_CODES = [
  "mfa_required",
  "sso_required",
  "session_too_old",
  "ip_not_allowed",
  "member_suspended",
] as const;

export type AccessErrorCode = (typeof ACCESS_ERROR_CODES)[number];

export interface AccessError {
  code: AccessErrorCode;
  message: string | null;
  domain: string | null;
}

export type AccessErrorHandler = (error: AccessError) => void;

export const ACCESS_ERROR_DEDUPE_MS = 5_000;

const isAccessCode = (value: unknown): value is AccessErrorCode =>
  (ACCESS_ERROR_CODES as readonly unknown[]).includes(value);

export const accessErrorFromBody = (body: unknown): AccessError | null => {
  const value = body as {
    error?: unknown;
    message?: unknown;
    domain?: unknown;
  } | null;
  if (!value || typeof value !== "object" || !isAccessCode(value.error)) {
    return null;
  }
  return {
    code: value.error,
    message: typeof value.message === "string" ? value.message : null,
    domain: typeof value.domain === "string" ? value.domain : null,
  };
};

export const accessErrorOf = (error: unknown): AccessError | null =>
  error instanceof HttpError && (error.status === 401 || error.status === 403)
    ? accessErrorFromBody(error.body)
    : null;

let handler: AccessErrorHandler | null = null;
const lastReported = new Map<AccessErrorCode, number>();

export const setAccessErrorHandler = (next: AccessErrorHandler | null) => {
  handler = next;
  lastReported.clear();
};

export const reportAccessError = (
  access: AccessError | null,
  now = Date.now(),
): boolean => {
  if (!access || !handler) {
    return false;
  }
  const previous = lastReported.get(access.code);
  if (previous !== undefined && now - previous < ACCESS_ERROR_DEDUPE_MS) {
    return false;
  }
  lastReported.set(access.code, now);
  try {
    handler(access);
  } catch {}
  return true;
};
