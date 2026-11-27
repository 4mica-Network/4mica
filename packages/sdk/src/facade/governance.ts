import { formatUnits, ZERO_ADDRESS } from "@/amounts";
import { AppClient } from "@/app/client";
import type { SpendAuthorization } from "@/app/models";
import { SpendAuthorizationError } from "@/errors";
import type { AssetRef, GovernanceOptions } from "@/facade/models";
import type { PaymentTerms } from "@/facade/protocols/types";

const DEFAULT_APPROVAL_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

const ignore = () => undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  consume(id: string, reqId?: string): Promise<void> {
    return this.app
      .consumeSpendAuthorization(id, reqId ? { reqId } : {})
      .then(ignore, ignore);
  }

  release(id: string): Promise<void> {
    return this.app.releaseSpendAuthorization(id).then(ignore, ignore);
  }
}
