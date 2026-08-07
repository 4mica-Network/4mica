import { HttpMethod } from "@4mica/http";
import type {
  ApiKey,
  Webhook,
  WebhookEvent,
  WebhookStatus,
} from "@stores/developer/type";
import { httpClient } from "./client";

export interface CreatedApiKey {
  apiKey: ApiKey;
  plaintext: string;
}

export interface CreatedWebhook {
  webhook: Webhook;
  plaintext: string;
}

export const getWebhookEvents = () =>
  httpClient.request<WebhookEvent[]>({
    url: "/webhook-events",
    method: HttpMethod.GET,
  });

export const getApiKeys = () =>
  httpClient.request<ApiKey[]>({
    url: "/me/api-keys",
    method: HttpMethod.GET,
  });

export const createApiKey = (data: {
  name: string;
  expiresAt?: string | null;
}) =>
  httpClient.request<CreatedApiKey, typeof data>({
    url: "/me/api-keys",
    method: HttpMethod.POST,
    data,
  });

export const renameApiKey = (id: string, name: string) =>
  httpClient.request<ApiKey, { name: string }>({
    url: `/me/api-keys/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data: { name },
  });

export const revokeApiKey = (id: string) =>
  httpClient.request<ApiKey>({
    url: `/me/api-keys/${encodeURIComponent(id)}/revoke`,
    method: HttpMethod.POST,
  });

export const deleteApiKey = (id: string) =>
  httpClient.request<void>({
    url: `/me/api-keys/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

export const getWebhooks = () =>
  httpClient.request<Webhook[]>({
    url: "/me/webhooks",
    method: HttpMethod.GET,
  });

export const createWebhook = (data: {
  url: string;
  description?: string | null;
  events: string[];
}) =>
  httpClient.request<CreatedWebhook, typeof data>({
    url: "/me/webhooks",
    method: HttpMethod.POST,
    data,
  });

export const updateWebhook = (
  id: string,
  data: Partial<{
    url: string;
    description: string | null;
    events: string[];
    status: WebhookStatus;
  }>,
) =>
  httpClient.request<Webhook, typeof data>({
    url: `/me/webhooks/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const rotateWebhookSecret = (id: string) =>
  httpClient.request<CreatedWebhook>({
    url: `/me/webhooks/${encodeURIComponent(id)}/rotate-secret`,
    method: HttpMethod.POST,
  });

export const deleteWebhook = (id: string) =>
  httpClient.request<void>({
    url: `/me/webhooks/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });
