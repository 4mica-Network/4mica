import { ADMIN_API_KEY_HEADER } from "./constants";
import { RpcError } from "./errors";
import {
  type FetchFn as HttpFetchFn,
  normalizeBaseUrl,
  requestJson,
} from "./http";
import {
  AdminApiKeyInfo,
  AdminApiKeySecret,
  CorePublicParameters,
  SupportedTokensResponse,
  UserSuspensionStatus,
} from "./models";

const SDK_CLIENT_HEADER_VALUE = `ts-sdk-4mica/${__SDK_VERSION__}`;

export type FetchFn = HttpFetchFn;
export type BearerTokenProvider = () => string | Promise<string>;

function serializeTabId(tabId: number | bigint): string {
  return `0x${BigInt(tabId).toString(16)}`;
}

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

  async createPaymentTab(body: unknown): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>("/core/payment-tabs", body);
  }

  async listSettledTabs(
    recipientAddress: string,
  ): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(
      `/core/recipients/${recipientAddress}/settled-tabs`,
    );
  }

  async listPendingRemunerations(
    recipientAddress: string,
  ): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(
      `/core/recipients/${recipientAddress}/pending-remunerations`,
    );
  }

  async getTab(
    tabId: number | bigint,
  ): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown> | null>(
      `/core/tabs/${serializeTabId(tabId)}`,
    );
  }

  async listRecipientTabs(
    recipientAddress: string,
    settlementStatuses?: string[],
  ): Promise<Record<string, unknown>[]> {
    let query = "";
    if (settlementStatuses?.length) {
      query =
        "?" +
        settlementStatuses
          .map((s) => `settlement_status=${encodeURIComponent(s)}`)
          .join("&");
    }
    return this.get<Record<string, unknown>[]>(
      `/core/recipients/${recipientAddress}/tabs${query}`,
    );
  }

  async listUserTabs(
    userAddress: string,
    settlementStatuses?: string[],
  ): Promise<Record<string, unknown>[]> {
    let query = "";
    if (settlementStatuses?.length) {
      query =
        "?" +
        settlementStatuses
          .map((s) => `settlement_status=${encodeURIComponent(s)}`)
          .join("&");
    }
    return this.get<Record<string, unknown>[]>(
      `/core/users/${userAddress}/tabs${query}`,
    );
  }

  async getTabGuarantees(
    tabId: number | bigint,
  ): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(
      `/core/tabs/${serializeTabId(tabId)}/guarantees`,
    );
  }

  async getLatestGuarantee(
    tabId: number | bigint,
  ): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown> | null>(
      `/core/tabs/${serializeTabId(tabId)}/guarantees/latest`,
    );
  }

  async getGuarantee(
    tabId: number | bigint,
    reqId: number | bigint,
  ): Promise<Record<string, unknown> | null> {
    return this.get<Record<string, unknown> | null>(
      `/core/tabs/${serializeTabId(tabId)}/guarantees/${reqId}`,
    );
  }

  async listRecipientPayments(
    recipientAddress: string,
  ): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(
      `/core/recipients/${recipientAddress}/payments`,
    );
  }

  async getCollateralEventsForTab(
    tabId: number | bigint,
  ): Promise<Record<string, unknown>[]> {
    return this.get<Record<string, unknown>[]>(
      `/core/tabs/${serializeTabId(tabId)}/collateral-events`,
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
