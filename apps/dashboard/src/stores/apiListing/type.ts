import type { PaymentNetwork } from "@stores/wallet/type";

export type { BatchDeleteResult, PaymentNetwork } from "@stores/wallet/type";

export const PUBLIC_VISIBILITY = {
  PRIVATE: "PRIVATE",
  UNLISTED: "UNLISTED",
  PUBLIC: "PUBLIC",
} as const;

export type PublicVisibility =
  (typeof PUBLIC_VISIBILITY)[keyof typeof PUBLIC_VISIBILITY];

export const HTTP_METHOD = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

export type HttpMethodName = (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];

export interface ApiEndpoint {
  id: string;
  method: HttpMethodName;
  path: string;
  summary: string | null;
  priceAmount: string | null;
  sortOrder: number;
}

export interface ApiListing {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  baseUrl: string | null;
  docsUrl: string | null;
  category: string | null;
  tags: string[];
  priceLabel: string | null;
  visibility: PublicVisibility;
  publishedAt: string | null;

  walletId: string | null;
  network: PaymentNetwork | null;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  x402Endpoint: string | null;

  createdAt: string;
  updatedAt: string;
  endpoints: ApiEndpoint[];
}

export interface ApiListingListResponse {
  items: ApiListing[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiListingFilters {
  q: string;
  visibility: PublicVisibility | "";
  network: PaymentNetwork | "";
}

export type ApiListingState = {
  items: ApiListing[];
  total: number;
  page: number;
  limit: number;
  filters: ApiListingFilters;
  selectedIds: string[];
  isLoading: boolean;
  hasLoaded: boolean;
  pending: Record<string, boolean>;
  error: string | null;
  validationIssues: Record<string, string>;
};
