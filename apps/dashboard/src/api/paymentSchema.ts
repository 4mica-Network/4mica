import type { Payment, PaymentListResponse } from "@stores/payment/type";
import { safeExternalUrl } from "@utils/safeUrl";
import { z } from "zod";

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
