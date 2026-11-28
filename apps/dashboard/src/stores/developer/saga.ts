import * as cliApi from "@api/cli";
import * as api from "@api/developer";
import i18n from "@i18n";
import { handledAsApproval } from "@stores/approvalRequired";
import type { RootState } from "@stores/index";
import {
  refreshAfterWrite,
  writeSucceededTypes,
} from "@stores/refreshAfterWrite";
import type { PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import {
  all,
  call,
  put,
  select,
  takeEvery,
  takeLatest,
} from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  createApiKeySucceeded,
  createCliTokenSucceeded,
  createWebhookSucceeded,
  deleteApiKeySucceeded,
  deleteWebhookSucceeded,
  developerActionFailed,
  fetchCliSessions as fetchCliSessionsAgain,
  fetchCliSessionsFailed,
  fetchCliSessionsPending,
  fetchCliSessionsSucceeded,
  fetchDeveloperFailed,
  fetchDeveloperPending,
  fetchDeveloperSucceeded,
  renameApiKeySucceeded,
  revokeApiKeySucceeded,
  revokeCliSessionSucceeded,
  rotateWebhookSecretSucceeded,
  updateWebhookSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import type {
  ApiKeyScope,
  NewCliToken,
  RevealSecret,
  WebhookStatus,
} from "./type";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  if (yield* handledAsApproval(error, developerActionFailed("", {}, meta))) {
    return;
  }
  const message = toMessage(error, fallback);
  yield put(developerActionFailed(message, toIssueMap(error), meta));
  notifyError({
    title: t("store.developer.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchDeveloper(): Generator {
  try {
    yield put(fetchDeveloperPending());
    const [apiKeys, webhooks, events] = (yield all([
      call(api.getApiKeys),
      call(api.getWebhooks),
      call(() => api.getWebhookEvents().catch(() => [])),
    ])) as [
      Awaited<ReturnType<typeof api.getApiKeys>>,
      Awaited<ReturnType<typeof api.getWebhooks>>,
      Awaited<ReturnType<typeof api.getWebhookEvents>>,
    ];
    yield put(fetchDeveloperSucceeded({ apiKeys, webhooks, events }));
  } catch (error) {
    yield put(
      fetchDeveloperFailed(
        toMessage(
          error,
          t("store.developer.fetchFailed", "Couldn't load developer settings."),
        ),
      ),
    );
  }
}

export function* createApiKey(action: {
  type: string;
  payload: { name: string; scopes?: ApiKeyScope[]; ipAllowlist?: string[] };
  meta: PendingMeta;
  onReveal?: RevealSecret;
}): Generator {
  try {
    const created = (yield call(() =>
      api.createApiKey(action.payload),
    )) as Awaited<ReturnType<typeof api.createApiKey>>;

    yield put(createApiKeySucceeded(created.apiKey, action.meta));
    action.onReveal?.({
      kind: "apiKey",
      id: created.apiKey.id,
      plaintext: created.plaintext,
    });
    notifySuccess({
      title: t("store.developer.keyCreated", "API key created"),
      content: t(
        "store.developer.keyCreatedBody",
        "Copy it now — it will not be shown again.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't create the API key.", action.meta);
  }
}

export function* renameApiKey(action: {
  type: string;
  payload: { id: string; name?: string; ipAllowlist?: string[] };
  meta: PendingMeta;
}): Generator {
  try {
    const { id, ...data } = action.payload;
    const key = (yield call(() => api.updateApiKey(id, data))) as Awaited<
      ReturnType<typeof api.updateApiKey>
    >;
    yield put(renameApiKeySucceeded(key, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't rename the API key.", action.meta);
  }
}

export function* revokeApiKey(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    const key = (yield call(() =>
      api.revokeApiKey(action.payload.id),
    )) as Awaited<ReturnType<typeof api.revokeApiKey>>;
    yield put(revokeApiKeySucceeded(key, action.meta));
    notifySuccess({
      title: t("store.developer.keyRevoked", "API key revoked"),
      content: t(
        "store.developer.keyRevokedBody",
        "Requests using this key will now be rejected.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't revoke the API key.", action.meta);
  }
}

export function* deleteApiKey(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteApiKey(action.payload.id));
    yield put(deleteApiKeySucceeded(action.payload.id, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't delete the API key.", action.meta);
  }
}

export function* createWebhook(action: {
  type: string;
  payload: { url: string; description?: string | null; events: string[] };
  meta: PendingMeta;
  onReveal?: RevealSecret;
}): Generator {
  try {
    const created = (yield call(() =>
      api.createWebhook(action.payload),
    )) as Awaited<ReturnType<typeof api.createWebhook>>;

    yield put(createWebhookSucceeded(created.webhook, action.meta));
    action.onReveal?.({
      kind: "webhookSecret",
      id: created.webhook.id,
      plaintext: created.plaintext,
    });
    notifySuccess({
      title: t("store.developer.webhookCreated", "Webhook created"),
      content: t(
        "store.developer.webhookCreatedBody",
        "Copy the signing secret now — it will not be shown again.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't create the webhook.", action.meta);
  }
}

export function* updateWebhook(action: {
  type: string;
  payload: {
    id: string;
    data: Partial<{
      url: string;
      description: string | null;
      events: string[];
      status: WebhookStatus;
    }>;
  };
  meta: PendingMeta;
}): Generator {
  try {
    const webhook = (yield call(() =>
      api.updateWebhook(action.payload.id, action.payload.data),
    )) as Awaited<ReturnType<typeof api.updateWebhook>>;
    yield put(updateWebhookSucceeded(webhook, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't update the webhook.", action.meta);
  }
}

export function* rotateWebhookSecret(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
  onReveal?: RevealSecret;
}): Generator {
  try {
    const rotated = (yield call(() =>
      api.rotateWebhookSecret(action.payload.id),
    )) as Awaited<ReturnType<typeof api.rotateWebhookSecret>>;

    yield put(rotateWebhookSecretSucceeded(rotated.webhook, action.meta));
    action.onReveal?.({
      kind: "webhookSecret",
      id: rotated.webhook.id,
      plaintext: rotated.plaintext,
    });
    notifySuccess({
      title: t("store.developer.secretRotated", "Signing secret rotated"),
      content: t(
        "store.developer.secretRotatedBody",
        "Update your endpoint before the old secret stops working.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't rotate the signing secret.", action.meta);
  }
}

export function* deleteWebhook(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteWebhook(action.payload.id));
    yield put(deleteWebhookSucceeded(action.payload.id, action.meta));
  } catch (error) {
    yield* fail(error, "Couldn't delete the webhook.", action.meta);
  }
}

const cliSessionsVersion = (state: RootState) =>
  state.developer.cliSessionsVersion;

export function* fetchCliSessions(): Generator {
  try {
    yield put(fetchCliSessionsPending());
    const before = (yield select(cliSessionsVersion)) as number;
    const sessions = (yield call(cliApi.getCliSessions)) as Awaited<
      ReturnType<typeof cliApi.getCliSessions>
    >;
    const after = (yield select(cliSessionsVersion)) as number;
    if (after !== before) {
      yield put(fetchCliSessionsAgain());
      return;
    }
    yield put(fetchCliSessionsSucceeded(sessions, before));
  } catch (error) {
    yield put(
      fetchCliSessionsFailed(
        toMessage(
          error,
          t("store.developer.cliSessionsFailed", "Couldn't load CLI sessions."),
        ),
      ),
    );
  }
}

export function* createCliToken(action: {
  type: string;
  payload: NewCliToken;
  meta: PendingMeta;
  onReveal?: RevealSecret;
}): Generator {
  try {
    const created = (yield call(() =>
      cliApi.createCliToken(action.payload),
    )) as Awaited<ReturnType<typeof cliApi.createCliToken>>;

    yield put(createCliTokenSucceeded(created.session, action.meta));
    action.onReveal?.({
      kind: "cliToken",
      id: created.session.id,
      plaintext: created.plaintext,
    });
    notifySuccess({
      title: t("store.developer.cliTokenCreated", "CLI token created"),
      content: t(
        "store.developer.cliTokenCreatedBody",
        "Copy it now — it will not be shown again.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't create the CLI token.", action.meta);
  }
}

export function* revokeCliSession(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => cliApi.revokeCliSession(action.payload.id));
    yield put(revokeCliSessionSucceeded(action.payload.id, action.meta));
    notifySuccess({
      title: t("store.developer.cliSessionRevoked", "CLI session revoked"),
      content: t(
        "store.developer.cliSessionRevokedBody",
        "That terminal is signed out and its token no longer works.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't revoke the CLI session.", action.meta);
  }
}

export default [
  refreshAfterWrite({
    fetchType: actionTypes.FETCH_DEVELOPER_REQUESTED,
    writeTypes: writeSucceededTypes(actionTypes),
    isLoading: (state) => state.developer.isLoading,
  }),
  takeLatest(actionTypes.FETCH_DEVELOPER_REQUESTED, fetchDeveloper),
  takeEvery(actionTypes.CREATE_API_KEY_REQUESTED, createApiKey),
  takeEvery(actionTypes.RENAME_API_KEY_REQUESTED, renameApiKey),
  takeEvery(actionTypes.REVOKE_API_KEY_REQUESTED, revokeApiKey),
  takeEvery(actionTypes.DELETE_API_KEY_REQUESTED, deleteApiKey),
  takeEvery(actionTypes.CREATE_WEBHOOK_REQUESTED, createWebhook),
  takeEvery(actionTypes.UPDATE_WEBHOOK_REQUESTED, updateWebhook),
  takeEvery(actionTypes.ROTATE_WEBHOOK_SECRET_REQUESTED, rotateWebhookSecret),
  takeEvery(actionTypes.DELETE_WEBHOOK_REQUESTED, deleteWebhook),
  takeLatest(actionTypes.FETCH_CLI_SESSIONS_REQUESTED, fetchCliSessions),
  takeEvery(actionTypes.CREATE_CLI_TOKEN_REQUESTED, createCliToken),
  takeEvery(actionTypes.REVOKE_CLI_SESSION_REQUESTED, revokeCliSession),
];
