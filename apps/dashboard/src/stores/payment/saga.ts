import { HttpError } from "@4mica/http";
import * as api from "@api/payment";
import i18n from "@i18n";
import { call, put, select, takeLatest } from "redux-saga/effects";
import {
  fetchPaymentStatsSucceeded,
  fetchPaymentSummarySucceeded,
  fetchPaymentsFailed,
  fetchPaymentsPending,
  fetchPaymentsSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectPaymentState } from "./selector";
import type { PaymentState } from "./type";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return t(
        "store.payment.sessionExpired",
        "Your session has expired. Refresh the page and sign in again.",
      );
    }
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

export function* fetchPayments(): Generator {
  try {
    yield put(fetchPaymentsPending());

    const state = (yield select(selectPaymentState)) as PaymentState;
    const { filters, page, limit } = state;

    const result = (yield call(() =>
      api.getPayments({
        page,
        limit,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.direction ? { direction: filters.direction } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.network ? { network: filters.network } : {}),
      }),
    )) as Awaited<ReturnType<typeof api.getPayments>>;

    yield put(fetchPaymentsSucceeded(result));
  } catch (error) {
    yield put(
      fetchPaymentsFailed(
        toMessage(
          error,
          t("store.payment.fetchFailed", "Couldn't load your payments."),
        ),
      ),
    );
  }
}

export function* fetchPaymentSummary(): Generator {
  try {
    const summary = (yield call(() => api.getPaymentSummary())) as Awaited<
      ReturnType<typeof api.getPaymentSummary>
    >;
    yield put(fetchPaymentSummarySucceeded(summary));
  } catch {}
}

export function* fetchPaymentStats(action: {
  type: string;
  payload: { months: number };
}): Generator {
  try {
    const stats = (yield call(() =>
      api.getPaymentStats(action.payload.months),
    )) as Awaited<ReturnType<typeof api.getPaymentStats>>;
    yield put(fetchPaymentStatsSucceeded(stats));
  } catch {}
}

export default [
  takeLatest(actionTypes.FETCH_PAYMENTS_REQUESTED, fetchPayments),
  takeLatest(actionTypes.SET_PAYMENT_FILTERS, fetchPayments),
  takeLatest(actionTypes.SET_PAYMENT_PAGE, fetchPayments),
  takeLatest(actionTypes.FETCH_PAYMENT_SUMMARY_REQUESTED, fetchPaymentSummary),
  takeLatest(actionTypes.FETCH_PAYMENT_STATS_REQUESTED, fetchPaymentStats),
];
