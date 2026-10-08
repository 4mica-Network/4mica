import {
  address,
  batchDeleteSchema,
  DEFAULT_PAGE_SIZE,
  decimalAmount,
  email as emailAddress,
  futureTimestamp,
  MAX_INT32,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  positiveDecimalAmount,
  positiveInt,
  singleLine,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export const CustomerTypeSchema = v.picklist([
  "HUMAN",
  "ORGANIZATION",
  "AGENT",
  "WALLET",
]);

export const CustomerStatusSchema = v.picklist([
  "ACTIVE",
  "BLOCKED",
  "SUSPENDED",
]);

export const CustomerIdentitySourceSchema = v.picklist([
  "MANUAL",
  "API",
  "VERIFIED",
  "DISCOVERED",
]);

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);
const email = emailAddress(320);
const description = v.pipe(v.string(), v.trim(), v.maxLength(280));
const notes = v.pipe(v.string(), v.trim(), v.maxLength(2000));

const limitCurrency = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.regex(/^[A-Z0-9]{2,16}$/, "must be a currency code"),
);

const identityValue = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(320),
);

const timestamp = v.pipe(v.string(), v.isoTimestamp());

const statusReason = v.pipe(v.string(), v.trim(), v.maxLength(280));

const positiveCount = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform(Number),
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(MAX_INT32),
);

export const CustomerQuotaUnitSchema = v.picklist(["REQUESTS", "AMOUNT"]);

export const CustomerQuotaPeriodSchema = v.picklist([
  "DAY",
  "WEEK",
  "MONTH",
  "TOTAL",
]);

const percent = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^\d{1,3}(\.\d{1,2})?$/, "must be a percentage"),
  v.check((value) => Number(value) <= 100, "must not be above 100"),
);

const WINDOW_MESSAGE = "must be after the start date";

const isOrderedWindow = (input: {
  validFrom?: string | null;
  validUntil?: string | null;
}): boolean =>
  !input.validFrom ||
  !input.validUntil ||
  new Date(input.validFrom).getTime() < new Date(input.validUntil).getTime();

const IdentityVariantsSchema = v.variant("type", [
  v.object({
    type: v.literal("WALLET"),
    network: PaymentNetworkSchema,
    address,
    source: v.optional(CustomerIdentitySourceSchema, "MANUAL"),
    validFrom: v.optional(v.nullable(timestamp)),
    validUntil: v.optional(v.nullable(timestamp)),
  }),
  v.object({
    type: v.literal("EMAIL"),
    value: email,
    source: v.optional(CustomerIdentitySourceSchema, "MANUAL"),
    validFrom: v.optional(v.nullable(timestamp)),
    validUntil: v.optional(v.nullable(timestamp)),
  }),
  v.object({
    type: v.literal("EXTERNAL"),
    value: identityValue,
    source: v.optional(CustomerIdentitySourceSchema, "MANUAL"),
    validFrom: v.optional(v.nullable(timestamp)),
    validUntil: v.optional(v.nullable(timestamp)),
  }),
]);

export const CustomerIdentitySchema = v.pipe(
  IdentityVariantsSchema,
  v.forward(
    v.check((input) => isOrderedWindow(input), WINDOW_MESSAGE),
    ["validUntil"],
  ),
);

export const UpdateCustomerIdentitySchema = v.pipe(
  v.partial(
    v.object({
      source: CustomerIdentitySourceSchema,
      validFrom: v.nullable(timestamp),
      validUntil: v.nullable(timestamp),
      blocked: v.boolean(),
    }),
  ),
  v.forward(
    v.check((input) => isOrderedWindow(input), WINDOW_MESSAGE),
    ["validUntil"],
  ),
);

export const SetCustomerStatusSchema = v.variant("status", [
  v.object({
    status: v.literal("ACTIVE"),
  }),
  v.object({
    status: v.literal("BLOCKED"),
    reason: v.optional(v.nullable(statusReason)),
  }),
  v.object({
    status: v.literal("SUSPENDED"),
    suspendedUntil: futureTimestamp,
    reason: v.optional(v.nullable(statusReason)),
  }),
]);

export const CreateCustomerSchema = v.object({
  name,
  email: v.optional(v.nullable(email)),
  type: v.optional(CustomerTypeSchema, "ORGANIZATION"),
  description: v.optional(v.nullable(description)),
  notes: v.optional(v.nullable(notes)),

  dailyLimit: v.optional(v.nullable(decimalAmount)),
  monthlyLimit: v.optional(v.nullable(decimalAmount)),
  limitCurrency: v.optional(limitCurrency, "USD"),

  identities: v.optional(
    v.pipe(v.array(CustomerIdentitySchema), v.maxLength(20)),
    [],
  ),
});

export const UpdateCustomerSchema = v.partial(
  v.object({
    name,
    email: v.nullable(email),
    type: CustomerTypeSchema,
    description: v.nullable(description),
    notes: v.nullable(notes),

    dailyLimit: v.nullable(decimalAmount),
    monthlyLimit: v.nullable(decimalAmount),
    limitCurrency,
  }),
);

export const SetCustomerPolicySchema = v.pipe(
  v.partial(
    v.object({
      freeQuotaUnit: v.nullable(CustomerQuotaUnitSchema),
      freeQuota: v.nullable(decimalAmount),
      freeQuotaPeriod: v.nullable(CustomerQuotaPeriodSchema),
      discountPercent: v.nullable(percent),
      discountFixed: v.nullable(decimalAmount),
      minPaymentAmount: v.nullable(decimalAmount),
      approvalThreshold: v.nullable(decimalAmount),
    }),
  ),
  v.forward(
    v.check((input) => {
      const parts = [
        input.freeQuotaUnit,
        input.freeQuota,
        input.freeQuotaPeriod,
      ];
      const touched = parts.filter((part) => part !== undefined);
      if (touched.length === 0) {
        return true;
      }
      const set = parts.filter((part) => part !== undefined && part !== null);
      return set.length === 0 || set.length === 3;
    }, "needs a unit, an amount and a period together"),
    ["freeQuota"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.freeQuotaUnit !== "REQUESTS" ||
        input.freeQuota == null ||
        Number.isInteger(Number(input.freeQuota)),
      "must be a whole number of requests",
    ),
    ["freeQuota"],
  ),
);

export const CustomerCreditKindSchema = v.picklist([
  "PROMOTIONAL",
  "PREPAID",
  "ADJUSTMENT",
]);

export const GrantCustomerCreditSchema = v.pipe(
  v.object({
    kind: CustomerCreditKindSchema,
    amount: v.pipe(
      v.string(),
      v.trim(),
      v.regex(
        /^-?(?!0\d)\d{1,20}(\.\d{1,18})?$/,
        "must be a decimal amount, as a string",
      ),
      v.check((value) => Number(value) !== 0, "must not be zero"),
    ),
    reason: v.optional(v.nullable(statusReason)),
  }),
  v.forward(
    v.check(
      (input) => input.kind !== "PROMOTIONAL" || !input.amount.startsWith("-"),
      "promotional credit cannot be negative",
    ),
    ["amount"],
  ),
);

export const CustomerCouponKindSchema = v.picklist(["PERCENT", "FIXED"]);

const couponCode = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.minLength(1),
  v.maxLength(64),
  v.regex(/^[A-Z0-9][A-Z0-9_-]*$/, "may use letters, numbers, - and _"),
);

export const CreateCustomerCouponSchema = v.variant("kind", [
  v.object({
    kind: v.literal("PERCENT"),
    code: couponCode,
    value: percent,
    expiresAt: v.optional(v.nullable(futureTimestamp)),
    usageLimit: v.optional(v.nullable(positiveCount)),
  }),
  v.object({
    kind: v.literal("FIXED"),
    code: couponCode,
    value: positiveDecimalAmount,
    expiresAt: v.optional(v.nullable(futureTimestamp)),
    usageLimit: v.optional(v.nullable(positiveCount)),
  }),
]);

export const UpdateCustomerCouponSchema = v.partial(
  v.object({
    expiresAt: v.nullable(futureTimestamp),
    usageLimit: v.nullable(positiveCount),
    revoked: v.boolean(),
  }),
);

export const ResolveCustomerSchema = v.object({
  payerAddress: address,
  network: PaymentNetworkSchema,
  amount: positiveDecimalAmount,
  couponCode: v.optional(v.nullable(couponCode)),
});

export const BatchDeleteCustomersSchema = batchDeleteSchema("a customer id");

export const ListCustomersQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  type: v.optional(CustomerTypeSchema),
  status: v.optional(CustomerStatusSchema),
  network: v.optional(PaymentNetworkSchema),
  source: v.optional(CustomerIdentitySourceSchema),
  sort: v.optional(
    v.picklist([
      "totalSpend",
      "-totalSpend",
      "recentSpend",
      "-recentSpend",
      "txnCount",
      "-txnCount",
      "lastActiveAt",
      "-lastActiveAt",
      "name",
      "-name",
      "createdAt",
      "-createdAt",
    ]),
    "-totalSpend",
  ),
});

export const CustomerActivityQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  status: v.optional(v.picklist(["PENDING", "SETTLED", "FAILED"])),
  network: v.optional(PaymentNetworkSchema),
  sort: v.optional(
    v.picklist(["createdAt", "-createdAt", "amount", "-amount"]),
    "-createdAt",
  ),
});

export type CustomerIdentityInput = v.InferOutput<
  typeof CustomerIdentitySchema
>;
export type UpdateCustomerIdentityInput = v.InferOutput<
  typeof UpdateCustomerIdentitySchema
>;
export type CreateCustomerInput = v.InferOutput<typeof CreateCustomerSchema>;
export type UpdateCustomerInput = v.InferOutput<typeof UpdateCustomerSchema>;
export type SetCustomerStatusInput = v.InferOutput<
  typeof SetCustomerStatusSchema
>;
export type SetCustomerPolicyInput = v.InferOutput<
  typeof SetCustomerPolicySchema
>;
export type GrantCustomerCreditInput = v.InferOutput<
  typeof GrantCustomerCreditSchema
>;
export type CreateCustomerCouponInput = v.InferOutput<
  typeof CreateCustomerCouponSchema
>;
export type UpdateCustomerCouponInput = v.InferOutput<
  typeof UpdateCustomerCouponSchema
>;
export type ResolveCustomerInput = v.InferOutput<typeof ResolveCustomerSchema>;
export type ListCustomersQuery = v.InferOutput<typeof ListCustomersQuerySchema>;
export type CustomerActivityQuery = v.InferOutput<
  typeof CustomerActivityQuerySchema
>;
