import * as v from "valibot";
import { isAddress } from "viem";

/**
 * Networks, as a literal union rather than the generated Prisma enum, so the
 * DTO layer stays free of Prisma types (the convention apps/playground follows
 * in src/schema/params.ts).
 */
export const PaymentNetworkSchema = v.picklist([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
]);

export const WalletRoleSchema = v.picklist(["PAYER", "RECIPIENT", "BOTH"]);

export const WalletStatusSchema = v.picklist(["ACTIVE", "PAUSED", "RETIRED"]);

/**
 * Validate the RAW input, then normalize — never the other way round.
 *
 * viem's `isAddress` short-circuits with `if (address.toLowerCase() === address)
 * return true` *before* it runs the strict checksum test, so lowercasing first
 * would silently accept a mistyped mixed-case address that fails EIP-55. The
 * whole point of the checksum is to catch that typo before it becomes a payout
 * address.
 */
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

/**
 * `address` and `network` are absent by construction: re-pointing a wallet at a
 * different address would carry the old proof across to an unproven one. That
 * is a new wallet, not an edit.
 */
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
    v.array(
      // Not cosmetic: a non-uuid inside `{ in: ids }` makes Prisma throw P2023,
      // which would surface as a 500 rather than a validation error.
      v.pipe(v.string(), v.uuid("must be a wallet id")),
    ),
    v.minLength(1, "select at least one wallet"),
    v.maxLength(MAX_BATCH_DELETE),
    v.transform((ids) => [...new Set(ids)]),
  ),
});

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
/** Caps how deep an offset scan can go, so `?page=1e9` cannot tie up Postgres. */
export const MAX_OFFSET = 10_000;

/**
 * Query params arrive as strings. The route declares a matching JSON Schema so
 * ajv's `coerceTypes` handles the common case, but this parses defensively on
 * its own so the handler is correct regardless of how it is called.
 */
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
