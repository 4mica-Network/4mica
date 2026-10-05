import actionTypes from "./actionTypes";
import type {
  Customer,
  CustomerCoupon,
  CustomerCreditBalance,
  CustomerCreditEntry,
  CustomerDetail,
  CustomerFilters,
  CustomerOverview,
  CustomerState,
  Payment,
} from "./type";

export const DEFAULT_PAGE_SIZE = 20;
export const ACTIVITY_PAGE_SIZE = 10;

const EMPTY_DETAIL: CustomerDetail = {
  customer: null,
  overview: null,
  credit: null,
  creditEntries: [],
  coupons: [],
  activity: { items: [], total: 0, page: 1, limit: ACTIVITY_PAGE_SIZE },
  isLoading: false,
  hasLoaded: false,
};

export const INITIAL_STATE: CustomerState = {
  items: [],
  total: 0,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  filters: { q: "", type: "", status: "", network: "", sort: "-totalSpend" },
  selectedIds: [],
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
  detail: EMPTY_DETAIL,
};

interface CustomerAction {
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

export default function customerReducer(
  state: CustomerState = INITIAL_STATE,
  action: CustomerAction = { type: "" },
): CustomerState {
  switch (action.type) {
    case actionTypes.FETCH_CUSTOMERS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_CUSTOMERS_SUCCEEDED: {
      const payload = action.payload as {
        items: Customer[];
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

    case actionTypes.FETCH_CUSTOMERS_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load customers.",
      };

    case actionTypes.CREATE_CUSTOMER_REQUESTED:
    case actionTypes.UPDATE_CUSTOMER_REQUESTED:
    case actionTypes.CREATE_CUSTOMER_COUPON_REQUESTED:
    case actionTypes.UPDATE_CUSTOMER_COUPON_REQUESTED:
    case actionTypes.DELETE_CUSTOMER_COUPON_REQUESTED:
    case actionTypes.GRANT_CUSTOMER_CREDIT_REQUESTED:
    case actionTypes.ZERO_CUSTOMER_CREDIT_REQUESTED:
    case actionTypes.SET_CUSTOMER_POLICY_REQUESTED:
    case actionTypes.RESET_CUSTOMER_USAGE_REQUESTED:
    case actionTypes.SET_CUSTOMER_STATUS_REQUESTED:
    case actionTypes.DELETE_CUSTOMER_REQUESTED:
    case actionTypes.BATCH_DELETE_CUSTOMERS_REQUESTED:
    case actionTypes.ADD_CUSTOMER_IDENTITY_REQUESTED:
    case actionTypes.UPDATE_CUSTOMER_IDENTITY_REQUESTED:
    case actionTypes.REMOVE_CUSTOMER_IDENTITY_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.CREATE_CUSTOMER_SUCCEEDED:
    case actionTypes.DELETE_CUSTOMER_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.UPDATE_CUSTOMER_SUCCEEDED:
    case actionTypes.SET_CUSTOMER_POLICY_SUCCEEDED:
    case actionTypes.SET_CUSTOMER_STATUS_SUCCEEDED:
    case actionTypes.CUSTOMER_IDENTITY_CHANGED: {
      const customer = action.payload as Customer;
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        items: state.items.map((item) =>
          item.id === customer.id ? customer : item,
        ),
        detail:
          state.detail.customer?.id === customer.id
            ? { ...state.detail, customer }
            : state.detail,
      };
    }

    case actionTypes.BATCH_DELETE_CUSTOMERS_SUCCEEDED:
      return {
        ...state,
        selectedIds: [],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.FETCH_CUSTOMER_DETAIL_PENDING:
      return {
        ...state,
        error: null,
        detail: { ...state.detail, isLoading: true },
      };

    case actionTypes.FETCH_CUSTOMER_DETAIL_SUCCEEDED: {
      const payload = action.payload as {
        customer: Customer;
        overview: CustomerOverview;
      };
      return {
        ...state,
        detail: {
          ...state.detail,
          customer: payload.customer,
          overview: payload.overview,
          isLoading: false,
          hasLoaded: true,
        },
      };
    }

    case actionTypes.FETCH_CUSTOMER_DETAIL_FAILED:
      return {
        ...state,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load that customer.",
        detail: { ...state.detail, isLoading: false, hasLoaded: true },
      };

    case actionTypes.FETCH_CUSTOMER_COUPONS_SUCCEEDED: {
      const { items } = action.payload as { items: CustomerCoupon[] };
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        detail: { ...state.detail, coupons: items },
      };
    }

    case actionTypes.FETCH_CUSTOMER_CREDIT_SUCCEEDED: {
      const payload = action.payload as {
        balance: CustomerCreditBalance;
        items: CustomerCreditEntry[];
      };
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        detail: {
          ...state.detail,
          credit: payload.balance,
          creditEntries: payload.items,
        },
      };
    }

    case actionTypes.FETCH_CUSTOMER_ACTIVITY_SUCCEEDED: {
      const payload = action.payload as {
        items: Payment[];
        total: number;
        page: number;
        limit: number;
      };
      return {
        ...state,
        detail: { ...state.detail, activity: payload },
      };
    }

    case actionTypes.SET_CUSTOMER_ACTIVITY_PAGE: {
      const { page } = action.payload as { page: number };
      return {
        ...state,
        detail: {
          ...state.detail,
          activity: { ...state.detail.activity, page: Math.max(page, 1) },
        },
      };
    }

    case actionTypes.SET_CUSTOMER_FILTERS: {
      const patch = action.payload as Partial<CustomerFilters>;
      return {
        ...state,
        filters: { ...state.filters, ...patch },
        page: 1,
        selectedIds: [],
      };
    }

    case actionTypes.SET_CUSTOMER_PAGE: {
      const { page } = action.payload as { page: number };
      return { ...state, page: Math.max(page, 1), selectedIds: [] };
    }

    case actionTypes.TOGGLE_CUSTOMER_SELECTED: {
      const { id } = action.payload as { id: string };
      const selected = state.selectedIds.includes(id);
      return {
        ...state,
        selectedIds: selected
          ? state.selectedIds.filter((current) => current !== id)
          : [...state.selectedIds, id],
      };
    }

    case actionTypes.SET_CUSTOMER_SELECTION: {
      const { ids } = action.payload as { ids: string[] };
      return { ...state, selectedIds: [...new Set(ids)] };
    }

    case actionTypes.CLEAR_CUSTOMER_SELECTION:
      return { ...state, selectedIds: [] };

    case actionTypes.CUSTOMER_ACTION_FAILED: {
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

    case actionTypes.CLEAR_CUSTOMER_ISSUES:
      return { ...state, error: null, validationIssues: {} };

    case actionTypes.RESET_CUSTOMER_DETAIL:
      return { ...state, detail: EMPTY_DETAIL, error: null };

    default:
      return state;
  }
}
