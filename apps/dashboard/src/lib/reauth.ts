import { HttpError } from "@4mica/http";

export const REAUTH_REQUIRED = "reauth_required";

export type Reverifier = () => Promise<boolean>;

export class ReauthCancelledError extends Error {
  constructor() {
    super("Reverification was cancelled.");
    this.name = "ReauthCancelledError";
  }
}

export class ReauthUnavailableError extends Error {
  constructor() {
    super("Reverification is not available. Sign in again.");
    this.name = "ReauthUnavailableError";
  }
}

let reverifier: Reverifier | null = null;
let inFlight: Promise<boolean> | null = null;

export const setReverifier = (next: Reverifier | null): void => {
  reverifier = next;
};

export const needsReauth = (error: unknown): boolean =>
  error instanceof HttpError &&
  error.status === 403 &&
  (error.body as { error?: unknown } | null)?.error === REAUTH_REQUIRED;

const reverifyOnce = (current: Reverifier): Promise<boolean> => {
  inFlight ??= current().finally(() => {
    inFlight = null;
  });
  return inFlight;
};

export const withReauth = async <T>(send: () => Promise<T>): Promise<T> => {
  try {
    return await send();
  } catch (error) {
    if (!needsReauth(error)) {
      throw error;
    }
    const current = reverifier;
    if (!current) {
      throw new ReauthUnavailableError();
    }
    let verified: boolean;
    try {
      verified = await reverifyOnce(current);
    } catch {
      throw new ReauthUnavailableError();
    }
    if (!verified) {
      throw new ReauthCancelledError();
    }
    return send();
  }
};
