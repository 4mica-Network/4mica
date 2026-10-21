import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type { ComplianceSnapshot, ComplianceState } from "./type";

export const INITIAL_STATE: ComplianceState = {
  kybStatus: "UNVERIFIED",
  profile: null,
  owners: [],
  missing: [],
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
};

interface ComplianceAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const withSnapshot = (
  state: ComplianceState,
  snapshot: ComplianceSnapshot,
): ComplianceState => ({
  ...state,
  kybStatus: snapshot.kybStatus,
  profile: snapshot.profile,
  owners: snapshot.owners,
  missing: snapshot.missing,
});

export default function complianceReducer(
  state: ComplianceState = INITIAL_STATE,
  action: ComplianceAction = { type: "" },
): ComplianceState {
  switch (action.type) {
    case actionTypes.FETCH_COMPLIANCE_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_COMPLIANCE_SUCCEEDED:
      return {
        ...withSnapshot(state, action.payload as ComplianceSnapshot),
        isLoading: false,
        hasLoaded: true,
        error: null,
      };

    case actionTypes.FETCH_COMPLIANCE_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load compliance details.",
      };

    case actionTypes.UPDATE_COMPLIANCE_REQUESTED:
    case actionTypes.SUBMIT_COMPLIANCE_REQUESTED:
    case actionTypes.CREATE_OWNER_REQUESTED:
    case actionTypes.UPDATE_OWNER_REQUESTED:
    case actionTypes.DELETE_OWNER_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_COMPLIANCE_SUCCEEDED:
    case actionTypes.SUBMIT_COMPLIANCE_SUCCEEDED:
    case actionTypes.CREATE_OWNER_SUCCEEDED:
    case actionTypes.UPDATE_OWNER_SUCCEEDED:
    case actionTypes.DELETE_OWNER_SUCCEEDED:
      return {
        ...withSnapshot(state, action.payload as ComplianceSnapshot),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.COMPLIANCE_ACTION_FAILED: {
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

    default:
      return state;
  }
}
