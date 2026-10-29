import { DEFAULT_PAGE_SIZE, setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  SupportFilters,
  SupportMessage,
  SupportRequest,
  SupportRequestDetail,
  SupportRequestListResponse,
  SupportState,
} from "./type";

export const INITIAL_STATE: SupportState = {
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  filters: { q: "", status: "", category: "" },
  selectedIds: [],
  isLoading: false,
  hasLoaded: false,
  current: null,
  isLoadingCurrent: false,
  currentError: null,
  pending: {},
  error: null,
  validationIssues: {},
};

interface SupportAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const mergeCurrent = (
  current: SupportRequestDetail | null,
  request: SupportRequest,
): SupportRequestDetail | null =>
  current && current.id === request.id ? { ...current, ...request } : current;

export default function supportReducer(
  state: SupportState = INITIAL_STATE,
  action: SupportAction = { type: "" },
): SupportState {
  switch (action.type) {
    case actionTypes.FETCH_SUPPORT_REQUESTS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_SUPPORT_REQUESTS_SUCCEEDED: {
      const payload = action.payload as SupportRequestListResponse;
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

    case actionTypes.FETCH_SUPPORT_REQUESTS_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load your requests.",
      };

    case actionTypes.FETCH_SUPPORT_REQUEST_REQUESTED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        current: state.current?.id === id ? state.current : null,
        isLoadingCurrent: true,
        currentError: null,
      };
    }

    case actionTypes.FETCH_SUPPORT_REQUEST_SUCCEEDED:
      return {
        ...state,
        current: action.payload as SupportRequestDetail,
        isLoadingCurrent: false,
        currentError: null,
      };

    case actionTypes.FETCH_SUPPORT_REQUEST_FAILED:
      return {
        ...state,
        isLoadingCurrent: false,
        currentError:
          (action.payload as { message?: string })?.message ??
          "Failed to load that request.",
      };

    case actionTypes.RESET_SUPPORT_REQUEST:
      return {
        ...state,
        current: null,
        isLoadingCurrent: false,
        currentError: null,
      };

    case actionTypes.CREATE_SUPPORT_REQUEST_REQUESTED:
    case actionTypes.UPDATE_SUPPORT_REQUEST_REQUESTED:
    case actionTypes.REPLY_SUPPORT_REQUEST_REQUESTED:
    case actionTypes.DELETE_SUPPORT_REQUEST_REQUESTED:
    case actionTypes.BATCH_DELETE_SUPPORT_REQUESTS_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.CREATE_SUPPORT_REQUEST_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.UPDATE_SUPPORT_REQUEST_SUCCEEDED: {
      const request = action.payload as SupportRequest;
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === request.id ? request : item,
        ),
        current: mergeCurrent(state.current, request),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.REPLY_SUPPORT_REQUEST_SUCCEEDED: {
      const { id, message } = action.payload as {
        id: string;
        message: SupportMessage;
      };
      return {
        ...state,
        current:
          state.current?.id === id
            ? {
                ...state.current,
                messages: [...state.current.messages, message],
              }
            : state.current,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.DELETE_SUPPORT_REQUEST_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        current: state.current?.id === id ? null : state.current,
        selectedIds: state.selectedIds.filter((current) => current !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.BATCH_DELETE_SUPPORT_REQUESTS_SUCCEEDED:
      return {
        ...state,
        selectedIds: [],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.SET_SUPPORT_FILTERS: {
      const patch = action.payload as Partial<SupportFilters>;
      return {
        ...state,
        filters: { ...state.filters, ...patch },
        page: 1,
        selectedIds: [],
      };
    }

    case actionTypes.SET_SUPPORT_PAGE: {
      const { page } = action.payload as { page: number };
      return { ...state, page: Math.max(page, 1), selectedIds: [] };
    }

    case actionTypes.TOGGLE_SUPPORT_REQUEST_SELECTED: {
      const { id } = action.payload as { id: string };
      const selected = state.selectedIds.includes(id);
      return {
        ...state,
        selectedIds: selected
          ? state.selectedIds.filter((current) => current !== id)
          : [...state.selectedIds, id],
      };
    }

    case actionTypes.SET_SUPPORT_SELECTION: {
      const { ids } = action.payload as { ids: string[] };
      return { ...state, selectedIds: [...new Set(ids)] };
    }

    case actionTypes.CLEAR_SUPPORT_SELECTION:
      return { ...state, selectedIds: [] };

    case actionTypes.SUPPORT_ACTION_FAILED: {
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

    case actionTypes.CLEAR_SUPPORT_ISSUES:
      return { ...state, error: null, validationIssues: {} };

    default:
      return state;
  }
}
