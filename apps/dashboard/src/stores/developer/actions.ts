import actionTypes from "./actionTypes";
import type {
  ApiKey,
  RevealedSecret,
  Webhook,
  WebhookEvent,
  WebhookStatus,
} from "./type";

/** Identifies which row is busy, so only that row shows a spinner. */
export interface PendingMeta {
  pendingKey: string;
}

export const fetchDeveloper = () => ({
  type: actionTypes.FETCH_DEVELOPER_REQUESTED,
});

export const fetchDeveloperPending = () => ({
  type: actionTypes.FETCH_DEVELOPER_PENDING,
});

export const fetchDeveloperSucceeded = (payload: {
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  events: WebhookEvent[];
}) => ({
  type: actionTypes.FETCH_DEVELOPER_SUCCEEDED,
  payload,
});

export const fetchDeveloperFailed = (message: string) => ({
  type: actionTypes.FETCH_DEVELOPER_FAILED,
  payload: { message },
});

export const createApiKey = (payload: { name: string }) => ({
  type: actionTypes.CREATE_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: "createApiKey" },
});

export const createApiKeySucceeded = (
  apiKey: ApiKey,
  revealed: RevealedSecret,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_API_KEY_SUCCEEDED,
  payload: { apiKey, revealed },
  meta,
});

export const renameApiKey = (payload: { id: string; name: string }) => ({
  type: actionTypes.RENAME_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: `apiKey:${payload.id}` },
});

export const renameApiKeySucceeded = (apiKey: ApiKey, meta: PendingMeta) => ({
  type: actionTypes.RENAME_API_KEY_SUCCEEDED,
  payload: apiKey,
  meta,
});

export const revokeApiKey = (payload: { id: string }) => ({
  type: actionTypes.REVOKE_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: `apiKey:${payload.id}` },
});

export const revokeApiKeySucceeded = (apiKey: ApiKey, meta: PendingMeta) => ({
  type: actionTypes.REVOKE_API_KEY_SUCCEEDED,
  payload: apiKey,
  meta,
});

export const deleteApiKey = (payload: { id: string }) => ({
  type: actionTypes.DELETE_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: `apiKey:${payload.id}` },
});

export const deleteApiKeySucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_API_KEY_SUCCEEDED,
  payload: { id },
  meta,
});

export const createWebhook = (payload: {
  url: string;
  description?: string | null;
  events: string[];
}) => ({
  type: actionTypes.CREATE_WEBHOOK_REQUESTED,
  payload,
  meta: { pendingKey: "createWebhook" },
});

export const createWebhookSucceeded = (
  webhook: Webhook,
  revealed: RevealedSecret,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_WEBHOOK_SUCCEEDED,
  payload: { webhook, revealed },
  meta,
});

export const updateWebhook = (payload: {
  id: string;
  data: Partial<{
    url: string;
    description: string | null;
    events: string[];
    status: WebhookStatus;
  }>;
}) => ({
  type: actionTypes.UPDATE_WEBHOOK_REQUESTED,
  payload,
  meta: { pendingKey: `webhook:${payload.id}` },
});

export const updateWebhookSucceeded = (
  webhook: Webhook,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_WEBHOOK_SUCCEEDED,
  payload: webhook,
  meta,
});

export const rotateWebhookSecret = (payload: { id: string }) => ({
  type: actionTypes.ROTATE_WEBHOOK_SECRET_REQUESTED,
  payload,
  meta: { pendingKey: `webhook:${payload.id}` },
});

export const rotateWebhookSecretSucceeded = (
  webhook: Webhook,
  revealed: RevealedSecret,
  meta: PendingMeta,
) => ({
  type: actionTypes.ROTATE_WEBHOOK_SECRET_SUCCEEDED,
  payload: { webhook, revealed },
  meta,
});

export const deleteWebhook = (payload: { id: string }) => ({
  type: actionTypes.DELETE_WEBHOOK_REQUESTED,
  payload,
  meta: { pendingKey: `webhook:${payload.id}` },
});

export const deleteWebhookSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_WEBHOOK_SUCCEEDED,
  payload: { id },
  meta,
});

export const developerActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.DEVELOPER_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const dismissRevealedSecret = () => ({
  type: actionTypes.DISMISS_REVEALED_SECRET,
});
