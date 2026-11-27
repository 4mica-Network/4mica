import * as api from "@api/serviceAccount";
import i18n from "@i18n";
import { handledAsApproval } from "@stores/approvalRequired";
import type { RevealSecret } from "@stores/developer/type";
import { errorCode } from "@stores/organization/saga";
import type { PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import { call, put, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  deleteServiceAccountSucceeded,
  fetchServiceAccountKeys as fetchKeysAction,
  fetchServiceAccountKeysFailed,
  fetchServiceAccountKeysSucceeded,
  fetchServiceAccounts as fetchServiceAccountsAction,
  fetchServiceAccountsFailed,
  fetchServiceAccountsSucceeded,
  serviceAccountActionFailed,
  serviceAccountKeySucceeded,
  serviceAccountSaved,
} from "./actions";
import actionTypes from "./actionTypes";
import type {
  CreatedServiceAccountKey,
  NewServiceAccountKey,
  ServiceAccount,
} from "./type";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  if (
    yield* handledAsApproval(error, serviceAccountActionFailed("", {}, meta))
  ) {
    return;
  }
  const message =
    errorCode(error) === "service_account_suspended"
      ? t(
          "serviceAccounts.suspendedError",
          "Reactivate this service account before changing its keys.",
        )
      : toMessage(error, fallback);
  const issues = toIssueMap(error);
  yield put(serviceAccountActionFailed(message, issues, meta));
  if (Object.keys(issues).length === 0) {
    notifyError({
      title: t("store.developer.failedTitle", "Something went wrong"),
      content: message,
    });
  }
}

export function* fetchServiceAccounts(): Generator {
  try {
    const { items } = (yield call(api.getServiceAccounts)) as {
      items: ServiceAccount[];
    };
    yield put(fetchServiceAccountsSucceeded(items));
  } catch (error) {
    yield put(
      fetchServiceAccountsFailed(
        toMessage(
          error,
          t("serviceAccounts.loadFailed", "Couldn't load service accounts."),
        ),
      ),
    );
  }
}

function* saveAccount(
  request: () => Promise<ServiceAccount>,
  succeededType: string,
  meta: PendingMeta,
  fallback: string,
): Generator {
  try {
    const account = (yield call(request)) as ServiceAccount;
    yield put(serviceAccountSaved(succeededType, account, meta));
  } catch (error) {
    yield* fail(error, fallback, meta);
  }
}

export function* createServiceAccount(action: {
  type: string;
  payload: { name: string; description?: string | null };
  meta: PendingMeta;
}): Generator {
  yield* saveAccount(
    () => api.createServiceAccount(action.payload),
    actionTypes.CREATE_SERVICE_ACCOUNT_SUCCEEDED,
    action.meta,
    t("serviceAccounts.createFailed", "Couldn't create the service account."),
  );
}

export function* updateServiceAccount(action: {
  type: string;
  payload: { id: string; name?: string; description?: string | null };
  meta: PendingMeta;
}): Generator {
  const { id, ...data } = action.payload;
  yield* saveAccount(
    () => api.updateServiceAccount(id, data),
    actionTypes.UPDATE_SERVICE_ACCOUNT_SUCCEEDED,
    action.meta,
    t("serviceAccounts.updateFailed", "Couldn't save the service account."),
  );
}

export function* suspendServiceAccount(action: {
  type: string;
  payload: { id: string; suspended: boolean };
  meta: PendingMeta;
}): Generator {
  yield* saveAccount(
    () =>
      api.suspendServiceAccount(action.payload.id, action.payload.suspended),
    actionTypes.SUSPEND_SERVICE_ACCOUNT_SUCCEEDED,
    action.meta,
    t("serviceAccounts.updateFailed", "Couldn't save the service account."),
  );
}

export function* deleteServiceAccount(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteServiceAccount(action.payload.id));
    yield put(deleteServiceAccountSucceeded(action.payload.id, action.meta));
  } catch (error) {
    yield* fail(
      error,
      t("serviceAccounts.deleteFailed", "Couldn't delete the service account."),
      action.meta,
    );
  }
}

