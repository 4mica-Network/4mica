import * as api from "@api/balance";
import i18n from "@i18n";
import { toMessage } from "@utils/http-errors";
import { call, put, takeLatest } from "redux-saga/effects";
import {
  fetchBalancesFailed,
  fetchBalancesPending,
  fetchBalancesSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

export function* fetchBalances(): Generator {
  try {
    yield put(fetchBalancesPending());

    const result = (yield call(() => api.getBalances())) as Awaited<
      ReturnType<typeof api.getBalances>
    >;

    yield put(fetchBalancesSucceeded(result));
  } catch (error) {
    yield put(
      fetchBalancesFailed(
        toMessage(
          error,
          t("store.balance.fetchFailed", "Couldn't load your balances."),
          {
            sessionExpired: t(
              "store.balance.sessionExpired",
              "Your session has expired. Refresh the page and sign in again.",
            ),
          },
        ),
      ),
    );
  }
}

export default [
  takeLatest(actionTypes.FETCH_BALANCES_REQUESTED, fetchBalances),
];
