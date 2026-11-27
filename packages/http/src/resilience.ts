export class HttpTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs} ms`);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface RetryPolicy {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_RETRY: RetryPolicy = {
  retries: 2,
  baseDelayMs: 300,
  maxDelayMs: 5_000,
};

const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

export const isRetryableStatus = (status: number): boolean =>
  RETRYABLE_STATUSES.has(status);

export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

export const isNetworkError = (error: unknown): boolean =>
  error instanceof TypeError;

export const backoffDelay = (
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number =>
  Math.round(
    random() * Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt),
  );

export const retryAfterMs = (
  header: string | null,
  now: number = Date.now(),
): number | null => {
  if (!header) {
    return null;
  }
  const value = header.trim();
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
};

export const linkSignals = (
  ...signals: (AbortSignal | undefined)[]
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];

  for (const source of signals) {
    if (!source) {
      continue;
    }
    if (source.aborted) {
      controller.abort(source.reason);
      break;
    }
    const forward = () => controller.abort(source.reason);
    source.addEventListener("abort", forward, { once: true });
    cleanups.push(() => source.removeEventListener("abort", forward));
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
};

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
