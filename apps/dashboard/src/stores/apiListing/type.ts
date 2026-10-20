import type { PaymentNetwork, PublicVisibility } from "@stores/shared/type";

export {
  type BatchDeleteResult,
  type PaymentNetwork,
  PUBLIC_VISIBILITY,
  type PublicVisibility,
} from "@stores/shared/type";

export const HTTP_METHOD = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

export type HttpMethodName = (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];

export interface ApiListing {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  url: string | null;
  method: HttpMethodName;
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
