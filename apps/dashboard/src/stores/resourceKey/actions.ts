import type { ApiKey } from "@stores/developer/type";
import type { ResourceRef } from "@stores/trust/actions";
import actionTypes from "./actionTypes";
import type { RevealedResourceKey } from "./type";

export interface PendingMeta {
  pendingKey: string;
}

const rowKey = (keyId: string) => `resourceKey:${keyId}`;

export const fetchResourceKeys = (resource: ResourceRef) => ({
  type: actionTypes.FETCH_RESOURCE_KEYS_REQUESTED,
  payload: resource,
});

export const fetchResourceKeysPending = () => ({
  type: actionTypes.FETCH_RESOURCE_KEYS_PENDING,
});

export const fetchResourceKeysSucceeded = (items: ApiKey[]) => ({
  type: actionTypes.FETCH_RESOURCE_KEYS_SUCCEEDED,
  payload: { items },
});

export const fetchResourceKeysFailed = (message: string) => ({
  type: actionTypes.FETCH_RESOURCE_KEYS_FAILED,
  payload: { message },
});

export const createResourceKey = (resource: ResourceRef, name: string) => ({
  type: actionTypes.CREATE_RESOURCE_KEY_REQUESTED,
  payload: { resource, name },
  meta: { pendingKey: "createResourceKey" },
});

export const createResourceKeySucceeded = (
  apiKey: ApiKey,
  revealed: RevealedResourceKey,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_RESOURCE_KEY_SUCCEEDED,
  payload: { apiKey, revealed },
  meta,
});

export const revokeResourceKey = (resource: ResourceRef, keyId: string) => ({
  type: actionTypes.REVOKE_RESOURCE_KEY_REQUESTED,
  payload: { resource, keyId },
  meta: { pendingKey: rowKey(keyId) },
});

export const revokeResourceKeySucceeded = (
  apiKey: ApiKey,
  meta: PendingMeta,
) => ({
  type: actionTypes.REVOKE_RESOURCE_KEY_SUCCEEDED,
  payload: apiKey,
  meta,
});

export const deleteResourceKey = (resource: ResourceRef, keyId: string) => ({
  type: actionTypes.DELETE_RESOURCE_KEY_REQUESTED,
  payload: { resource, keyId },
  meta: { pendingKey: rowKey(keyId) },
});

export const deleteResourceKeySucceeded = (
  keyId: string,
  meta: PendingMeta,
) => ({
  type: actionTypes.DELETE_RESOURCE_KEY_SUCCEEDED,
  payload: { id: keyId },
  meta,
});

export const resourceKeyActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.RESOURCE_KEY_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const dismissRevealedResourceKey = () => ({
  type: actionTypes.DISMISS_REVEALED_RESOURCE_KEY,
});

export const resetResourceKeys = () => ({
  type: actionTypes.RESET_RESOURCE_KEYS,
});
