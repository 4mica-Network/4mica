import { ADMIN_API_KEY_HEADER } from "@/constants";
import { RpcError } from "@/errors";
import {
  type FetchFn as HttpFetchFn,
  normalizeBaseUrl,
  requestJson,
} from "@/http";
import {
  AdminApiKeyInfo,
  AdminApiKeySecret,
  type ClearingSettlementActionKind,
  CorePublicParameters,
  SupportedTokensResponse,
  UserSuspensionStatus,
} from "@/models";

const SDK_CLIENT_HEADER_VALUE = `ts-sdk-4mica/${__SDK_VERSION__}`;

export type FetchFn = HttpFetchFn;
export type BearerTokenProvider = () => string | Promise<string>;

export class RpcProxy {
  private baseUrl: string;
  private adminApiKey?: string;
  private bearerToken?: string;
  private bearerTokenProvider?: BearerTokenProvider;
  private fetchFn: FetchFn;

  constructor(
    endpoint: string,
    adminApiKey?: string,
    fetchFn: FetchFn = fetch,
  ) {
    this.baseUrl = normalizeBaseUrl(endpoint);
    this.adminApiKey = adminApiKey;
    this.fetchFn = fetchFn;
  }

  async aclose(): Promise<void> {
    // no-op for symmetry with Python SDK
  }

  withBearerToken(token: string): RpcProxy {
    this.bearerToken = token;
    return this;
  }

  withTokenProvider(provider: BearerTokenProvider): RpcProxy {
    this.bearerTokenProvider = provider;
    return this;
  }

  private async headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "x-4mica-sdk": SDK_CLIENT_HEADER_VALUE,
    };
    if (this.adminApiKey) {
      headers[ADMIN_API_KEY_HEADER] = this.adminApiKey;
    }
    const token = await this.resolveBearerToken();
    if (token) {
      headers["Authorization"] = token;
    }
    return headers;
  }

  private async resolveBearerToken(): Promise<string | undefined> {
    let token = this.bearerToken;
    if (!token && this.bearerTokenProvider) {
      token = await this.bearerTokenProvider();
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

  private async get<T>(path: string): Promise<T> {
    return requestJson<T>(
      this.fetchFn,
      `${this.baseUrl}${path}`,
      {
        headers: await this.headers(),
        method: "GET",
      },
      {
        decodeError: (message) => new RpcError(message),
        httpError: (message, response, body) =>
          new RpcError(message, {
            status: response.status,
            body,
          }),
      },
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return requestJson<T>(
      this.fetchFn,
      `${this.baseUrl}${path}`,
      {
        headers: {
          "content-type": "application/json",
          ...(await this.headers()),
        },
        method: "POST",
        body: JSON.stringify(body),
      },
      {
        decodeError: (message) => new RpcError(message),
        httpError: (message, response, body) =>
          new RpcError(message, {
            status: response.status,
            body,
          }),
      },
    );
  }

  async getPublicParams(): Promise<CorePublicParameters> {
    const data = await this.get<Record<string, unknown>>("/core/public-params");
    return CorePublicParameters.fromRpc(data);
  }

  async getSupportedTokens(): Promise<SupportedTokensResponse> {
    const data = await this.get<Record<string, unknown>>("/core/tokens");
    return SupportedTokensResponse.fromRpc(data);
  }

  async issueGuarantee(body: unknown): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>("/core/guarantees", body);
  }

  /**
   * Fetch a participant's committed position + Merkle proof for a settlement cycle.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param participant - Participant address.
   */
  async getClearingParticipantProof(
    cycleId: string,
    participant: string,
  ): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `/core/cycles/${cycleId}/participants/${participant}/clearing-proof`,
    );
  }

  /**
   * Fetch a prepared ClearingHouse settlement action for a participant.
   *
   * @param cycleId - On-chain `bytes32` cycle identifier.
   * @param participant - Participant address.
   * @param action - `pay_net_debit`, `claim_net_credit`, or `mark_defaulted`.
   */
  async getClearingSettlementAction(
    cycleId: string,
    participant: string,
    action: ClearingSettlementActionKind,
  ): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(
      `/core/cycles/${cycleId}/participants/${participant}/clearing-action?action=${encodeURIComponent(action)}`,
    );
  }

  /** Prepared `payNetDebit` action for a net-debtor participant. */
  async getClearingPayNetDebitAction(
    cycleId: string,
    debtor: string,
  ): Promise<Record<string, unknown>> {
    return this.getClearingSettlementAction(cycleId, debtor, "pay_net_debit");
  }

  /** Prepared `claimNetCredit` action for a net-creditor participant. */
  async getClearingClaimNetCreditAction(
    cycleId: string,
    creditor: string,
  ): Promise<Record<string, unknown>> {
    return this.getClearingSettlementAction(
      cycleId,
      creditor,
      "claim_net_credit",
    );
  }

  /** Prepared `markDefaulted` action for a debtor past the payment deadline. */
  async getClearingMarkDefaultedAction(
    cycleId: string,
    debtor: string,
  ): Promise<Record<string, unknown>> {
    return this.getClearingSettlementAction(cycleId, debtor, "mark_defaulted");
  }

  async listRecipientPayments(
    recipientAddress: string,
  ): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(
      `/core/recipients/${recipientAddress}/payments`,
    );
  }

  async getUserAssetBalance(
    userAddress: string,
    assetAddress: string,
  ): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown> | null>(
      `/core/users/${userAddress}/assets/${assetAddress}`,
    );
  }

  async updateUserSuspension(
    userAddress: string,
    suspended: boolean,
  ): Promise<UserSuspensionStatus> {
    const data = await this.post<Record<string, unknown>>(
      `/core/users/${userAddress}/suspension`,
      {
        suspended,
      },
    );
    return UserSuspensionStatus.fromRpc(data);
  }

  async createAdminApiKey(body: unknown): Promise<AdminApiKeySecret> {
    const data = await this.post<Record<string, unknown>>(
      "/core/admin/api-keys",
      body,
    );
    return AdminApiKeySecret.fromRpc(data);
  }

  async listAdminApiKeys(): Promise<AdminApiKeyInfo[]> {
    const data = await this.get<Record<string, unknown>[]>(
      "/core/admin/api-keys",
    );
    return data.map((entry) => AdminApiKeyInfo.fromRpc(entry));
  }

  async revokeAdminApiKey(keyId: string): Promise<AdminApiKeyInfo> {
    const data = await this.post<Record<string, unknown>>(
      `/core/admin/api-keys/${keyId}/revoke`,
      {},
    );
    return AdminApiKeyInfo.fromRpc(data);
  }
}