export function* fetchServiceAccountKeys(action: {
  type: string;
  payload: { id: string };
}): Generator {
  const { id } = action.payload;
  try {
    const { items } = (yield call(() => api.getServiceAccountKeys(id))) as {
      items: Awaited<ReturnType<typeof api.getServiceAccountKeys>>["items"];
    };
    yield put(fetchServiceAccountKeysSucceeded(id, items));
  } catch {
    yield put(fetchServiceAccountKeysFailed(id));
  }
}

function* afterKeyChange(id: string): Generator {
  yield put(fetchKeysAction(id));
  yield put(fetchServiceAccountsAction());
}

function revealKey(created: CreatedServiceAccountKey, onReveal?: RevealSecret) {
  onReveal?.({ kind: "apiKey", id: created.id, plaintext: created.secret });
  notifySuccess({
    title: t("store.developer.keyCreated", "API key created"),
    content: t(
      "store.developer.keyCreatedBody",
      "Copy it now — it will not be shown again.",
    ),
  });
}

export function* createServiceAccountKey(action: {
  type: string;
  payload: { id: string; key: NewServiceAccountKey };
  meta: PendingMeta;
  onReveal?: RevealSecret;
}): Generator {
  const { id, key } = action.payload;
  try {
    const created = (yield call(() =>
      api.createServiceAccountKey(id, key),
    )) as CreatedServiceAccountKey;
    yield put(
      serviceAccountKeySucceeded(
        actionTypes.CREATE_SERVICE_ACCOUNT_KEY_SUCCEEDED,
        action.meta,
      ),
    );
    revealKey(created, action.onReveal);
    yield* afterKeyChange(id);
  } catch (error) {
    yield* fail(error, "Couldn't create the API key.", action.meta);
  }
}

export function* revokeServiceAccountKey(action: {
  type: string;
  payload: { id: string; keyId: string };
  meta: PendingMeta;
}): Generator {
  const { id, keyId } = action.payload;
  try {
    yield call(() => api.revokeServiceAccountKey(id, keyId));
    yield put(
      serviceAccountKeySucceeded(
        actionTypes.REVOKE_SERVICE_ACCOUNT_KEY_SUCCEEDED,
        action.meta,
      ),
    );
    yield* afterKeyChange(id);
  } catch (error) {
    yield* fail(error, "Couldn't revoke the API key.", action.meta);
  }
}

export function* rotateServiceAccountKey(action: {
  type: string;
  payload: { id: string; keyId: string; expireOldInHours: number };
  meta: PendingMeta;
  onReveal?: RevealSecret;
}): Generator {
  const { id, keyId, expireOldInHours } = action.payload;
  try {
    const created = (yield call(() =>
      api.rotateServiceAccountKey(id, keyId, expireOldInHours),
    )) as CreatedServiceAccountKey;
    yield put(
      serviceAccountKeySucceeded(
        actionTypes.ROTATE_SERVICE_ACCOUNT_KEY_SUCCEEDED,
        action.meta,
      ),
    );
    revealKey(created, action.onReveal);
    yield* afterKeyChange(id);
  } catch (error) {
    yield* fail(error, "Couldn't rotate the API key.", action.meta);
  }
}

export default [
  takeLatest(
    actionTypes.FETCH_SERVICE_ACCOUNTS_REQUESTED,
    fetchServiceAccounts,
  ),
  takeEvery(actionTypes.CREATE_SERVICE_ACCOUNT_REQUESTED, createServiceAccount),
  takeEvery(actionTypes.UPDATE_SERVICE_ACCOUNT_REQUESTED, updateServiceAccount),
  takeEvery(
    actionTypes.SUSPEND_SERVICE_ACCOUNT_REQUESTED,
    suspendServiceAccount,
  ),
  takeEvery(actionTypes.DELETE_SERVICE_ACCOUNT_REQUESTED, deleteServiceAccount),
  takeEvery(
    actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_REQUESTED,
    fetchServiceAccountKeys,
  ),
  takeEvery(
    actionTypes.CREATE_SERVICE_ACCOUNT_KEY_REQUESTED,
    createServiceAccountKey,
  ),
  takeEvery(
    actionTypes.REVOKE_SERVICE_ACCOUNT_KEY_REQUESTED,
    revokeServiceAccountKey,
  ),
  takeEvery(
    actionTypes.ROTATE_SERVICE_ACCOUNT_KEY_REQUESTED,
    rotateServiceAccountKey,
  ),
];
