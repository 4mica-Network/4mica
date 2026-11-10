import { HttpMethod } from "@4mica/http";
import type {
  BatchDeleteResult,
  SupportCategory,
  SupportMessage,
  SupportRequest,
  SupportRequestDetail,
  SupportRequestInput,
  SupportRequestListResponse,
  SupportRequestPatch,
  SupportStatus,
} from "@stores/support/type";
import { httpClient } from "./client";

export interface ListSupportRequestsParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  q?: string;
  status?: SupportStatus;
  category?: SupportCategory;
  sort?: "lastActivityAt" | "-lastActivityAt" | "createdAt" | "-createdAt";
}

const BASE = "/me/support-requests";

export const getSupportRequests = (params: ListSupportRequestsParams = {}) =>
  httpClient.request<SupportRequestListResponse>({
    url: BASE,
    method: HttpMethod.GET,
    params,
  });

export const getSupportRequest = (id: string) =>
  httpClient.request<SupportRequestDetail>({
    url: `${BASE}/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });

export const createSupportRequest = (data: SupportRequestInput) =>
  httpClient.request<SupportRequest, typeof data>({
    url: BASE,
    method: HttpMethod.POST,
    data,
  });

export const updateSupportRequest = (id: string, data: SupportRequestPatch) =>
  httpClient.request<SupportRequest, typeof data>({
    url: `${BASE}/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const replySupportRequest = (id: string, body: string) =>
  httpClient.request<SupportMessage, { body: string }>({
    url: `${BASE}/${encodeURIComponent(id)}/messages`,
    method: HttpMethod.POST,
    data: { body },
  });

export const deleteSupportRequest = (id: string) =>
  httpClient.request<void>({
    url: `${BASE}/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

export const batchDeleteSupportRequests = (ids: string[]) =>
  httpClient.request<BatchDeleteResult, { ids: string[] }>({
    url: `${BASE}/batch-delete`,
    method: HttpMethod.POST,
    data: { ids },
  });
