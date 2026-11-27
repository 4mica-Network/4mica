import type { ApiKey, RevealSecret } from "@stores/developer/type";
import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type { NewServiceAccountKey, ServiceAccount } from "./type";

export const serviceAccountPendingKeys = {
  create: "createServiceAccount",
  account: (id: string) => `serviceAccount:${id}`,
  createKey: (id: string) => `serviceAccountCreateKey:${id}`,
  key: (id: string) => `serviceAccountKey:${id}`,
} as const;

export const fetchServiceAccounts = () => ({
  type: actionTypes.FETCH_SERVICE_ACCOUNTS_REQUESTED,
});

export const fetchServiceAccountsSucceeded = (items: ServiceAccount[]) => ({
  type: actionTypes.FETCH_SERVICE_ACCOUNTS_SUCCEEDED,
  payload: items,
});

export const fetchServiceAccountsFailed = (message: string) => ({
  type: actionTypes.FETCH_SERVICE_ACCOUNTS_FAILED,
  payload: { message },
});

export const createServiceAccount = (payload: {
  name: string;
  description?: string | null;
}) => ({
  type: actionTypes.CREATE_SERVICE_ACCOUNT_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.create },
});

export const updateServiceAccount = (payload: {
  id: string;
  name?: string;
  description?: string | null;
}) => ({
  type: actionTypes.UPDATE_SERVICE_ACCOUNT_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.account(payload.id) },
});

export const suspendServiceAccount = (payload: {
  id: string;
  suspended: boolean;
}) => ({
  type: actionTypes.SUSPEND_SERVICE_ACCOUNT_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.account(payload.id) },
});

export const serviceAccountSaved = (
  type: string,
  account: ServiceAccount,
  meta: PendingMeta,
) => ({ type, payload: account, meta });

export const deleteServiceAccount = (payload: { id: string }) => ({
  type: actionTypes.DELETE_SERVICE_ACCOUNT_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.account(payload.id) },
});

export const deleteServiceAccountSucceeded = (
  id: string,
  meta: PendingMeta,
) => ({
  type: actionTypes.DELETE_SERVICE_ACCOUNT_SUCCEEDED,
  payload: { id },
  meta,
});

export const fetchServiceAccountKeys = (id: string) => ({
  type: actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_REQUESTED,
  payload: { id },
});

export const fetchServiceAccountKeysSucceeded = (
  id: string,
  keys: ApiKey[],
) => ({
  type: actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_SUCCEEDED,
  payload: { id, keys },
});

export const fetchServiceAccountKeysFailed = (id: string) => ({
  type: actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_FAILED,
  payload: { id },
});

export const createServiceAccountKey = (
  payload: { id: string; key: NewServiceAccountKey },
  onReveal?: RevealSecret,
) => ({
  type: actionTypes.CREATE_SERVICE_ACCOUNT_KEY_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.createKey(payload.id) },
  onReveal,
});

export const revokeServiceAccountKey = (payload: {
  id: string;
  keyId: string;
}) => ({
  type: actionTypes.REVOKE_SERVICE_ACCOUNT_KEY_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.key(payload.keyId) },
});

export const rotateServiceAccountKey = (
  payload: { id: string; keyId: string; expireOldInHours: number },
  onReveal?: RevealSecret,
) => ({
  type: actionTypes.ROTATE_SERVICE_ACCOUNT_KEY_REQUESTED,
  payload,
  meta: { pendingKey: serviceAccountPendingKeys.key(payload.keyId) },
  onReveal,
});

export const serviceAccountKeySucceeded = (
  type: string,
  meta: PendingMeta,
) => ({
  type,
  meta,
});

export const serviceAccountActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.SERVICE_ACCOUNT_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearServiceAccountIssues = () => ({
  type: actionTypes.CLEAR_SERVICE_ACCOUNT_ISSUES,
});
