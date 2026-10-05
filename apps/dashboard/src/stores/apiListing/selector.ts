import type { RootState } from "..";
import type { ApiListing, ApiListingFilters, ApiListingState } from "./type";

export const selectApiListingState = (state: RootState): ApiListingState =>
  state.apiListing;

export const selectApiListings = (state: RootState): ApiListing[] =>
  state.apiListing.items;

export const selectApiListingTotal = (state: RootState): number =>
  state.apiListing.total;

export const selectApiListingPage = (state: RootState): number =>
  state.apiListing.page;

export const selectApiListingLimit = (state: RootState): number =>
  state.apiListing.limit;

export const selectApiListingFilters = (state: RootState): ApiListingFilters =>
  state.apiListing.filters;

export const selectSelectedApiListingIds = (state: RootState): string[] =>
  state.apiListing.selectedIds;

export const selectIsApiListingSelected =
  (id: string) =>
  (state: RootState): boolean =>
    state.apiListing.selectedIds.includes(id);

export const selectIsApiListingsLoading = (state: RootState): boolean =>
  state.apiListing.isLoading;

export const selectHasLoadedApiListings = (state: RootState): boolean =>
  state.apiListing.hasLoaded;

export const selectIsApiListingPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.apiListing.pending[key]);

export const selectApiListingError = (state: RootState): string | null =>
  state.apiListing.error;

export const selectApiListingIssues = (
  state: RootState,
): Record<string, string> => state.apiListing.validationIssues;

export const selectAreAllApiListingsSelected = (state: RootState): boolean =>
  state.apiListing.items.length > 0 &&
  state.apiListing.items.every((item) =>
    state.apiListing.selectedIds.includes(item.id),
  );
