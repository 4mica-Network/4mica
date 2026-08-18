import { normalizeUrl } from "./normalize-url";
import { resolveAuthToken } from "./token";

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
}

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`HTTP ${status} ${statusText}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export class HttpClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
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
    const {
      url,
      method,
      data,
      params,
      headers = {},
      signal,
      skipAuth,
    } = config;

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

    if (!skipAuth && !fetchHeaders.has("Authorization")) {
      const token = await resolveAuthToken();
      if (token) {
        fetchHeaders.set("Authorization", `Bearer ${token}`);
      }
    }

    const response = await fetch(normalizeUrl(fullUrl), {
      method,
      headers: fetchHeaders,
      signal,
      body: isFormData
        ? (data as FormData)
        : data
          ? JSON.stringify(data)
          : undefined,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new HttpError(response.status, response.statusText, body);
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
