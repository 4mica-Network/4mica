import {
  address,
  batchDeleteSchema,
  DEFAULT_PAGE_SIZE,
  decimalAmount,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  positiveInt,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export const CustomerTypeSchema = v.picklist([
  "HUMAN",
  "ORGANIZATION",
  "AGENT",
  "WALLET",
]);

export const CustomerStatusSchema = v.picklist(["ACTIVE", "BLOCKED"]);

export const CustomerIdentitySourceSchema = v.picklist([
  "MANUAL",
  "API",
  "VERIFIED",
  "DISCOVERED",
]);

const name = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));
const email = v.pipe(v.string(), v.trim(), v.email(), v.maxLength(320));
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

export const CustomerIdentitySchema = v.variant("type", [
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

export const UpdateCustomerIdentitySchema = v.partial(
  v.object({
    source: CustomerIdentitySourceSchema,
    validFrom: v.nullable(timestamp),
    validUntil: v.nullable(timestamp),
  }),
);

export const CreateCustomerSchema = v.object({
  name,
  email: v.optional(v.nullable(email)),
  type: v.optional(CustomerTypeSchema, "ORGANIZATION"),
  status: v.optional(CustomerStatusSchema, "ACTIVE"),
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
    status: CustomerStatusSchema,
    description: v.nullable(description),
    notes: v.nullable(notes),

    dailyLimit: v.nullable(decimalAmount),
    monthlyLimit: v.nullable(decimalAmount),
    limitCurrency,
  }),
);

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
export type ListCustomersQuery = v.InferOutput<typeof ListCustomersQuerySchema>;
export type CustomerActivityQuery = v.InferOutput<
  typeof CustomerActivityQuerySchema
>;
