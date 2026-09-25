import actionTypes from "./actionTypes";
import type { Agent, AgentFilters, AgentState } from "./type";

export const DEFAULT_PAGE_SIZE = 20;

export const INITIAL_STATE: AgentState = {
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  filters: { q: "", status: "", visibility: "", network: "" },
  selectedIds: [],
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
};

interface AgentAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const setPending = (
  pending: Record<string, boolean>,
  key: string | undefined,
  value: boolean,
): Record<string, boolean> => {
  if (!key) {
    return pending;
  }
  const next = { ...pending };
  if (value) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return next;
};

export default function agentReducer(
  state: AgentState = INITIAL_STATE,
  action: AgentAction = { type: "" },
): AgentState {
  switch (action.type) {
    case actionTypes.FETCH_AGENTS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_AGENTS_SUCCEEDED: {
      const payload = action.payload as {
        items: Agent[];
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

    case actionTypes.FETCH_AGENTS_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load agents.",
      };

    case actionTypes.CREATE_AGENT_REQUESTED:
    case actionTypes.UPDATE_AGENT_REQUESTED:
    case actionTypes.PUBLISH_AGENT_REQUESTED:
    case actionTypes.DELETE_AGENT_REQUESTED:
    case actionTypes.BATCH_DELETE_AGENTS_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.CREATE_AGENT_SUCCEEDED:
    case actionTypes.UPDATE_AGENT_SUCCEEDED:
    case actionTypes.PUBLISH_AGENT_SUCCEEDED:
    case actionTypes.DELETE_AGENT_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.BATCH_DELETE_AGENTS_SUCCEEDED:
      return {
        ...state,
        selectedIds: [],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.SET_AGENT_FILTERS: {
      const patch = action.payload as Partial<AgentFilters>;
      return {
        ...state,
        filters: { ...state.filters, ...patch },
        page: 1,
        selectedIds: [],
      };
    }

    case actionTypes.SET_AGENT_PAGE: {
      const { page } = action.payload as { page: number };
      return { ...state, page: Math.max(page, 1), selectedIds: [] };
    }

    case actionTypes.TOGGLE_AGENT_SELECTED: {
      const { id } = action.payload as { id: string };
      const selected = state.selectedIds.includes(id);
      return {
        ...state,
        selectedIds: selected
          ? state.selectedIds.filter((current) => current !== id)
          : [...state.selectedIds, id],
      };
    }

    case actionTypes.SET_AGENT_SELECTION: {
      const { ids } = action.payload as { ids: string[] };
      return { ...state, selectedIds: [...new Set(ids)] };
    }

    case actionTypes.CLEAR_AGENT_SELECTION:
      return { ...state, selectedIds: [] };

    case actionTypes.AGENT_ACTION_FAILED: {
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

    case actionTypes.CLEAR_AGENT_ISSUES:
      return { ...state, error: null, validationIssues: {} };

    default:
      return state;
  }
}
