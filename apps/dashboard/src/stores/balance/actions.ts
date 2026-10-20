import actionTypes from "./actionTypes";
import type { BalancesResponse } from "./type";

export const fetchBalances = () => ({
  type: actionTypes.FETCH_BALANCES_REQUESTED,
});

export const fetchBalancesPending = () => ({
  type: actionTypes.FETCH_BALANCES_PENDING,
});

export const fetchBalancesSucceeded = (payload: BalancesResponse) => ({
  type: actionTypes.FETCH_BALANCES_SUCCEEDED,
  payload,
});

export const fetchBalancesFailed = (message: string) => ({
  type: actionTypes.FETCH_BALANCES_FAILED,
  payload: { message },
});
