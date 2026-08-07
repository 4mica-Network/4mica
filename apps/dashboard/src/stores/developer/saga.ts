import { HttpError } from "@4mica/http";
import * as api from "@api/developer";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import { all, call, put, takeEvery, takeLatest } from "redux-saga/effects";
import {
  createApiKeySucceeded,
  createWebhookSucceeded,
  deleteApiKeySucceeded,
  deleteWebhookSucceeded,
  developerActionFailed,
  fetchDeveloperFailed,
  fetchDeveloperPending,
  fetchDeveloperSucceeded,
  type PendingMeta,
  renameApiKeySucceeded,
  revokeApiKeySucceeded,
  rotateWebhookSecretSucceeded,
  updateWebhookSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import type { WebhookStatus } from "./type";

interface ApiIssue {
  path: string;
  message: string;
}

const toIssueMap = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpError)) {
    return {};
  }
  const issues = (error.body as { issues?: ApiIssue[] } | null)?.issues;
  return Array.isArray(issues)
    ? Object.fromEntries(issues.map((i) => [i.path, i.message]))
    : {};
};

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
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
      call(api.getWebhookEvents),
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
  payload: { name: string };
  meta: PendingMeta;
}): Generator {
  try {
    const created = (yield call(() =>
      api.createApiKey(action.payload),
    )) as Awaited<ReturnType<typeof api.createApiKey>>;

    yield put(
      createApiKeySucceeded(
        created.apiKey,
        {
          kind: "apiKey",
          id: created.apiKey.id,
          plaintext: created.plaintext,
        },
        action.meta,
      ),
    );
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
  payload: { id: string; name: string };
  meta: PendingMeta;
}): Generator {
  try {
    const key = (yield call(() =>
      api.renameApiKey(action.payload.id, action.payload.name),
    )) as Awaited<ReturnType<typeof api.renameApiKey>>;
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
}): Generator {
  try {
    const created = (yield call(() =>
      api.createWebhook(action.payload),
    )) as Awaited<ReturnType<typeof api.createWebhook>>;

    yield put(
      createWebhookSucceeded(
        created.webhook,
        {
          kind: "webhookSecret",
          id: created.webhook.id,
          plaintext: created.plaintext,
        },
        action.meta,
      ),
    );
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
}): Generator {
  try {
    const rotated = (yield call(() =>
      api.rotateWebhookSecret(action.payload.id),
    )) as Awaited<ReturnType<typeof api.rotateWebhookSecret>>;

    yield put(
      rotateWebhookSecretSucceeded(
        rotated.webhook,
        {
          kind: "webhookSecret",
          id: rotated.webhook.id,
          plaintext: rotated.plaintext,
        },
        action.meta,
      ),
    );
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

export default [
  takeLatest(actionTypes.FETCH_DEVELOPER_REQUESTED, fetchDeveloper),
  takeEvery(actionTypes.CREATE_API_KEY_REQUESTED, createApiKey),
  takeEvery(actionTypes.RENAME_API_KEY_REQUESTED, renameApiKey),
  takeEvery(actionTypes.REVOKE_API_KEY_REQUESTED, revokeApiKey),
  takeEvery(actionTypes.DELETE_API_KEY_REQUESTED, deleteApiKey),
  takeEvery(actionTypes.CREATE_WEBHOOK_REQUESTED, createWebhook),
  takeEvery(actionTypes.UPDATE_WEBHOOK_REQUESTED, updateWebhook),
  takeEvery(actionTypes.ROTATE_WEBHOOK_SECRET_REQUESTED, rotateWebhookSecret),
  takeEvery(actionTypes.DELETE_WEBHOOK_REQUESTED, deleteWebhook),
];
