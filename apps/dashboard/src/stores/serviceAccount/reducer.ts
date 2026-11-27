import type { ApiKey } from "@stores/developer/type";
import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type { ServiceAccount, ServiceAccountState } from "./type";

export const INITIAL_STATE: ServiceAccountState = {
  items: [],
  status: "idle",
  error: null,
  keys: {},
  keysStatus: {},
  pending: {},
  issues: {},
  actionError: null,
};

interface ServiceAccountAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const upsert = (items: ServiceAccount[], next: ServiceAccount) =>
  items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items];

export default function serviceAccountReducer(
  state: ServiceAccountState = INITIAL_STATE,
  action: ServiceAccountAction = { type: "" },
): ServiceAccountState {
  const done = () => setPending(state.pending, action.meta?.pendingKey, false);

  switch (action.type) {
    case actionTypes.FETCH_SERVICE_ACCOUNTS_REQUESTED:
      return {
        ...state,
        status: state.status === "loaded" ? "loaded" : "loading",
        error: null,
      };

    case actionTypes.FETCH_SERVICE_ACCOUNTS_SUCCEEDED:
      return {
        ...state,
        items: action.payload as ServiceAccount[],
        status: "loaded",
        error: null,
      };

    case actionTypes.FETCH_SERVICE_ACCOUNTS_FAILED:
      return {
        ...state,
        status: state.status === "loaded" ? "loaded" : "failed",
        error: (action.payload as { message: string }).message,
      };

    case actionTypes.CREATE_SERVICE_ACCOUNT_REQUESTED:
    case actionTypes.UPDATE_SERVICE_ACCOUNT_REQUESTED:
    case actionTypes.SUSPEND_SERVICE_ACCOUNT_REQUESTED:
    case actionTypes.DELETE_SERVICE_ACCOUNT_REQUESTED:
    case actionTypes.CREATE_SERVICE_ACCOUNT_KEY_REQUESTED:
    case actionTypes.REVOKE_SERVICE_ACCOUNT_KEY_REQUESTED:
    case actionTypes.ROTATE_SERVICE_ACCOUNT_KEY_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        issues: {},
        actionError: null,
      };

    case actionTypes.CREATE_SERVICE_ACCOUNT_SUCCEEDED:
    case actionTypes.UPDATE_SERVICE_ACCOUNT_SUCCEEDED:
    case actionTypes.SUSPEND_SERVICE_ACCOUNT_SUCCEEDED:
      return {
        ...state,
        items: upsert(state.items, action.payload as ServiceAccount),
        pending: done(),
      };

    case actionTypes.DELETE_SERVICE_ACCOUNT_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      const { [id]: _removed, ...keys } = state.keys;
      return {
        ...state,
        items: state.items.filter((item) => item.id !== id),
        keys,
        pending: done(),
      };
    }

    case actionTypes.CREATE_SERVICE_ACCOUNT_KEY_SUCCEEDED:
    case actionTypes.REVOKE_SERVICE_ACCOUNT_KEY_SUCCEEDED:
    case actionTypes.ROTATE_SERVICE_ACCOUNT_KEY_SUCCEEDED:
      return { ...state, pending: done() };

    case actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_REQUESTED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        keysStatus: {
          ...state.keysStatus,
          [id]: state.keysStatus[id] === "loaded" ? "loaded" : "loading",
        },
      };
    }

    case actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_SUCCEEDED: {
      const { id, keys } = action.payload as { id: string; keys: ApiKey[] };
      return {
        ...state,
        keys: { ...state.keys, [id]: keys },
        keysStatus: { ...state.keysStatus, [id]: "loaded" },
      };
    }

    case actionTypes.FETCH_SERVICE_ACCOUNT_KEYS_FAILED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        keysStatus: { ...state.keysStatus, [id]: "failed" },
      };
    }

    case actionTypes.SERVICE_ACCOUNT_ACTION_FAILED: {
      const payload = action.payload as {
        message: string;
        issues: Record<string, string>;
      };
      return {
        ...state,
        pending: done(),
        issues: payload.issues,
        actionError: payload.message,
      };
    }

    case actionTypes.CLEAR_SERVICE_ACCOUNT_ISSUES:
      return { ...state, issues: {}, actionError: null };

    default:
      return state;
  }
}
