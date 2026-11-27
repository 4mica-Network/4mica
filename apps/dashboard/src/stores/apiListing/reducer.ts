import { DEFAULT_PAGE_SIZE, setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type { ApiListing, ApiListingFilters, ApiListingState } from "./type";

export const INITIAL_STATE: ApiListingState = {
  current: null,
  currentError: null,
  currentNotFound: false,
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  filters: { q: "", visibility: "", network: "" },
  selectedIds: [],
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
};

interface ApiListingAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

export default function apiListingReducer(
  state: ApiListingState = INITIAL_STATE,
  action: ApiListingAction = { type: "" },
): ApiListingState {
  switch (action.type) {
    case actionTypes.FETCH_API_LISTINGS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_API_LISTINGS_SUCCEEDED: {
      const payload = action.payload as {
        items: ApiListing[];
        total: number;
        page: number;
        limit: number;
      };
      const ids = new Set(payload.items.map((item) => item.id));
      return {
        ...state,
        items: payload.items,
        total: payload.total,
        page: payload.page,
        limit: payload.limit,
        selectedIds: state.selectedIds.filter((id) => ids.has(id)),
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_API_LISTINGS_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load listings.",
      };

    case actionTypes.CREATE_API_LISTING_REQUESTED:
    case actionTypes.UPDATE_API_LISTING_REQUESTED:
    case actionTypes.PUBLISH_API_LISTING_REQUESTED:
    case actionTypes.DELETE_API_LISTING_REQUESTED:
    case actionTypes.BATCH_DELETE_API_LISTINGS_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.FETCH_API_LISTING_REQUESTED:
      return { ...state, currentError: null, currentNotFound: false };

    case actionTypes.FETCH_API_LISTING_SUCCEEDED:
      return { ...state, current: action.payload as ApiListing };

    case actionTypes.FETCH_API_LISTING_FAILED: {
      const payload = action.payload as { message: string; notFound: boolean };
      return {
        ...state,
        currentError: payload.message,
        currentNotFound: payload.notFound,
      };
    }

    case actionTypes.UPDATE_API_LISTING_SUCCEEDED:
    case actionTypes.PUBLISH_API_LISTING_SUCCEEDED: {
      const updated = action.payload as ApiListing;
      return {
        ...state,
        current: state.current?.id === updated.id ? updated : state.current,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.CREATE_API_LISTING_SUCCEEDED:
    case actionTypes.DELETE_API_LISTING_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.BATCH_DELETE_API_LISTINGS_SUCCEEDED:
      return {
        ...state,
        selectedIds: [],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.SET_API_LISTING_FILTERS: {
      const patch = action.payload as Partial<ApiListingFilters>;
      return {
        ...state,
        filters: { ...state.filters, ...patch },
        page: 1,
        selectedIds: [],
      };
    }

    case actionTypes.SET_API_LISTING_PAGE: {
      const { page } = action.payload as { page: number };
      return { ...state, page: Math.max(page, 1), selectedIds: [] };
    }

    case actionTypes.TOGGLE_API_LISTING_SELECTED: {
      const { id } = action.payload as { id: string };
      const selected = state.selectedIds.includes(id);
      return {
        ...state,
        selectedIds: selected
          ? state.selectedIds.filter((current) => current !== id)
          : [...state.selectedIds, id],
      };
    }

    case actionTypes.SET_API_LISTING_SELECTION: {
      const { ids } = action.payload as { ids: string[] };
      return { ...state, selectedIds: [...new Set(ids)] };
    }

    case actionTypes.CLEAR_API_LISTING_SELECTION:
      return { ...state, selectedIds: [] };

    case actionTypes.API_LISTING_ACTION_FAILED: {
      const payload = action.payload as {
        message?: string;
        issues?: Record<string, string>;
      };
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        error: payload?.message ?? "Something went wrong.",
        validationIssues: payload?.issues ?? {},
      };
    }

    case actionTypes.CLEAR_API_LISTING_ISSUES:
      return { ...state, error: null, validationIssues: {} };

    default:
      return state;
  }
}
