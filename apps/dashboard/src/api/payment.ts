import { HttpMethod } from "@4mica/http";
import type {
  Payment,
  PaymentDirection,
  PaymentListResponse,
  PaymentNetwork,
  PaymentStats,
  PaymentStatus,
  PaymentSummary,
} from "@stores/payment/type";
import { httpClient } from "./client";

export interface ListPaymentsParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  direction?: PaymentDirection | "all";
  status?: PaymentStatus;
  network?: PaymentNetwork;
  q?: string;
  sort?: "createdAt" | "-createdAt" | "amount" | "-amount";
}

export const getPayments = (params: ListPaymentsParams = {}) =>
  httpClient.request<PaymentListResponse>({
    url: "/me/payments",
    method: HttpMethod.GET,
    params,
  });

export const getPaymentSummary = () =>
  httpClient.request<PaymentSummary>({
    url: "/me/payments/summary",
    method: HttpMethod.GET,
  });

export const getPaymentStats = (months = 6) =>
  httpClient.request<PaymentStats>({
    url: "/me/payments/stats",
    method: HttpMethod.GET,
    params: { months },
  });

export const getPayment = (id: string) =>
  httpClient.request<Payment>({
    url: `/me/payments/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });
