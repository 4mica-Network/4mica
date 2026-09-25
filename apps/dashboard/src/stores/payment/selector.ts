import type { RootState } from "..";
import type {
  Payment,
  PaymentFilters,
  PaymentState,
  PaymentStats,
  PaymentSummary,
} from "./type";

export const selectPaymentState = (state: RootState): PaymentState =>
  state.payment;

export const selectPayments = (state: RootState): Payment[] =>
  state.payment.items;

export const selectPaymentTotal = (state: RootState): number =>
  state.payment.total;

export const selectPaymentPage = (state: RootState): number =>
  state.payment.page;

export const selectPaymentLimit = (state: RootState): number =>
  state.payment.limit;

export const selectPaymentFilters = (state: RootState): PaymentFilters =>
  state.payment.filters;

export const selectPaymentSummary = (state: RootState): PaymentSummary | null =>
  state.payment.summary;

export const selectPaymentStats = (state: RootState): PaymentStats | null =>
  state.payment.stats;

export const selectIsPaymentsLoading = (state: RootState): boolean =>
  state.payment.isLoading;

export const selectHasLoadedPayments = (state: RootState): boolean =>
  state.payment.hasLoaded;

export const selectPaymentError = (state: RootState): string | null =>
  state.payment.error;
