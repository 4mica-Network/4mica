import {
  address,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  positiveDecimalAmount,
  positiveInt,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export const reqIdSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^0x[0-9a-f]{1,64}$/, "must be a 0x-prefixed hex value"),
);

const uuid = v.pipe(v.string(), v.trim(), v.uuid("must be a UUID"));

export const AuthorizeSpendSchema = v.object({
  network: PaymentNetworkSchema,
  assetAddress: v.optional(v.nullable(address), null),
  amount: positiveDecimalAmount,
  payerAddress: address,
  recipientAddress: address,
  reqId: v.optional(v.nullable(reqIdSchema), null),
  agentId: v.optional(v.nullable(uuid), null),
});

export type AuthorizeSpendInput = v.InferOutput<typeof AuthorizeSpendSchema>;

export const ConsumeAuthorizationSchema = v.object({
  reqId: v.optional(v.nullable(reqIdSchema), null),
  txHash: v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte transaction hash"),
      ),
    ),
    null,
  ),
});

export const SpendAuthorizationStatusSchema = v.picklist([
  "RESERVED",
  "PENDING_APPROVAL",
  "DENIED",
  "CONSUMED",
  "RELEASED",
  "EXPIRED",
]);

const timestamp = v.pipe(v.string(), v.trim(), v.isoTimestamp());

export const ListAuthorizationsQuerySchema = v.object({
  status: v.optional(SpendAuthorizationStatusSchema),
  projectId: v.optional(uuid),
  agentId: v.optional(uuid),
  apiKeyId: v.optional(uuid),
  from: v.optional(timestamp),
  to: v.optional(timestamp),
  cursor: v.optional(uuid),
  limit: positiveInt(50, MAX_PAGE_SIZE),
});
