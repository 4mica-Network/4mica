import actionTypes from "./actionTypes";
import type {
  Payment,
  PaymentFilters,
  PaymentState,
  PaymentStats,
  PaymentSummary,
} from "./type";

export const DEFAULT_PAGE_SIZE = 20;

export const INITIAL_STATE: PaymentState = {
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  filters: { q: "", direction: "", status: "", network: "" },
  summary: null,
  stats: null,
  isLoading: false,
  hasLoaded: false,
  error: null,
};

interface PaymentAction {
  type: string;
  payload?: unknown;
}

export default function paymentReducer(
  state: PaymentState = INITIAL_STATE,
  action: PaymentAction = { type: "" },
): PaymentState {
  switch (action.type) {
    case actionTypes.FETCH_PAYMENTS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_PAYMENTS_SUCCEEDED: {
      const payload = action.payload as {
        items: Payment[];
        total: number;
        page: number;
        limit: number;
      };
      return {
        ...state,
        items: payload.items,
        total: payload.total,
        page: payload.page,
        limit: payload.limit,
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_PAYMENTS_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load payments.",
      };

    case actionTypes.FETCH_PAYMENT_SUMMARY_SUCCEEDED:
      return { ...state, summary: action.payload as PaymentSummary };

    case actionTypes.FETCH_PAYMENT_STATS_SUCCEEDED:
      return { ...state, stats: action.payload as PaymentStats };

    case actionTypes.SET_PAYMENT_FILTERS: {
      const patch = action.payload as Partial<PaymentFilters>;
      return { ...state, filters: { ...state.filters, ...patch }, page: 1 };
    }

    case actionTypes.SET_PAYMENT_PAGE: {
      const { page } = action.payload as { page: number };
      return { ...state, page: Math.max(page, 1) };
    }

    default:
      return state;
  }
}
