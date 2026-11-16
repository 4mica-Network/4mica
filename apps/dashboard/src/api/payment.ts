import { HttpMethod } from "@4mica/http";
import type {
  Payment,
  PaymentDirection,
  PaymentListResponse,
  PaymentNetwork,
  PaymentSort,
  PaymentStats,
  PaymentStatus,
  PaymentSummary,
} from "@stores/payment/type";
import { safeExternalUrl } from "@utils/safeUrl";
import { z } from "zod";
import { httpClient } from "./client";

const paymentSchema = z.looseObject({
  id: z.string(),
  resource: z.unknown().transform(safeExternalUrl),
});

const paymentListSchema = z.looseObject({
  items: z.array(paymentSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const parsePayment = (value: unknown): Payment =>
  paymentSchema.parse(value) as unknown as Payment;

export const parsePaymentList = (value: unknown): PaymentListResponse =>
  paymentListSchema.parse(value) as unknown as PaymentListResponse;

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
  httpClient
    .request<unknown>({
      url: "/me/payments",
      method: HttpMethod.GET,
      params,
    })
    .then(parsePaymentList);

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
  httpClient
    .request<unknown>({
      url: `/me/payments/${encodeURIComponent(id)}`,
      method: HttpMethod.GET,
    })
    .then(parsePayment);
