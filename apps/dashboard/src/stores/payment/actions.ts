import actionTypes from "./actionTypes";
import type {
  Payment,
  PaymentFilters,
  PaymentStats,
  PaymentSummary,
} from "./type";

export const fetchPayments = () => ({
  type: actionTypes.FETCH_PAYMENTS_REQUESTED,
});

export const fetchPaymentsPending = () => ({
  type: actionTypes.FETCH_PAYMENTS_PENDING,
});

export const fetchPaymentsSucceeded = (payload: {
  items: Payment[];
  total: number;
  page: number;
  limit: number;
}) => ({
  type: actionTypes.FETCH_PAYMENTS_SUCCEEDED,
  payload,
});

export const fetchPaymentsFailed = (message: string) => ({
  type: actionTypes.FETCH_PAYMENTS_FAILED,
  payload: { message },
});

export const fetchPaymentSummary = () => ({
  type: actionTypes.FETCH_PAYMENT_SUMMARY_REQUESTED,
});

export const fetchPaymentSummarySucceeded = (summary: PaymentSummary) => ({
  type: actionTypes.FETCH_PAYMENT_SUMMARY_SUCCEEDED,
  payload: summary,
});

export const fetchPaymentStats = (months = 6) => ({
  type: actionTypes.FETCH_PAYMENT_STATS_REQUESTED,
  payload: { months },
});

export const fetchPaymentStatsSucceeded = (stats: PaymentStats) => ({
  type: actionTypes.FETCH_PAYMENT_STATS_SUCCEEDED,
  payload: stats,
});

export const setPaymentFilters = (payload: Partial<PaymentFilters>) => ({
  type: actionTypes.SET_PAYMENT_FILTERS,
  payload,
});

export const setPaymentPage = (page: number) => ({
  type: actionTypes.SET_PAYMENT_PAGE,
  payload: { page },
});
