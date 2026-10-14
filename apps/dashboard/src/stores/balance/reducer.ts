import actionTypes from "./actionTypes";
import type { BalanceState, BalancesResponse } from "./type";

export const INITIAL_STATE: BalanceState = {
  network: null,
  wallets: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
};

interface BalanceAction {
  type: string;
  payload?: unknown;
}

export default function balanceReducer(
  state: BalanceState = INITIAL_STATE,
  action: BalanceAction = { type: "" },
): BalanceState {
  switch (action.type) {
    case actionTypes.FETCH_BALANCES_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_BALANCES_SUCCEEDED: {
      const { network, wallets } = action.payload as BalancesResponse;
      return {
        ...state,
        network,
        wallets,
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_BALANCES_FAILED:
      return {
        ...state,
        isLoading: false,
        error: (action.payload as { message: string }).message,
      };

    default:
      return state;
  }
}
