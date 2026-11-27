import actionTypes from "./actionTypes";
import type { FinanceBadgeState } from "./type";

export const fetchFinanceBadges = () => ({
  type: actionTypes.FETCH_FINANCE_BADGES_REQUESTED,
});

export const fetchFinanceBadgesSucceeded = (
  payload: Partial<FinanceBadgeState>,
) => ({
  type: actionTypes.FETCH_FINANCE_BADGES_SUCCEEDED,
  payload,
});
