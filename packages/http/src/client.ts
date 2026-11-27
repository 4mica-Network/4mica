import { normalizeUrl } from "./normalize-url";
import {
  backoffDelay,
  DEFAULT_RETRY,
  DEFAULT_TIMEOUT_MS,
  HttpTimeoutError,
  isAbortError,
  isNetworkError,
  isRetryableStatus,
  linkSignals,
  type RetryPolicy,
  retryAfterMs,
  sleep,
} from "./resilience";
import { notifyUnauthorized, resolveAuthToken } from "./token";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
  PATCH = "PATCH",
}

export interface HttpRequestConfig<TData = unknown> {
  url: string;
  method: HttpMethod;
  data?: TData;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  timeoutMs?: number;
  retry?: RetryPolicy | false;
}

export interface HttpClientOptions {
  timeoutMs?: number;
  retry?: RetryPolicy | false;
}

const IDEMPOTENT_METHODS = new Set<string>([HttpMethod.GET]);

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly retryAfterMs: number | null;

  constructor(
    status: number,
    statusText: string,
    body: unknown,
    retryAfterMs: number | null = null,
  ) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}

export class HttpClient {
  private baseURL: string;
  private timeoutMs: number;
  private retry: RetryPolicy | false;

  constructor(baseURL: string, options: HttpClientOptions = {}) {
    this.baseURL = baseURL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = options.retry ?? DEFAULT_RETRY;
  }

  private buildUrl(
    url: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const normalizedUrl = url.startsWith("/") ? url.slice(1) : url;
    const base = this.baseURL.endsWith("/") ? this.baseURL : `${this.baseURL}/`;
    const fullUrl = new URL(normalizedUrl, base);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          fullUrl.searchParams.append(key, String(value));
        }
      }
    }

    return fullUrl.toString();
  }

  public async request<TResponse, TData = unknown>(
    config: HttpRequestConfig<TData>,
  ): Promise<TResponse> {
    const policy = IDEMPOTENT_METHODS.has(config.method)
      ? (config.retry ?? this.retry)
      : false;
    const retries = policy ? policy.retries : 0;

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.attempt<TResponse, TData>(config);
      } catch (error) {
        const delay =
          policy && attempt < retries
            ? this.retryDelay(error, attempt, policy)
            : null;
        if (delay === null) {
          throw error;
        }
        await sleep(delay, config.signal);
      }
    }
  }

  private retryDelay(
    error: unknown,
    attempt: number,
    policy: RetryPolicy,
  ): number | null {
    if (error instanceof HttpError) {
      if (!isRetryableStatus(error.status)) {
        return null;
      }
      const requested = error.retryAfterMs;
      if (requested !== null) {
        return requested <= policy.maxDelayMs ? requested : null;
      }
      return backoffDelay(attempt, policy);
    }
    if (error instanceof HttpTimeoutError || isNetworkError(error)) {
      return backoffDelay(attempt, policy);
    }
    return null;
  }

  private async attempt<TResponse, TData>(
    config: HttpRequestConfig<TData>,
  ): Promise<TResponse> {
    const {
      url,
      method,
      data,
      params,
      headers = {},
      signal,
      skipAuth,
      timeoutMs = this.timeoutMs,
    } = config;

    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new HttpTimeoutError(timeoutMs)),
      timeoutMs,
    );
    const linked = linkSignals(signal, timeout.signal);

    try {
      return await this.send<TResponse, TData>(
        { url, method, data, params, headers, skipAuth },
        linked.signal,
      );
    } catch (error) {
      if (timeout.signal.aborted && !signal?.aborted && isAbortError(error)) {
        throw timeout.signal.reason;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      linked.dispose();
    }
  }

  private async send<TResponse, TData>(
    config: Omit<HttpRequestConfig<TData>, "signal">,
    signal: AbortSignal,
  ): Promise<TResponse> {
    const { url, method, data, params, headers = {}, skipAuth } = config;

    const fullUrl = this.buildUrl(url, params);
    const isFormData =
      typeof FormData !== "undefined" && data instanceof FormData;

    const fetchHeaders = new Headers(headers);

    if (data && !isFormData && !fetchHeaders.has("Content-Type")) {
      fetchHeaders.set("Content-Type", "application/json");
    }

    if (!fetchHeaders.has("Accept")) {
      fetchHeaders.set("Accept", "application/json");
    }

    const attachesToken = !skipAuth && !fetchHeaders.has("Authorization");
    if (attachesToken) {
      const token = await resolveAuthToken();
      if (token) {
        fetchHeaders.set("Authorization", `Bearer ${token}`);
      }
    }

    const body = isFormData
      ? (data as FormData)
      : data
        ? JSON.stringify(data)
        : undefined;
    const send = () =>
      fetch(normalizeUrl(fullUrl), {
        method,
        headers: fetchHeaders,
        signal,
        body,
      });

    let response = await send();

    if (response.status === 401 && attachesToken) {
      const fresh = await resolveAuthToken({ forceRefresh: true });
      if (fresh && fresh !== fetchHeaders.get("Authorization")?.slice(7)) {
        fetchHeaders.set("Authorization", `Bearer ${fresh}`);
        response = await send();
      }
      if (response.status === 401) {
        notifyUnauthorized();
      }
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new HttpError(
        response.status,
        response.statusText,
        body,
        retryAfterMs(response.headers.get("retry-after")),
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return undefined as TResponse;
    }

    if (contentType.includes("application/json")) {
      return response.json() as Promise<TResponse>;
    }

    if (contentType.includes("text/")) {
      return response.text() as unknown as Promise<TResponse>;
    }

    if (contentType.includes("application/octet-stream")) {
      return response.blob() as unknown as Promise<TResponse>;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as TResponse;
  }

  public get<TResponse>(
    url: string,
    config: Omit<HttpRequestConfig, "url" | "method" | "data"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>({ ...config, url, method: HttpMethod.GET });
  }

  public post<TResponse, TData = unknown>(
    url: string,
    data?: TData,
    config: Omit<HttpRequestConfig<TData>, "url" | "method" | "data"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse, TData>({
      ...config,
      url,
      data,
      method: HttpMethod.POST,
    });
  }

  public patch<TResponse, TData = unknown>(
    url: string,
    data?: TData,
    config: Omit<HttpRequestConfig<TData>, "url" | "method" | "data"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse, TData>({
      ...config,
      url,
      data,
      method: HttpMethod.PATCH,
    });
  }

  public put<TResponse, TData = unknown>(
    url: string,
    data?: TData,
    config: Omit<HttpRequestConfig<TData>, "url" | "method" | "data"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse, TData>({
      ...config,
      url,
      data,
      method: HttpMethod.PUT,
    });
  }

  public delete<TResponse>(
    url: string,
    config: Omit<HttpRequestConfig, "url" | "method" | "data"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>({
      ...config,
      url,
      method: HttpMethod.DELETE,
    });
  }
}
