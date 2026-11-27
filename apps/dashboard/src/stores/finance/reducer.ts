import { setPending } from "@stores/utils";
import type {
  FinanceList,
  FinanceReport,
  ListFilters,
  ListItems,
  ReportResults,
} from "./actions";
import actionTypes from "./actionTypes";
import type {
  ApprovalRequest,
  FinanceState,
  FinancialAlert,
  GovernanceSettings,
  Paged,
  ReportsState,
  SpendingPolicy,
} from "./type";

const DAY_MS = 86_400_000;

export const isoDay = (time: number): string =>
  new Date(time).toISOString().slice(0, 10);

export const defaultRange = (now = Date.now()) => ({
  from: isoDay(now - 29 * DAY_MS),
  to: isoDay(now),
});

const paged = <T, F>(filters: F): Paged<T, F> => ({
  items: [],
  nextCursor: null,
  status: "idle",
  isLoadingMore: false,
  error: null,
  filters,
});

const INITIAL_REPORTS: ReportsState = {
  range: defaultRange(),
  groupBy: "project",
  direction: "sent",
  summary: null,
  summaryStatus: "idle",
  usage: [],
  usageStatus: "idle",
  reconciliation: null,
  reconciliationStatus: "idle",
  error: null,
};

export const INITIAL_STATE: FinanceState = {
  policies: [],
  policiesStatus: "idle",
  policiesError: null,
  approvals: paged({ status: "", kind: "" }),
  alerts: paged({ acknowledged: "false", kind: "" }),
  authorizations: paged({ status: "", projectId: "", from: "", to: "" }),
  reports: INITIAL_REPORTS,
  governance: null,
  governanceStatus: "idle",
  pending: {},
  error: null,
  issues: {},
};

interface FinanceAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const messageOf = (payload: unknown, fallback: string) =>
  (payload as { message?: string } | undefined)?.message ?? fallback;

const settled = (state: FinanceState, action: FinanceAction) =>
  setPending(state.pending, action.meta?.pendingKey, false);

const replaceIn = <T extends { id: string }>(items: T[], next: T): T[] =>
  items.map((item) => (item.id === next.id ? next : item));

const pendingFirst = (items: ApprovalRequest[]): ApprovalRequest[] => [
  ...items.filter((item) => item.status === "PENDING"),
  ...items.filter((item) => item.status !== "PENDING"),
];

const REPORT_STATUS = {
  summary: "summaryStatus",
  usage: "usageStatus",
  reconciliation: "reconciliationStatus",
} as const;

