import * as v from "valibot";
import { isAddress } from "viem";

export const PaymentNetworkSchema = v.picklist([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
]);

export const WalletRoleSchema = v.picklist(["PAYER", "RECIPIENT", "BOTH"]);

export const WalletStatusSchema = v.picklist(["ACTIVE", "PAUSED", "RETIRED"]);

const address = v.pipe(
  v.string(),
  v.trim(),
  v.check(
    (value) => isAddress(value, { strict: true }),
    "must be a valid EIP-55 checksummed address",
  ),
  v.transform((value) => value.toLowerCase()),
);

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

export const MAX_BATCH_DELETE = 100;

export const BatchDeleteWalletsSchema = v.object({
  ids: v.pipe(
    v.array(v.pipe(v.string(), v.uuid("must be a wallet id"))),
    v.minLength(1, "select at least one wallet"),
    v.maxLength(MAX_BATCH_DELETE),
    v.transform((ids) => [...new Set(ids)]),
  ),
});

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_OFFSET = 10_000;

const positiveInt = (fallback: number, max: number) =>
  v.optional(
    v.pipe(
      v.union([v.string(), v.number()]),
      v.transform(Number),
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(max),
    ),
    fallback,
  );

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
