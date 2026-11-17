import { HttpMethod } from "@4mica/http";
import type {
  PaymentDirection,
  PaymentNetwork,
  PaymentSort,
  PaymentStats,
  PaymentStatus,
  PaymentSummary,
} from "@stores/payment/type";
import { httpClient, mapResponse } from "./client";

const schema = () => import("./paymentSchema");

export interface ListPaymentsParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  direction?: PaymentDirection | "all";
  status?: PaymentStatus;
  network?: PaymentNetwork;
  wallet?: string;
  q?: string;
  sort?: PaymentSort;
}

export const getPayments = (params: ListPaymentsParams = {}) =>
  mapResponse(
    httpClient.request<unknown>({
      url: "/me/payments",
      method: HttpMethod.GET,
      params,
    }),
    async (body) => (await schema()).parsePaymentList(body),
  );

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
  mapResponse(
    httpClient.request<unknown>({
      url: `/me/payments/${encodeURIComponent(id)}`,
      method: HttpMethod.GET,
    }),
    async (body) => (await schema()).parsePayment(body),
  );
