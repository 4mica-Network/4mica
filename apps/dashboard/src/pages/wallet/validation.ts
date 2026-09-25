import { isAddress } from "viem";
import { z } from "zod";

export const LABEL_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 280;

const addressField = z
  .string()
  .trim()
  .min(1, "wallet.errors.addressRequired")
  .refine(
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

export const CREATE_STEP_FIELDS = [
  ["address", "network"],
  ["label", "description", "role"],
] as const satisfies readonly (readonly (keyof CreateWalletValues)[])[];
