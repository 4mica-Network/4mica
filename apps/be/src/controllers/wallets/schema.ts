import {
  address,
  DEFAULT_PAGE_SIZE,
  MAX_BATCH_DELETE,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  positiveInt,
} from "@controllers/schema-primitives";
import * as v from "valibot";

export {
  DEFAULT_PAGE_SIZE,
  MAX_BATCH_DELETE,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
};

export const WalletRoleSchema = v.picklist(["PAYER", "RECIPIENT", "BOTH"]);

export const WalletStatusSchema = v.picklist(["ACTIVE", "PAUSED", "RETIRED"]);

const label = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));

const description = v.pipe(v.string(), v.trim(), v.maxLength(280));

export const CreateWalletNonceSchema = v.object({
  address,
  network: PaymentNetworkSchema,
});

export const CreateWalletSchema = v.object({
  label,
  description: v.optional(v.nullable(description)),
  address,
  network: PaymentNetworkSchema,
  role: v.optional(WalletRoleSchema, "BOTH"),
  nonce: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  signature: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^0x[0-9a-fA-F]+$/, "must be a hex signature"),
    v.maxLength(2048),
  ),
});

export const UpdateWalletSchema = v.partial(
  v.object({
    label,
    description: v.nullable(description),
    role: WalletRoleSchema,
    status: WalletStatusSchema,
    isDefault: v.boolean(),
  }),
);

export const BatchDeleteWalletsSchema = v.object({
  ids: v.pipe(
    v.array(v.pipe(v.string(), v.uuid("must be a wallet id"))),
    v.minLength(1, "select at least one wallet"),
    v.maxLength(MAX_BATCH_DELETE),
    v.transform((ids) => [...new Set(ids)]),
  ),
});

export const ListWalletsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  status: v.optional(WalletStatusSchema),
  network: v.optional(PaymentNetworkSchema),
  role: v.optional(WalletRoleSchema),
  sort: v.optional(
    v.picklist(["createdAt", "-createdAt", "label", "-label"]),
    "-createdAt",
  ),
});

export type CreateWalletNonceInput = v.InferOutput<
  typeof CreateWalletNonceSchema
>;
export type CreateWalletInput = v.InferOutput<typeof CreateWalletSchema>;
export type UpdateWalletInput = v.InferOutput<typeof UpdateWalletSchema>;
export type BatchDeleteWalletsInput = v.InferOutput<
  typeof BatchDeleteWalletsSchema
>;
export type ListWalletsQuery = v.InferOutput<typeof ListWalletsQuerySchema>;
