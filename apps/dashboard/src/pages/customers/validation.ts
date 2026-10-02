import { isAddress } from "viem";
import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 320;
export const DESCRIPTION_MAX_LENGTH = 280;
export const NOTES_MAX_LENGTH = 2000;

const optionalDecimal = z
  .string()
  .trim()
  .regex(/^(?!0\d)\d{1,20}(\.\d{1,18})?$/, "customer.errors.limitInvalid")
  .optional()
  .or(z.literal(""));

export const customerDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "customer.errors.nameRequired")
    .max(NAME_MAX_LENGTH, "customer.errors.nameTooLong"),
  email: z
    .string()
    .trim()
    .email("customer.errors.emailInvalid")
    .max(EMAIL_MAX_LENGTH, "customer.errors.emailTooLong")
    .optional()
    .or(z.literal("")),
  type: z.enum(["HUMAN", "ORGANIZATION", "AGENT", "WALLET"]),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, "customer.errors.descriptionTooLong")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(NOTES_MAX_LENGTH, "customer.errors.notesTooLong")
    .optional()
    .or(z.literal("")),
});

export const customerPaymentSchema = z
  .object({
    network: z
      .enum(["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"])
      .optional()
      .or(z.literal("")),
    address: z
      .string()
      .trim()
      .refine(
        (value): boolean => value === "" || isAddress(value, { strict: true }),
        "customer.errors.addressInvalid",
      )
      .optional()
      .or(z.literal("")),
    dailyLimit: optionalDecimal,
    monthlyLimit: optionalDecimal,
    limitCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,16}$/, "customer.errors.currencyInvalid")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => !(data.address && !data.network), {
    message: "customer.errors.networkRequired",
    path: ["network"],
  })
  .refine((data) => !(data.network && !data.address), {
    message: "customer.errors.addressRequired",
    path: ["address"],
  });

export const createCustomerSchema = customerDetailsSchema.and(
  customerPaymentSchema,
);

export type CustomerValues = z.infer<typeof createCustomerSchema>;

export const CREATE_STEP_FIELDS = [
  ["name", "email", "type", "description"],
  ["network", "address", "dailyLimit", "monthlyLimit", "limitCurrency"],
] as const satisfies readonly (readonly (keyof CustomerValues)[])[];

export const identitySchema = z
  .object({
    type: z.enum(["WALLET", "EMAIL", "EXTERNAL"]),
    network: z
      .enum(["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"])
      .optional()
      .or(z.literal("")),
    address: z
      .string()
      .trim()
      .refine(
        (value): boolean => value === "" || isAddress(value, { strict: true }),
        "customer.errors.addressInvalid",
      )
      .optional()
      .or(z.literal("")),
    value: z.string().trim().optional().or(z.literal("")),
  })
  .refine((data) => data.type !== "WALLET" || Boolean(data.network), {
    message: "customer.errors.networkRequired",
    path: ["network"],
  })
  .refine((data) => data.type !== "WALLET" || Boolean(data.address), {
    message: "customer.errors.addressRequired",
    path: ["address"],
  })
  .refine((data) => data.type === "WALLET" || Boolean(data.value), {
    message: "customer.errors.valueRequired",
    path: ["value"],
  })
  .refine(
    (data) =>
      data.type !== "EMAIL" ||
      !data.value ||
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.value),
    { message: "customer.errors.emailInvalid", path: ["value"] },
  );

export type IdentityValues = z.infer<typeof identitySchema>;

export const blankToNull = (value: string | undefined | null): string | null =>
  value == null || value.trim() === "" ? null : value.trim();
