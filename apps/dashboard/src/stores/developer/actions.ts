import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  ApiKey,
  CliSession,
  NewCliToken,
  RevealSecret,
  Webhook,
  WebhookEvent,
  WebhookStatus,
} from "./type";

export const developerPendingKeys = {
  apiKey: (id: string) => `apiKey:${id}`,
  webhook: (id: string) => `webhook:${id}`,
  cliSession: (id: string) => `cliSession:${id}`,
} as const;

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

export const createApiKey = (
  payload: { name: string },
  onReveal?: RevealSecret,
) => ({
  type: actionTypes.CREATE_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: "createApiKey" },
  onReveal,
});

export const createApiKeySucceeded = (apiKey: ApiKey, meta: PendingMeta) => ({
  type: actionTypes.CREATE_API_KEY_SUCCEEDED,
  payload: { apiKey },
  meta,
});

export const renameApiKey = (payload: { id: string; name: string }) => ({
  type: actionTypes.RENAME_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: developerPendingKeys.apiKey(payload.id) },
});

export const renameApiKeySucceeded = (apiKey: ApiKey, meta: PendingMeta) => ({
  type: actionTypes.RENAME_API_KEY_SUCCEEDED,
  payload: apiKey,
  meta,
});

export const revokeApiKey = (payload: { id: string }) => ({
  type: actionTypes.REVOKE_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: developerPendingKeys.apiKey(payload.id) },
});

export const revokeApiKeySucceeded = (apiKey: ApiKey, meta: PendingMeta) => ({
  type: actionTypes.REVOKE_API_KEY_SUCCEEDED,
  payload: apiKey,
  meta,
});

export const deleteApiKey = (payload: { id: string }) => ({
  type: actionTypes.DELETE_API_KEY_REQUESTED,
  payload,
  meta: { pendingKey: developerPendingKeys.apiKey(payload.id) },
});

export const deleteApiKeySucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_API_KEY_SUCCEEDED,
  payload: { id },
  meta,
});

export const createWebhook = (
  payload: {
    url: string;
    description?: string | null;
    events: string[];
  },
  onReveal?: RevealSecret,
) => ({
  type: actionTypes.CREATE_WEBHOOK_REQUESTED,
  payload,
  meta: { pendingKey: "createWebhook" },
  onReveal,
});

export const createWebhookSucceeded = (
  webhook: Webhook,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_WEBHOOK_SUCCEEDED,
  payload: { webhook },
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
  meta: { pendingKey: developerPendingKeys.webhook(payload.id) },
});

export const updateWebhookSucceeded = (
  webhook: Webhook,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_WEBHOOK_SUCCEEDED,
  payload: webhook,
  meta,
});

export const rotateWebhookSecret = (
  payload: { id: string },
  onReveal?: RevealSecret,
) => ({
  type: actionTypes.ROTATE_WEBHOOK_SECRET_REQUESTED,
  payload,
  meta: { pendingKey: developerPendingKeys.webhook(payload.id) },
  onReveal,
});

export const rotateWebhookSecretSucceeded = (
  webhook: Webhook,
  meta: PendingMeta,
) => ({
  type: actionTypes.ROTATE_WEBHOOK_SECRET_SUCCEEDED,
  payload: { webhook },
  meta,
});

export const deleteWebhook = (payload: { id: string }) => ({
  type: actionTypes.DELETE_WEBHOOK_REQUESTED,
  payload,
  meta: { pendingKey: developerPendingKeys.webhook(payload.id) },
});

export const deleteWebhookSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_WEBHOOK_SUCCEEDED,
  payload: { id },
  meta,
});

export const fetchCliSessions = () => ({
  type: actionTypes.FETCH_CLI_SESSIONS_REQUESTED,
});

export const fetchCliSessionsPending = () => ({
  type: actionTypes.FETCH_CLI_SESSIONS_PENDING,
});

export const fetchCliSessionsSucceeded = (
  sessions: CliSession[],
  version: number,
) => ({
  type: actionTypes.FETCH_CLI_SESSIONS_SUCCEEDED,
  payload: { sessions, version },
});

export const fetchCliSessionsFailed = (message: string) => ({
  type: actionTypes.FETCH_CLI_SESSIONS_FAILED,
  payload: { message },
});

export const createCliToken = (
  payload: NewCliToken,
  onReveal?: RevealSecret,
) => ({
  type: actionTypes.CREATE_CLI_TOKEN_REQUESTED,
  payload,
  meta: { pendingKey: "createCliToken" },
  onReveal,
});

export const createCliTokenSucceeded = (
  session: CliSession,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_CLI_TOKEN_SUCCEEDED,
  payload: { session },
  meta,
});

export const revokeCliSession = (payload: { id: string }) => ({
  type: actionTypes.REVOKE_CLI_SESSION_REQUESTED,
  payload,
  meta: { pendingKey: developerPendingKeys.cliSession(payload.id) },
});

export const revokeCliSessionSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.REVOKE_CLI_SESSION_SUCCEEDED,
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
