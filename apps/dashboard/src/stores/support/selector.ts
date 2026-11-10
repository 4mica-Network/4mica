import type { RootState } from "@stores/index";
import type {
  SupportFilters,
  SupportRequest,
  SupportRequestDetail,
  SupportState,
} from "./type";

export const selectSupportState = (state: RootState): SupportState =>
  state.support;

export const selectSupportRequests = (state: RootState): SupportRequest[] =>
  state.support.items;

export const selectSupportTotal = (state: RootState): number =>
  state.support.total;

export const selectSupportPage = (state: RootState): number =>
  state.support.page;

export const selectSupportLimit = (state: RootState): number =>
  state.support.limit;

export const selectSupportFilters = (state: RootState): SupportFilters =>
  state.support.filters;

export const selectSelectedSupportIds = (state: RootState): string[] =>
  state.support.selectedIds;

export const selectIsSupportRequestSelected =
  (id: string) =>
  (state: RootState): boolean =>
    state.support.selectedIds.includes(id);

export const selectAreAllSupportRequestsSelected = (
  state: RootState,
): boolean =>
  state.support.items.length > 0 &&
  state.support.items.every((item) =>
    state.support.selectedIds.includes(item.id),
  );

export const selectIsSupportLoading = (state: RootState): boolean =>
  state.support.isLoading;

export const selectHasLoadedSupport = (state: RootState): boolean =>
  state.support.hasLoaded;

export const selectCurrentSupportRequest = (
  state: RootState,
): SupportRequestDetail | null => state.support.current;

export const selectIsLoadingCurrentSupportRequest = (
  state: RootState,
): boolean => state.support.isLoadingCurrent;

export const selectCurrentSupportRequestError = (
  state: RootState,
): string | null => state.support.currentError;

export const selectIsSupportPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.support.pending[key]);

export const selectSupportError = (state: RootState): string | null =>
  state.support.error;

export const selectSupportIssues = (state: RootState): Record<string, string> =>
  state.support.validationIssues;
