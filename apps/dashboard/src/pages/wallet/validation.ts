import { isAddress } from "viem";
import { z } from "zod";

/**
 * These mirror the server's valibot schemas rather than replacing them — the
 * API is still the authority, and its `issues[]` are what render under the
 * fields when the two disagree.
 */
export const LABEL_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 280;

/**
 * Checks the RAW value, never a lowercased one.
 *
 * viem's `isAddress` returns true early for any all-lowercase string, before it
 * runs the strict checksum test — so normalizing first would throw away the
 * very check that catches a mistyped address. The server does the same, in the
 * same order.
 */
const addressField = z
  .string()
  .trim()
  .min(1, "wallet.errors.addressRequired")
  .refine(
    // The `: boolean` annotation is load-bearing. TypeScript 5.5 infers a type
    // predicate for an arrow that just forwards to one, which would narrow this
    // field to `0x${string}` and make an empty default value a type error.
    (value): boolean => isAddress(value, { strict: true }),
    "wallet.errors.addressInvalid",
  );

export const walletDetailsSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "wallet.errors.labelRequired")
    .max(LABEL_MAX_LENGTH, "wallet.errors.labelTooLong"),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, "wallet.errors.descriptionTooLong")
    .optional()
    .or(z.literal("")),
});

export const createWalletSchema = walletDetailsSchema.extend({
  network: z.enum(["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"]),
  role: z.enum(["PAYER", "RECIPIENT", "BOTH"]),
  address: addressField,
});

export const editWalletSchema = walletDetailsSchema.extend({
  role: z.enum(["PAYER", "RECIPIENT", "BOTH"]),
  status: z.enum(["ACTIVE", "PAUSED", "RETIRED"]),
});

export type CreateWalletValues = z.infer<typeof createWalletSchema>;
export type EditWalletValues = z.infer<typeof editWalletSchema>;

/**
 * Which fields each wizard step owns, so Continue validates only those.
 *
 * Connect comes first: once the wallet is attached we know the address *and*
 * the chain it is on, which lets the details step arrive pre-filled instead of
 * asking the user to restate something their wallet already knows.
 */
export const CREATE_STEP_FIELDS = [
  ["address", "network"],
  ["label", "description", "role"],
] as const satisfies readonly (readonly (keyof CreateWalletValues)[])[];
