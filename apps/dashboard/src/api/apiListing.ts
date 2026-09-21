import { HttpMethod } from "@4mica/http";
import type {
  ApiListing,
  ApiListingListResponse,
  BatchDeleteResult,
  HttpMethodName,
  PaymentNetwork,
  PublicVisibility,
} from "@stores/apiListing/type";
import { httpClient } from "./client";

export interface ListApiListingsParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  q?: string;
  visibility?: PublicVisibility;
  network?: PaymentNetwork;
  sort?:
    | "createdAt"
    | "-createdAt"
    | "updatedAt"
    | "-updatedAt"
    | "name"
    | "-name";
}

export interface ApiListingInput {
  name: string;
  slug?: string;
  summary?: string | null;
  description?: string | null;
  baseUrl?: string | null;
  docsUrl?: string | null;
  category?: string | null;
  tags?: string[];
  priceLabel?: string | null;
  visibility?: PublicVisibility;
  walletId?: string | null;
  assetAddress?: string | null;
  priceAmount?: string | null;
  priceCurrency?: string | null;
  x402Endpoint?: string | null;
}

export interface ApiEndpointInput {
  method: HttpMethodName;
  path: string;
  summary?: string | null;
  priceAmount?: string | null;
  sortOrder?: number;
}

export const getApiListings = (params: ListApiListingsParams = {}) =>
  httpClient.request<ApiListingListResponse>({
    url: "/me/api-listings",
    method: HttpMethod.GET,
    params,
  });

export const getApiListing = (id: string) =>
  httpClient.request<ApiListing>({
    url: `/me/api-listings/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });

export const createApiListing = (
  data: ApiListingInput & { endpoints?: ApiEndpointInput[] },
) =>
  httpClient.request<ApiListing, typeof data>({
    url: "/me/api-listings",
    method: HttpMethod.POST,
    data,
  });

export const updateApiListing = (id: string, data: Partial<ApiListingInput>) =>
  httpClient.request<ApiListing, typeof data>({
    url: `/me/api-listings/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const replaceApiEndpoints = (
  id: string,
  endpoints: ApiEndpointInput[],
) =>
  httpClient.request<ApiListing, { endpoints: ApiEndpointInput[] }>({
    url: `/me/api-listings/${encodeURIComponent(id)}/endpoints`,
    method: HttpMethod.PUT,
    data: { endpoints },
  });

export const publishApiListing = (id: string) =>
  httpClient.request<ApiListing>({
    url: `/me/api-listings/${encodeURIComponent(id)}/publish`,
    method: HttpMethod.POST,
  });

export const unpublishApiListing = (id: string) =>
  httpClient.request<ApiListing>({
    url: `/me/api-listings/${encodeURIComponent(id)}/unpublish`,
    method: HttpMethod.POST,
  });

export const deleteApiListing = (id: string) =>
  httpClient.request<void>({
    url: `/me/api-listings/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

export const batchDeleteApiListings = (ids: string[]) =>
  httpClient.request<BatchDeleteResult, { ids: string[] }>({
    url: "/me/api-listings/batch-delete",
    method: HttpMethod.POST,
    data: { ids },
  });
