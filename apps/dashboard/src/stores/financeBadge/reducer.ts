import actionTypes from "./actionTypes";
import type { FinanceBadgeState } from "./type";

export const INITIAL_STATE: FinanceBadgeState = {
  pendingApprovals: 0,
  unacknowledgedAlerts: 0,
  more: { approvals: false, alerts: false },
};

export default function financeBadgeReducer(
  state: FinanceBadgeState = INITIAL_STATE,
  action: { type: string; payload?: unknown } = { type: "" },
): FinanceBadgeState {
  if (action.type === actionTypes.FETCH_FINANCE_BADGES_SUCCEEDED) {
    const payload = action.payload as Partial<FinanceBadgeState>;
    return {
      ...state,
      ...payload,
      more: { ...state.more, ...payload.more },
    };
  }
  return state;
}