export default function financeReducer(
  state: FinanceState = INITIAL_STATE,
  action: FinanceAction = { type: "" },
): FinanceState {
  switch (action.type) {
    case actionTypes.FETCH_POLICIES_PENDING:
      return {
        ...state,
        policiesStatus:
          state.policiesStatus === "loaded" ? "loaded" : "loading",
        policiesError: null,
      };

    case actionTypes.FETCH_POLICIES_SUCCEEDED:
      return {
        ...state,
        policies: (action.payload as { items: SpendingPolicy[] }).items,
        policiesStatus: "loaded",
        policiesError: null,
      };

    case actionTypes.FETCH_POLICIES_FAILED:
      return {
        ...state,
        policiesStatus: state.policiesStatus === "loaded" ? "loaded" : "failed",
        policiesError: messageOf(action.payload, "Failed to load policies."),
      };

    case actionTypes.SAVE_POLICY_REQUESTED:
    case actionTypes.DELETE_POLICY_REQUESTED:
    case actionTypes.FREEZE_POLICY_REQUESTED:
    case actionTypes.DECIDE_APPROVAL_REQUESTED:
    case actionTypes.CANCEL_APPROVAL_REQUESTED:
    case actionTypes.APPLY_APPROVAL_REQUESTED:
    case actionTypes.ACKNOWLEDGE_ALERT_REQUESTED:
    case actionTypes.SAVE_GOVERNANCE_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        issues: {},
      };

    case actionTypes.SAVE_POLICY_SUCCEEDED:
    case actionTypes.FREEZE_POLICY_SUCCEEDED: {
      const policy = action.payload as SpendingPolicy;
      const exists = state.policies.some((item) => item.id === policy.id);
      return {
        ...state,
        policies: exists
          ? replaceIn(state.policies, policy)
          : [policy, ...state.policies],
        pending: settled(state, action),
      };
    }

    case actionTypes.DELETE_POLICY_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        policies: state.policies.filter((item) => item.id !== id),
        pending: settled(state, action),
      };
    }

    case actionTypes.FETCH_LIST_PENDING: {
      const { list, append } = action.payload as {
        list: FinanceList;
        append: boolean;
      };
      const current = state[list];
      return {
        ...state,
        [list]: append
          ? { ...current, isLoadingMore: true, error: null }
          : {
              ...current,
              status: current.status === "loaded" ? "loaded" : "loading",
              error: null,
            },
      };
    }

    case actionTypes.FETCH_LIST_SUCCEEDED: {
      const payload = action.payload as {
        list: FinanceList;
        items: ListItems[FinanceList][];
        nextCursor: string | null;
        append: boolean;
      };
      const current = state[payload.list] as Paged<
        ListItems[FinanceList],
        unknown
      >;
      const items = payload.append
        ? [...current.items, ...payload.items]
        : payload.items;
      return {
        ...state,
        [payload.list]: {
          ...current,
          items:
            payload.list === "approvals"
              ? pendingFirst(items as ApprovalRequest[])
              : items,
          nextCursor: payload.nextCursor,
          status: "loaded",
          isLoadingMore: false,
          error: null,
        },
      };
    }

    case actionTypes.FETCH_LIST_FAILED: {
      const { list, message } = action.payload as {
        list: FinanceList;
        message: string;
      };
      const current = state[list];
      return {
        ...state,
        [list]: {
          ...current,
          status: current.status === "loaded" ? "loaded" : "failed",
          isLoadingMore: false,
          error: message,
        },
      };
    }

    case actionTypes.SET_LIST_FILTERS: {
      const { list, filters } = action.payload as {
        list: FinanceList;
        filters: Partial<ListFilters[FinanceList]>;
      };
      const current = state[list];
      return {
        ...state,
        [list]: {
          ...current,
          filters: { ...current.filters, ...filters },
          nextCursor: null,
        },
      };
    }

    case actionTypes.APPROVAL_UPDATED: {
      const approval = action.payload as ApprovalRequest;
      return {
        ...state,
        approvals: {
          ...state.approvals,
          items: pendingFirst(replaceIn(state.approvals.items, approval)),
        },
        pending: settled(state, action),
      };
    }

    case actionTypes.APPLY_APPROVAL_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      const executedAt = new Date().toISOString();
      return {
        ...state,
        approvals: {
          ...state.approvals,
          items: state.approvals.items.map((item) =>
            item.id === id ? { ...item, executedAt } : item,
          ),
        },
        pending: settled(state, action),
      };
    }

    case actionTypes.ALERT_UPDATED:
      return {
        ...state,
        alerts: {
          ...state.alerts,
          items: replaceIn(
            state.alerts.items,
            action.payload as FinancialAlert,
          ),
        },
        pending: settled(state, action),
      };

    case actionTypes.SET_REPORT_OPTIONS:
      return {
        ...state,
        reports: {
          ...state.reports,
          ...(action.payload as Partial<ReportsState>),
        },
      };

    case actionTypes.FETCH_REPORT_PENDING: {
      const { report } = action.payload as { report: FinanceReport };
      const key = REPORT_STATUS[report];
      return {
        ...state,
        reports: {
          ...state.reports,
          [key]: state.reports[key] === "loaded" ? "loaded" : "loading",
          error: null,
        },
      };
    }

    case actionTypes.FETCH_REPORT_SUCCEEDED: {
      const { report, result } = action.payload as {
        report: FinanceReport;
        result: ReportResults[FinanceReport];
      };
      return {
        ...state,
        reports: {
          ...state.reports,
          [report]: result,
          [REPORT_STATUS[report]]: "loaded",
        },
      };
    }

    case actionTypes.FETCH_REPORT_FAILED: {
      const { report, message } = action.payload as {
        report: FinanceReport;
        message: string;
      };
      const key = REPORT_STATUS[report];
      return {
        ...state,
        reports: {
          ...state.reports,
          [key]: state.reports[key] === "loaded" ? "loaded" : "failed",
          error: message,
        },
      };
    }

    case actionTypes.FETCH_GOVERNANCE_PENDING:
      return {
        ...state,
        governanceStatus:
          state.governanceStatus === "loaded" ? "loaded" : "loading",
      };

    case actionTypes.FETCH_GOVERNANCE_SUCCEEDED:
      return {
        ...state,
        governance: action.payload as GovernanceSettings,
        governanceStatus: "loaded",
      };

    case actionTypes.FETCH_GOVERNANCE_FAILED:
      return {
        ...state,
        governanceStatus:
          state.governanceStatus === "loaded" ? "loaded" : "failed",
        error: messageOf(action.payload, "Failed to load governance."),
      };

    case actionTypes.SAVE_GOVERNANCE_SUCCEEDED:
      return {
        ...state,
        governance: action.payload as GovernanceSettings,
        pending: settled(state, action),
      };

    case actionTypes.FINANCE_ACTION_FAILED: {
      const payload = action.payload as {
        message?: string;
        issues?: Record<string, string>;
      };
      return {
        ...state,
        pending: settled(state, action),
        error: payload?.message ?? "Something went wrong.",
        issues: payload?.issues ?? {},
      };
    }

    case actionTypes.CLEAR_FINANCE_ISSUES:
      return { ...state, error: null, issues: {} };

    default:
      return state;
  }
}
