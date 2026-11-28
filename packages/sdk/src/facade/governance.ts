import { formatUnits, ZERO_ADDRESS } from "@/amounts";
import { AppClient } from "@/app/client";
import { AppError } from "@/app/errors";
import type { SpendAuthorization } from "@/app/models";
import { SpendAccountingError, SpendAuthorizationError } from "@/errors";
import type {
  AccountingStatus,
  AssetRef,
  GovernanceOptions,
  GovernanceOutcome,
} from "@/facade/models";
import type { PaymentTerms } from "@/facade/protocols/types";

const DEFAULT_APPROVAL_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_ACCOUNTING_TIMEOUT_MS = 30_000;

const ACCOUNTING_ATTEMPTS = 3;
const ACCOUNTING_BASE_DELAY_MS = 250;

class DeadlineError extends Error {
  override name = "DeadlineError";
}

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const backoff = (attempt: number, cap: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(
      done,
      Math.min(
        cap,
        ACCOUNTING_BASE_DELAY_MS *
          2 ** (attempt - 1) *
          (0.5 + Math.random() / 2),
      ),
    );
    signal?.addEventListener("abort", done, { once: true });
  });

const bounded = (ms: number, outer?: AbortSignal) => {
  const controller = new AbortController();
  const abort = () => controller.abort(outer?.reason);
  const timer = setTimeout(
    () => controller.abort(new DOMException("timed out", "TimeoutError")),
    ms,
  );
  if (outer?.aborted) abort();
  else outer?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", abort);
    },
  };
};

const isTransient = (err: unknown) =>
  err instanceof AppError &&
  (err.status === undefined || err.status === 429 || err.status >= 500);

const outcomes = new WeakMap<Response, GovernanceOutcome>();

export function governanceOutcome(
  response: Response,
): GovernanceOutcome | undefined {
  return outcomes.get(response);
}

export function recordGovernanceOutcome(
  response: Response,
  outcome: GovernanceOutcome,
): void {
  outcomes.set(response, outcome);
}

export interface SpendRequest {
  terms: PaymentTerms;
  asset: AssetRef;
  payerAddress: string;
  url: string;
  signal?: AbortSignal;
}

export class SpendGovernor {
  private readonly app: AppClient;
  private readonly agentId?: string;
  private readonly approvalTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly accountingTimeoutMs: number;
  private readonly onAccountingError?: (error: SpendAccountingError) => void;

  constructor(options: GovernanceOptions, fetchFn?: typeof fetch) {
    this.app = new AppClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      fetch: fetchFn,
    });
    this.agentId = options.agentId;
    this.approvalTimeoutMs =
      options.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.accountingTimeoutMs =
      options.accountingTimeoutMs ?? DEFAULT_ACCOUNTING_TIMEOUT_MS;
    this.onAccountingError = options.onAccountingError;
  }

  async authorize({
    terms,
    asset,
    payerAddress,
    url,
    signal,
  }: SpendRequest): Promise<SpendAuthorization | SpendAuthorizationError> {
    signal?.throwIfAborted();
    const deadline = Date.now() + this.approvalTimeoutMs;
    const assetAddress = asset.address.toLowerCase();
    const input = {
      network: terms.network,
      assetAddress: assetAddress === ZERO_ADDRESS ? null : assetAddress,
      amount: formatUnits(terms.amount, asset.decimals),
      payerAddress,
      recipientAddress: terms.payTo,
      ...(this.agentId ? { agentId: this.agentId } : {}),
    };

    let authorization: SpendAuthorization;
    try {
      authorization = await this.call(deadline, signal, (bound) =>
        this.app.authorizeSpend(input, { signal: bound }),
      );
    } catch (err) {
      if (err instanceof DeadlineError) {
        throw new AppError(
          `spend authorization for ${url} did not answer within ${this.approvalTimeoutMs}ms`,
        );
      }
      throw err;
    }

    try {
      authorization = await this.awaitDecision(authorization, deadline, signal);
    } catch (err) {
      await this.release(authorization.id);
      if (err instanceof DeadlineError) {
        return new SpendAuthorizationError(
          "approval_timeout",
          url,
          authorization,
        );
      }
      throw err;
    }

    if (authorization.status !== "RESERVED") {
      return new SpendAuthorizationError("denied", url, {
        ...authorization,
        deniedReason:
          authorization.deniedReason ?? authorization.status.toLowerCase(),
      });
    }
    if (signal?.aborted) {
      await this.release(authorization.id);
      throw signal.reason;
    }
    return authorization;
  }

  consume(
    id: string,
    reqId?: string,
    signal?: AbortSignal,
  ): Promise<AccountingStatus> {
    return this.transition(
      "consume",
      id,
      (bound) =>
        this.app.consumeSpendAuthorization(id, reqId ? { reqId } : {}, {
          signal: bound,
        }),
      signal,
      reqId,
    );
  }

  release(id: string, signal?: AbortSignal): Promise<AccountingStatus> {
    return this.transition(
      "release",
      id,
      (bound) => this.app.releaseSpendAuthorization(id, { signal: bound }),
      signal,
    );
  }

  private async awaitDecision(
    authorization: SpendAuthorization,
    deadline: number,
    signal?: AbortSignal,
  ): Promise<SpendAuthorization> {
    let current = authorization;
    while (current.status === "PENDING_APPROVAL") {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DeadlineError();
      await pause(Math.min(this.pollIntervalMs, remaining), signal);
      const { id } = current;
      current = await this.call(deadline, signal, (bound) =>
        this.app.getSpendAuthorization(id, { signal: bound }),
      );
    }
    return current;
  }

  private async call<T>(
    deadline: number,
    signal: AbortSignal | undefined,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new DeadlineError();
    const limitedByDeadline = remaining <= this.requestTimeoutMs;
    const bound = bounded(Math.min(remaining, this.requestTimeoutMs), signal);
    try {
      return await request(bound.signal);
    } catch (err) {
      if (signal?.aborted) throw signal.reason;
      if (bound.signal.aborted) {
        throw limitedByDeadline
          ? new DeadlineError()
          : new AppError(
              `governance request timed out after ${this.requestTimeoutMs}ms`,
            );
      }
      throw err;
    } finally {
      bound.dispose();
    }
  }

  private async transition(
    name: "consume" | "release",
    id: string,
    request: (signal: AbortSignal) => Promise<unknown>,
    signal?: AbortSignal,
    reqId?: string,
  ): Promise<AccountingStatus> {
    const deadline = Date.now() + this.accountingTimeoutMs;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.call(deadline, signal, request);
        return "recorded";
      } catch (err) {
        let accounting: "pending" | "failed" = "failed";
        if (err instanceof DeadlineError || signal?.aborted) {
          accounting = "pending";
        } else if (isTransient(err) && attempt < ACCOUNTING_ATTEMPTS) {
          await backoff(attempt, Math.max(0, deadline - Date.now()), signal);
          if (!signal?.aborted && Date.now() < deadline) continue;
          accounting = "pending";
        }
        try {
          this.onAccountingError?.(
            new SpendAccountingError(name, id, accounting, err, reqId),
          );
        } catch {}
        return accounting;
      }
    }
  }
}
