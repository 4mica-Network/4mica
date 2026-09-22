import {
  address,
  DEFAULT_PAGE_SIZE,
  decimalAmount,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  positiveInt,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export const PaymentStatusSchema = v.picklist(["PENDING", "SETTLED", "FAILED"]);

export const PaymentDirectionSchema = v.picklist(["sent", "received", "all"]);

const hex32 = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^0x[0-9a-f]{1,64}$/, "must be a 0x-prefixed hex value"),
);

const hexBlob = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^0x[0-9a-fA-F]*$/, "must be a 0x-prefixed hex value"),
  v.maxLength(20_000),
);

const httpsUrl = v.pipe(v.string(), v.trim(), v.url(), v.maxLength(2048));

export const ReportPaymentSchema = v.object({
  reqId: hex32,
  payerAddress: address,
  recipientAddress: address,
  network: PaymentNetworkSchema,
  assetAddress: v.optional(v.nullable(address)),
  amount: decimalAmount,

  status: v.optional(PaymentStatusSchema, "SETTLED"),
  failureReason: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(280))),
  ),

  listingSlug: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(64))),
  ),
  agentSlug: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(64))),
  ),

  resource: v.optional(v.nullable(httpsUrl)),
  description: v.optional(
    v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(280))),
  ),

  guaranteeClaims: v.optional(v.nullable(hexBlob)),
  guaranteeSignature: v.optional(v.nullable(hexBlob)),
  txHash: v.optional(v.nullable(hex32)),
  settledAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
});

export const ListPaymentsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  direction: v.optional(PaymentDirectionSchema, "all"),
  status: v.optional(PaymentStatusSchema),
  network: v.optional(PaymentNetworkSchema),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  sort: v.optional(
    v.picklist(["createdAt", "-createdAt", "amount", "-amount"]),
    "-createdAt",
  ),
});

export const PaymentStatsQuerySchema = v.object({
  months: positiveInt(6, 24),
});

export type PaymentStatsQuery = v.InferOutput<typeof PaymentStatsQuerySchema>;

export type ReportPaymentInput = v.InferOutput<typeof ReportPaymentSchema>;
export type ListPaymentsQuery = v.InferOutput<typeof ListPaymentsQuerySchema>;
export type PaymentDirection = v.InferOutput<typeof PaymentDirectionSchema>;
