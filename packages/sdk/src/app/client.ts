import { AppError } from "@/app/errors";
import type {
  AppPayment,
  CustomerResolution,
  ReportedPayment,
  ReportPaymentInput,
  ResolveCustomerInput,
  ResourceContext,
} from "@/app/models";
import { toAppNetwork } from "@/app/networks";
import { ConfigError } from "@/errors";
import { type FetchFn, normalizeBaseUrl } from "@/http";

export const DEFAULT_APP_BASE_URL = "https://api.app.4mica.io";

const SDK_CLIENT_HEADER_VALUE = `ts-sdk-4mica/${__SDK_VERSION__}`;

export interface AppClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchFn;
}

interface ErrorBody {
  error?: unknown;
  message?: unknown;
  issues?: unknown;
}

const toIssues = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter(
          (issue): issue is { path: string; message: string } =>
            typeof issue === "object" &&
            issue !== null &&
            typeof (issue as { path?: unknown }).path === "string" &&
            typeof (issue as { message?: unknown }).message === "string",
        )
        .map(({ path, message }) => ({ path, message }))
    : [];

export class AppClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;

  constructor(options: AppClientOptions) {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new ConfigError("an API key is required to call the 4Mica API");
    }
    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_APP_BASE_URL);
    this.fetchFn = options.fetch ?? fetch;
  }

  async resource(): Promise<ResourceContext> {
    const { body } = await this.request<ResourceContext>("GET", "/v1/resource");
    return body;
  }

  async resolveCustomer(
    input: ResolveCustomerInput,
  ): Promise<CustomerResolution> {
    const { body } = await this.request<CustomerResolution>(
      "POST",
      "/v1/customers/resolve",
      { ...input, network: toAppNetwork(input.network) },
    );
    return body;
  }

  async reportPayment(input: ReportPaymentInput): Promise<ReportedPayment> {
    const { status, body } = await this.request<AppPayment>(
      "POST",
      "/v1/payments",
      { ...input, network: toAppNetwork(input.network) },
    );
    return { payment: body, created: status === 201 };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    payload?: unknown,
  ): Promise<{ status: number; body: T }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      "x-4mica-sdk": SDK_CLIENT_HEADER_VALUE,
    };
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
    }

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    } catch (err) {
      throw new AppError(`request to ${path} failed: ${String(err)}`);
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new AppError(`invalid JSON response from ${path}`, {
          status: response.status,
          body: text,
        });
      }
    }

    if (!response.ok) {
      const error = (body ?? {}) as ErrorBody;
      const code = typeof error.error === "string" ? error.error : undefined;
      const message =
        typeof error.message === "string"
          ? error.message
          : `request to ${path} failed with ${response.status}`;
      throw new AppError(message, {
        status: response.status,
        code,
        issues: toIssues(error.issues),
        body,
      });
    }

    return { status: response.status, body: body as T };
  }
}

export function createAppClient(options: AppClientOptions): AppClient {
  return new AppClient(options);
}
