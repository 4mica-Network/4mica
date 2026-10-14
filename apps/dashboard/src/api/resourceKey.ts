import { HttpMethod } from "@4mica/http";
import type { ApiKey } from "@stores/developer/type";
import type { ResourceKind } from "@stores/shared/type";
import { httpClient } from "./client";
import type { CreatedApiKey } from "./developer";
import { resourcePath } from "./resource";

const base = (kind: ResourceKind, id: string) =>
  `${resourcePath(kind, id)}/keys`;

export const getResourceKeys = (kind: ResourceKind, id: string) =>
  httpClient.request<{ items: ApiKey[] }>({
    url: base(kind, id),
    method: HttpMethod.GET,
  });

export const createResourceKey = (
  kind: ResourceKind,
  id: string,
  data: { name: string },
) =>
  httpClient.request<CreatedApiKey, typeof data>({
    url: base(kind, id),
    method: HttpMethod.POST,
    data,
  });

export const revokeResourceKey = (
  kind: ResourceKind,
  id: string,
  keyId: string,
) =>
  httpClient.request<ApiKey>({
    url: `${base(kind, id)}/${encodeURIComponent(keyId)}/revoke`,
    method: HttpMethod.POST,
  });

export const deleteResourceKey = (
  kind: ResourceKind,
  id: string,
  keyId: string,
) =>
  httpClient.request<void>({
    url: `${base(kind, id)}/${encodeURIComponent(keyId)}`,
    method: HttpMethod.DELETE,
  });
