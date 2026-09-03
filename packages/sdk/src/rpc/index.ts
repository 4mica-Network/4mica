/**
 * HTTP client for the 4Mica core operator API.
 *
 * Mirrors `crates/rpc/src/proxy.rs`: the paths here are exactly the routes
 * core serves (`core/src/http.rs`); anything else is another service's
 * endpoint. GETs retry on 429/5xx; POSTs never do — they may have acted.
 */

import { ADMIN_API_KEY_HEADER } from "@/constants";
import { RpcError } from "@/errors";
import { normalizeBaseUrl, requestJson } from "@/http";
import {
  AssetBalanceInfo,
  BLSCert,
  ClearingParticipantProof,
  type ClearingSettlementAction,
  ClearingSettlementActionResponse,
  CorePublicParameters,
  RecipientPaymentInfo,
  SupportedTokensResponse,
  UserSuspensionStatus,
} from "@/models";
import type { BearerTokenProvider, FetchFn } from "@/rpc/models";

export type { BearerTokenProvider, FetchFn } from "@/rpc/models";

const SDK_CLIENT_HEADER_VALUE = `ts-sdk-4mica/${__SDK_VERSION__}`;

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RequestOptions {
  admin?: boolean;
  authed?: boolean;
}

export class RpcProxy {
  private baseUrl: string;
  private adminApiKey?: string;
  private bearerToken?: string;
  private bearerTokenProvider?: BearerTokenProvider;
  private fetchFn: FetchFn;

  constructor(endpoint: string, fetchFn: FetchFn = fetch) {
    this.baseUrl = normalizeBaseUrl(endpoint);
    this.fetchFn = fetchFn;
  }

  async aclose(): Promise<void> {
    // no-op for symmetry with the Python SDK
  }

  withAdminApiKey(key: string): RpcProxy {
    this.adminApiKey = key;
    return this;
  }

  withBearerToken(token: string): RpcProxy {
    this.bearerToken = token;
    return this;
  }

  withTokenProvider(provider: BearerTokenProvider): RpcProxy {
    this.bearerTokenProvider = provider;
    return this;
  }

  private async headers(
    options: RequestOptions,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "x-4mica-sdk": SDK_CLIENT_HEADER_VALUE,
    };
    if (options.admin && this.adminApiKey) {
      headers[ADMIN_API_KEY_HEADER] = this.adminApiKey;
    }
    if (options.authed === false) {
      return headers;
    }
    const token = await this.resolveBearerToken();
    if (token) {
      headers.Authorization = token;
    }
    return headers;
  }

  private async resolveBearerToken(): Promise<string | undefined> {
    let token: string | undefined;
    if (this.bearerTokenProvider) {
      token = await this.bearerTokenProvider();
    } else if (this.bearerToken) {
      token = this.bearerToken;
    }
    if (!token) {
      return undefined;
    }
    const trimmed = token.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed;
    }
    return `Bearer ${trimmed}`;
  }

  private async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let lastError: RpcError | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
      try {
        return await requestJson<T>(
          this.fetchFn,
          `${this.baseUrl}${path}`,
          {
            headers: await this.headers(options),
            method: "GET",
          },
          {
            decodeError: (message) => new RpcError(message),
            httpError: (message, response, body) =>
              new RpcError(message, { status: response.status, body }),
            wrapTransportError: (err) =>
              new RpcError(`request to ${path} failed: ${String(err)}`),
          },
        );
      } catch (err) {
        if (
          err instanceof RpcError &&
          err.status !== undefined &&
          RETRYABLE_STATUS_CODES.has(err.status)
        ) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError as RpcError;
  }

  private async post<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return requestJson<T>(
      this.fetchFn,
      `${this.baseUrl}${path}`,
      {
        headers: {
          "content-type": "application/json",
          ...(await this.headers(options)),
        },
        method: "POST",
        body: JSON.stringify(body),
      },
      {
        decodeError: (message) => new RpcError(message),
        httpError: (message, response, body) =>
          new RpcError(message, { status: response.status, body }),
        wrapTransportError: (err) =>
          new RpcError(`request to ${path} failed: ${String(err)}`),
      },
    );
  }

  async getPublicParams(): Promise<CorePublicParameters> {
    const data = await this.get<Record<string, unknown>>(
      "/core/public-params",
      { authed: false },
    );
    return CorePublicParameters.fromRpc(data);
  }

  async getSupportedTokens(): Promise<SupportedTokensResponse> {
    const data = await this.get<Record<string, unknown>>("/core/tokens", {
      authed: false,
    });
    return SupportedTokensResponse.fromRpc(data);
  }

  async health(): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>("/core/health", {
      authed: false,
    });
  }

  async issueGuarantee(body: unknown): Promise<BLSCert> {
    const data = await this.post<Record<string, unknown>>(
      "/core/guarantees",
      body,
    );
    return BLSCert.fromRpc(data);
  }

  /**
   * Fetch a participant's committed position + Merkle proof for a settlement
   * cycle.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier or the text id.
   * @param participant - Participant address.
   */
  async getClearingParticipantProof(
    cycleId: string,
    participant: string,
  ): Promise<ClearingParticipantProof> {
    const raw = await this.get<Record<string, unknown>>(
      `/core/cycles/${cycleId}/participants/${participant}/clearing-proof`,
    );
    return ClearingParticipantProof.fromRpc(raw);
  }

  /** Fetch a prepared ClearingHouse settlement action for a participant. */
  async getClearingSettlementAction(
    cycleId: string,
    participant: string,
    action: ClearingSettlementAction,
  ): Promise<ClearingSettlementActionResponse> {
    const raw = await this.get<Record<string, unknown>>(
      `/core/cycles/${cycleId}/participants/${participant}/clearing-action?action=${encodeURIComponent(action)}`,
    );
    return ClearingSettlementActionResponse.fromRpc(raw);
  }

  /** Prepared `payNetDebit` action for a net-debtor participant. */
  async getClearingPayNetDebitAction(
    cycleId: string,
    debtor: string,
  ): Promise<ClearingSettlementActionResponse> {
    return this.getClearingSettlementAction(cycleId, debtor, "pay_net_debit");
  }

  /** Prepared `claimNetCreditFor` action for a net-creditor participant. */
  async getClearingClaimNetCreditAction(
    cycleId: string,
    creditor: string,
  ): Promise<ClearingSettlementActionResponse> {
    return this.getClearingSettlementAction(
      cycleId,
      creditor,
      "claim_net_credit",
    );
  }

  async listRecipientPayments(
    recipientAddress: string,
  ): Promise<RecipientPaymentInfo[]> {
    const raw = await this.get<Record<string, unknown>[] | null>(
      `/core/recipients/${recipientAddress}/payments`,
    );
    return (raw ?? []).map((item) => RecipientPaymentInfo.fromRpc(item));
  }

  async getUserAssetBalance(
    userAddress: string,
    assetAddress: string,
  ): Promise<AssetBalanceInfo | null> {
    // Core answers JSON null (not 404) when the user holds nothing in the asset.
    const raw = await this.get<Record<string, unknown> | null>(
      `/core/users/${userAddress}/assets/${assetAddress}`,
    );
    return raw === null || raw === undefined
      ? null
      : AssetBalanceInfo.fromRpc(raw);
  }

  async updateUserSuspension(
    userAddress: string,
    suspended: boolean,
  ): Promise<UserSuspensionStatus> {
    const data = await this.post<Record<string, unknown>>(
      `/core/users/${userAddress}/suspension`,
      { suspended },
      { admin: true },
    );
    return UserSuspensionStatus.fromRpc(data);
  }
}
