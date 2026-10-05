import * as v from "valibot";
import { isAddress } from "viem";

export const PaymentNetworkSchema = v.picklist([
  "BASE",
  "BASE_SEPOLIA",
  "ETHEREUM_SEPOLIA",
]);

export const PublicVisibilitySchema = v.picklist([
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
]);

export const HttpMethodSchema = v.picklist([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export const address = v.pipe(
  v.string(),
  v.trim(),
  v.check(
    (value) => isAddress(value, { strict: true }),
    "must be a valid EIP-55 checksummed address",
  ),
  v.transform((value) => value.toLowerCase()),
);

export const decimalAmount = v.pipe(
  v.string(),
  v.trim(),
  v.regex(
    /^(?!0\d)\d{1,20}(\.\d{1,18})?$/,
    "must be a decimal amount, as a string",
  ),
);

export const positiveDecimalAmount = v.pipe(
  decimalAmount,
  v.check((value) => Number(value) > 0, "must be greater than zero"),
);

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_OFFSET = 10_000;
export const MAX_BATCH_DELETE = 100;

export const positiveInt = (fallback: number, max: number) =>
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

export const batchDeleteSchema = (what: string) =>
  v.object({
    ids: v.pipe(
      v.array(v.pipe(v.string(), v.uuid(`must be ${what}`))),
      v.minLength(1, "select at least one"),
      v.maxLength(MAX_BATCH_DELETE),
      v.transform((ids) => [...new Set(ids)]),
    ),
  });
