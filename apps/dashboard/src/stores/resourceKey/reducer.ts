import type { ApiKey } from "@stores/developer/type";
import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type { ResourceKeyState, RevealedResourceKey } from "./type";

export const INITIAL_STATE: ResourceKeyState = {
  items: [],
  revealed: null,
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
};

interface ResourceKeyAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const replaceById = <T extends { id: string }>(items: T[], next: T): T[] =>
  items.map((item) => (item.id === next.id ? next : item));

export default function resourceKeyReducer(
  state: ResourceKeyState = INITIAL_STATE,
  action: ResourceKeyAction = { type: "" },
): ResourceKeyState {
  switch (action.type) {
    case actionTypes.RESET_RESOURCE_KEYS:
      return INITIAL_STATE;

    case actionTypes.FETCH_RESOURCE_KEYS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_RESOURCE_KEYS_SUCCEEDED:
      return {
        ...state,
        items: (action.payload as { items: ApiKey[] }).items,
        isLoading: false,
        hasLoaded: true,
        error: null,
      };

    case actionTypes.FETCH_RESOURCE_KEYS_FAILED:
      return {
        ...state,
        isLoading: false,
        error: (action.payload as { message: string }).message,
      };

    case actionTypes.CREATE_RESOURCE_KEY_REQUESTED:
    case actionTypes.REVOKE_RESOURCE_KEY_REQUESTED:
    case actionTypes.DELETE_RESOURCE_KEY_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.CREATE_RESOURCE_KEY_SUCCEEDED: {
      const { apiKey, revealed } = action.payload as {
        apiKey: ApiKey;
        revealed: RevealedResourceKey;
      };
      return {
        ...state,
        items: [apiKey, ...state.items],
        revealed,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.REVOKE_RESOURCE_KEY_SUCCEEDED:
      return {
        ...state,
        items: replaceById(state.items, action.payload as ApiKey),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.DELETE_RESOURCE_KEY_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        items: state.items.filter((key) => key.id !== id),
        revealed: state.revealed?.id === id ? null : state.revealed,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.RESOURCE_KEY_ACTION_FAILED: {
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

    case actionTypes.DISMISS_REVEALED_RESOURCE_KEY:
      return { ...state, revealed: null };

    default:
      return state;
  }
}
