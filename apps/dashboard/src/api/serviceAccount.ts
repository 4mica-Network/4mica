import { HttpMethod } from "@4mica/http";
import type { ApiKey } from "@stores/developer/type";
import type {
  CreatedServiceAccountKey,
  NewServiceAccountKey,
  ServiceAccount,
} from "@stores/serviceAccount/type";
import { httpClient } from "./client";

const base = (id: string) => `/me/service-accounts/${encodeURIComponent(id)}`;

export const getServiceAccounts = () =>
  httpClient.request<{ items: ServiceAccount[] }>({
    url: "/me/service-accounts",
    method: HttpMethod.GET,
  });

export const createServiceAccount = (data: {
  name: string;
  description?: string | null;
}) =>
  httpClient.request<ServiceAccount, typeof data>({
    url: "/me/service-accounts",
    method: HttpMethod.POST,
    data,
  });

export const updateServiceAccount = (
  id: string,
  data: { name?: string; description?: string | null },
) =>
  httpClient.request<ServiceAccount, typeof data>({
    url: base(id),
    method: HttpMethod.PATCH,
    data,
  });

export const suspendServiceAccount = (id: string, suspended: boolean) =>
  httpClient.request<ServiceAccount>({
    url: `${base(id)}/${suspended ? "suspend" : "reactivate"}`,
    method: HttpMethod.POST,
  });

export const deleteServiceAccount = (id: string) =>
  httpClient.request<void>({ url: base(id), method: HttpMethod.DELETE });

export const getServiceAccountKeys = (id: string) =>
  httpClient.request<{ items: ApiKey[] }>({
    url: `${base(id)}/keys`,
    method: HttpMethod.GET,
  });

export const createServiceAccountKey = (
  id: string,
  data: NewServiceAccountKey,
) =>
  httpClient.request<CreatedServiceAccountKey, NewServiceAccountKey>({
    url: `${base(id)}/keys`,
    method: HttpMethod.POST,
    data,
  });

export const revokeServiceAccountKey = (id: string, keyId: string) =>
  httpClient.request<ApiKey>({
    url: `${base(id)}/keys/${encodeURIComponent(keyId)}/revoke`,
    method: HttpMethod.POST,
  });

export const updateServiceAccountKey = (
  id: string,
  keyId: string,
  data: { ipAllowlist: string[] },
) =>
  httpClient.request<ApiKey, { ipAllowlist: string[] }>({
    url: `${base(id)}/keys/${encodeURIComponent(keyId)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const rotateServiceAccountKey = (
  id: string,
  keyId: string,
  expireOldInHours: number,
) =>
  httpClient.request<CreatedServiceAccountKey, { expireOldInHours: number }>({
    url: `${base(id)}/keys/${encodeURIComponent(keyId)}/rotate`,
    method: HttpMethod.POST,
    data: { expireOldInHours },
  });
