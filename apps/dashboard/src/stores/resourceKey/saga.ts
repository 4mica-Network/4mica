import * as api from "@api/resourceKey";
import i18n from "@i18n";
import type { ResourceRef } from "@stores/shared/type";
import type { PendingMeta } from "@stores/utils";
import { toMessage as messageOf, toIssueMap } from "@utils/http-errors";
import { call, put, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  createResourceKeySucceeded,
  deleteResourceKeySucceeded,
  fetchResourceKeysFailed,
  fetchResourceKeysPending,
  fetchResourceKeysSucceeded,
  resourceKeyActionFailed,
  revokeResourceKeySucceeded,
} from "./actions";
import actionTypes from "./actionTypes";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const toMessage = (error: unknown, fallback: string): string =>
  messageOf(error, fallback, {
    sessionExpired: t(
      "store.resourceKey.sessionExpired",
      "Your session has expired. Refresh the page and sign in again.",
    ),
  });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(resourceKeyActionFailed(message, toIssueMap(error), meta));

  notifyError({
    title: t("store.resourceKey.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchResourceKeys(action: {
  type: string;
  payload: ResourceRef;
}): Generator {
  const { kind, id } = action.payload;

  try {
    yield put(fetchResourceKeysPending());

    const result = (yield call(() => api.getResourceKeys(kind, id))) as Awaited<
      ReturnType<typeof api.getResourceKeys>
    >;

    yield put(fetchResourceKeysSucceeded(result.items));
  } catch (error) {
    yield put(
      fetchResourceKeysFailed(
        toMessage(
          error,
          t("store.resourceKey.fetchFailed", "Couldn't load the keys."),
        ),
      ),
    );
  }
}

export function* createResourceKey(action: {
  type: string;
  payload: { resource: ResourceRef; name: string };
  meta: PendingMeta;
}): Generator {
  const { resource, name } = action.payload;

  try {
    const created = (yield call(() =>
      api.createResourceKey(resource.kind, resource.id, { name }),
    )) as Awaited<ReturnType<typeof api.createResourceKey>>;

    yield put(
      createResourceKeySucceeded(
        created.apiKey,
        { id: created.apiKey.id, plaintext: created.plaintext },
        action.meta,
      ),
    );

    notifySuccess({
      title: t("store.resourceKey.created", "Secret key created"),
      content: t(
        "store.resourceKey.createdBody",
        "Copy it now. It will not be shown again.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't create the key.", action.meta);
  }
}

export function* revokeResourceKey(action: {
  type: string;
  payload: { resource: ResourceRef; keyId: string };
  meta: PendingMeta;
}): Generator {
  const { resource, keyId } = action.payload;

  try {
    const key = (yield call(() =>
      api.revokeResourceKey(resource.kind, resource.id, keyId),
    )) as Awaited<ReturnType<typeof api.revokeResourceKey>>;

    yield put(revokeResourceKeySucceeded(key, action.meta));

    notifySuccess({
      title: t("store.resourceKey.revoked", "Secret key revoked"),
      content: t(
        "store.resourceKey.revokedBody",
        "Requests using this key will now be rejected.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't revoke the key.", action.meta);
  }
}

export function* deleteResourceKey(action: {
  type: string;
  payload: { resource: ResourceRef; keyId: string };
  meta: PendingMeta;
}): Generator {
  const { resource, keyId } = action.payload;

  try {
    yield call(() => api.deleteResourceKey(resource.kind, resource.id, keyId));
    yield put(deleteResourceKeySucceeded(keyId, action.meta));

    notifySuccess({
      title: t("store.resourceKey.deleted", "Secret key deleted"),
      content: t(
        "store.resourceKey.deletedBody",
        "Requests using this key will now be rejected.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't delete the key.", action.meta);
  }
}

export default [
  takeLatest(actionTypes.FETCH_RESOURCE_KEYS_REQUESTED, fetchResourceKeys),
  takeEvery(actionTypes.CREATE_RESOURCE_KEY_REQUESTED, createResourceKey),
  takeEvery(actionTypes.REVOKE_RESOURCE_KEY_REQUESTED, revokeResourceKey),
  takeEvery(actionTypes.DELETE_RESOURCE_KEY_REQUESTED, deleteResourceKey),
];
