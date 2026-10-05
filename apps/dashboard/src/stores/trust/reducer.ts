import actionTypes from "./actionTypes";
import type { Faq, Report, ResourcePolicy, Review, TrustState } from "./type";

export const INITIAL_STATE: TrustState = {
  policy: null,
  faqs: [],
  summary: null,
  reviews: [],
  reports: [],
  pending: {},
  error: null,
  validationIssues: {},
};

interface TrustAction {
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

export default function trustReducer(
  state: TrustState = INITIAL_STATE,
  action: TrustAction = { type: "" },
): TrustState {
  switch (action.type) {
    case actionTypes.RESET_TRUST:
      return INITIAL_STATE;

    case actionTypes.FETCH_TRUST_PENDING:
      return { ...state, pending: setPending(state.pending, "trust", true) };

    case actionTypes.FETCH_TRUST_SUCCEEDED: {
      const payload = action.payload as Pick<
        TrustState,
        "policy" | "summary" | "reviews" | "reports" | "faqs"
      >;
      return {
        ...state,
        ...payload,
        error: null,
        pending: setPending(state.pending, "trust", false),
      };
    }

    case actionTypes.FETCH_TRUST_FAILED:
      return {
        ...state,
        error: (action.payload as { message: string }).message,
        pending: setPending(state.pending, "trust", false),
      };

    case actionTypes.SAVE_POLICY_REQUESTED:
    case actionTypes.REPLY_TO_REVIEW_REQUESTED:
    case actionTypes.UPDATE_REPORT_REQUESTED:
    case actionTypes.CREATE_FAQ_REQUESTED:
    case actionTypes.UPDATE_FAQ_REQUESTED:
    case actionTypes.DELETE_FAQ_REQUESTED:
    case actionTypes.REORDER_FAQS_REQUESTED:
      return {
        ...state,
        error: null,
        validationIssues: {},
        pending: setPending(state.pending, action.meta?.pendingKey, true),
      };

    case actionTypes.SAVE_POLICY_SUCCEEDED:
      return {
        ...state,
        policy: (action.payload as { policy: ResourcePolicy | null }).policy,
        pending: setPending(state.pending, "savePolicy", false),
      };

    case actionTypes.REPLY_TO_REVIEW_SUCCEEDED: {
      const { review } = action.payload as { review: Review };
      return {
        ...state,
        reviews: state.reviews.map((row) =>
          row.id === review.id ? review : row,
        ),
        pending: setPending(state.pending, `review:${review.id}`, false),
      };
    }

    case actionTypes.UPDATE_REPORT_SUCCEEDED: {
      const { report } = action.payload as { report: Report };
      return {
        ...state,
        reports: state.reports.map((row) =>
          row.id === report.id ? report : row,
        ),
        pending: setPending(state.pending, `report:${report.id}`, false),
      };
    }

    case actionTypes.FAQS_CHANGED:
      return {
        ...state,
        faqs: (action.payload as { faqs: Faq[] }).faqs,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.TRUST_ACTION_FAILED: {
      const { message, issues } = action.payload as {
        message: string;
        issues: Record<string, string>;
      };
      return {
        ...state,
        error: message,
        validationIssues: issues,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.CLEAR_TRUST_ISSUES:
      return { ...state, error: null, validationIssues: {} };

    default:
      return state;
  }
}
