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

const ACCOUNTING_ATTEMPTS = 3;
const ACCOUNTING_BASE_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backoff = (attempt: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(
      done,
      ACCOUNTING_BASE_DELAY_MS * 2 ** (attempt - 1) * (0.5 + Math.random() / 2),
    );
    signal?.addEventListener("abort", done, { once: true });
  });

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
}

export class SpendGovernor {
  private readonly app: AppClient;
  private readonly agentId?: string;
  private readonly approvalTimeoutMs: number;
  private readonly pollIntervalMs: number;
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
    this.onAccountingError = options.onAccountingError;
  }

  async authorize({
    terms,
    asset,
    payerAddress,
    url,
  }: SpendRequest): Promise<SpendAuthorization | SpendAuthorizationError> {
    const assetAddress = asset.address.toLowerCase();
    let authorization = await this.app.authorizeSpend({
      network: terms.network,
      assetAddress: assetAddress === ZERO_ADDRESS ? null : assetAddress,
      amount: formatUnits(terms.amount, asset.decimals),
      payerAddress,
      recipientAddress: terms.payTo,
      ...(this.agentId ? { agentId: this.agentId } : {}),
    });

    const deadline = Date.now() + this.approvalTimeoutMs;
    while (authorization.status === "PENDING_APPROVAL") {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        await this.release(authorization.id);
        return new SpendAuthorizationError(
          "approval_timeout",
          url,
          authorization,
        );
      }
      await sleep(Math.min(this.pollIntervalMs, remaining));
      authorization = await this.app.getSpendAuthorization(authorization.id);
    }

    if (authorization.status !== "RESERVED") {
      return new SpendAuthorizationError("denied", url, {
        ...authorization,
        deniedReason:
          authorization.deniedReason ?? authorization.status.toLowerCase(),
      });
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
      () => this.app.consumeSpendAuthorization(id, reqId ? { reqId } : {}),
      signal,
      reqId,
    );
  }

  release(id: string, signal?: AbortSignal): Promise<AccountingStatus> {
    return this.transition(
      "release",
      id,
      () => this.app.releaseSpendAuthorization(id),
      signal,
    );
  }

  private async transition(
    name: "consume" | "release",
    id: string,
    call: () => Promise<unknown>,
    signal?: AbortSignal,
    reqId?: string,
  ): Promise<AccountingStatus> {
    for (let attempt = 1; ; attempt++) {
      try {
        await call();
        return "recorded";
      } catch (err) {
        let accounting: "pending" | "failed" = "failed";
        if (isTransient(err) && attempt < ACCOUNTING_ATTEMPTS) {
          await backoff(attempt, signal);
          if (!signal?.aborted) continue;
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
