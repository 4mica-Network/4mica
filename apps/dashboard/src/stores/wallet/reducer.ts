import actionTypes from "./actionTypes";
import type { Wallet, WalletFilters, WalletState } from "./type";

export const DEFAULT_PAGE_SIZE = 20;

export const INITIAL_STATE: WalletState = {
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  filters: { q: "", status: "", network: "" },
  selectedIds: [],
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
};

interface WalletAction {
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

export default function walletReducer(
  state: WalletState = INITIAL_STATE,
  action: WalletAction = { type: "" },
): WalletState {
  switch (action.type) {
    case actionTypes.FETCH_WALLETS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_WALLETS_SUCCEEDED: {
      const payload = action.payload as {
        items: Wallet[];
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
        // Drop ticks for rows that are no longer on screen, so a batch action
        // can never touch something the user cannot see.
        selectedIds: state.selectedIds.filter((id) => ids.has(id)),
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_WALLETS_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load wallets.",
      };

    case actionTypes.CREATE_WALLET_REQUESTED:
    case actionTypes.UPDATE_WALLET_REQUESTED:
    case actionTypes.DELETE_WALLET_REQUESTED:
    case actionTypes.BATCH_DELETE_WALLETS_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    /**
     * The list is server-paged, so a mutation clears its pending flag and the
     * saga re-fetches. Splicing the array locally would desync `total` and
     * leave the current page a row short.
     */
    case actionTypes.CREATE_WALLET_SUCCEEDED:
    case actionTypes.UPDATE_WALLET_SUCCEEDED:
    case actionTypes.DELETE_WALLET_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.BATCH_DELETE_WALLETS_SUCCEEDED:
      return {
        ...state,
        selectedIds: [],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.SET_WALLET_FILTERS: {
      const patch = action.payload as Partial<WalletFilters>;
      return {
        ...state,
        filters: { ...state.filters, ...patch },
        // Page 3 of the old filter is rarely a page of the new one.
        page: 1,
        selectedIds: [],
      };
    }

    case actionTypes.SET_WALLET_PAGE: {
      const { page } = action.payload as { page: number };
      return { ...state, page: Math.max(page, 1), selectedIds: [] };
    }

    case actionTypes.TOGGLE_WALLET_SELECTED: {
      const { id } = action.payload as { id: string };
      const selected = state.selectedIds.includes(id);
      return {
        ...state,
        selectedIds: selected
          ? state.selectedIds.filter((current) => current !== id)
          : [...state.selectedIds, id],
      };
    }

    case actionTypes.SET_WALLET_SELECTION: {
      const { ids } = action.payload as { ids: string[] };
      return { ...state, selectedIds: [...new Set(ids)] };
    }

    case actionTypes.CLEAR_WALLET_SELECTION:
      return { ...state, selectedIds: [] };

    case actionTypes.WALLET_ACTION_FAILED: {
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

    case actionTypes.CLEAR_WALLET_ISSUES:
      return { ...state, error: null, validationIssues: {} };

    default:
      return state;
  }
}
