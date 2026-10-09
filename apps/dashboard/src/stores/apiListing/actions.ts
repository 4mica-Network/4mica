import type { ApiListingInput } from "@api/apiListing";
import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type { ApiListing, ApiListingFilters } from "./type";

export const apiListingPendingKeys = {
  row: (id: string) => `apiListing:${id}`,
  batchDelete: "batchDeleteApiListings",
} as const;

export const fetchApiListings = () => ({
  type: actionTypes.FETCH_API_LISTINGS_REQUESTED,
});

export const fetchApiListingsPending = () => ({
  type: actionTypes.FETCH_API_LISTINGS_PENDING,
});

export const fetchApiListingsSucceeded = (payload: {
  items: ApiListing[];
  total: number;
  page: number;
  limit: number;
}) => ({
  type: actionTypes.FETCH_API_LISTINGS_SUCCEEDED,
  payload,
});

export const fetchApiListingsFailed = (message: string) => ({
  type: actionTypes.FETCH_API_LISTINGS_FAILED,
  payload: { message },
});

export const createApiListing = (payload: ApiListingInput) => ({
  type: actionTypes.CREATE_API_LISTING_REQUESTED,
  payload,
  meta: { pendingKey: "createApiListing" },
});

export const createApiListingSucceeded = (
  listing: ApiListing,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_API_LISTING_SUCCEEDED,
  payload: listing,
  meta,
});

export const updateApiListing = (payload: {
  id: string;
  data: Partial<ApiListingInput>;
}) => ({
  type: actionTypes.UPDATE_API_LISTING_REQUESTED,
  payload,
  meta: { pendingKey: apiListingPendingKeys.row(payload.id) },
});

export const updateApiListingSucceeded = (
  listing: ApiListing,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_API_LISTING_SUCCEEDED,
  payload: listing,
  meta,
});

export const publishApiListing = (payload: {
  id: string;
  publish: boolean;
}) => ({
  type: actionTypes.PUBLISH_API_LISTING_REQUESTED,
  payload,
  meta: { pendingKey: apiListingPendingKeys.row(payload.id) },
});

export const publishApiListingSucceeded = (
  listing: ApiListing,
  meta: PendingMeta,
) => ({
  type: actionTypes.PUBLISH_API_LISTING_SUCCEEDED,
  payload: listing,
  meta,
});

export const deleteApiListing = (payload: { id: string }) => ({
  type: actionTypes.DELETE_API_LISTING_REQUESTED,
  payload,
  meta: { pendingKey: apiListingPendingKeys.row(payload.id) },
});

export const deleteApiListingSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_API_LISTING_SUCCEEDED,
  payload: { id },
  meta,
});

export const batchDeleteApiListings = (payload: { ids: string[] }) => ({
  type: actionTypes.BATCH_DELETE_API_LISTINGS_REQUESTED,
  payload,
  meta: { pendingKey: apiListingPendingKeys.batchDelete },
});

export const batchDeleteApiListingsSucceeded = (
  payload: { deleted: string[]; notFound: string[] },
  meta: PendingMeta,
) => ({
  type: actionTypes.BATCH_DELETE_API_LISTINGS_SUCCEEDED,
  payload,
  meta,
});

export const setApiListingFilters = (payload: Partial<ApiListingFilters>) => ({
  type: actionTypes.SET_API_LISTING_FILTERS,
  payload,
});

export const setApiListingPage = (page: number) => ({
  type: actionTypes.SET_API_LISTING_PAGE,
  payload: { page },
});

export const toggleApiListingSelected = (id: string) => ({
  type: actionTypes.TOGGLE_API_LISTING_SELECTED,
  payload: { id },
});

export const setApiListingSelection = (ids: string[]) => ({
  type: actionTypes.SET_API_LISTING_SELECTION,
  payload: { ids },
});

export const clearApiListingSelection = () => ({
  type: actionTypes.CLEAR_API_LISTING_SELECTION,
});

export const apiListingActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.API_LISTING_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearApiListingIssues = () => ({
  type: actionTypes.CLEAR_API_LISTING_ISSUES,
});
