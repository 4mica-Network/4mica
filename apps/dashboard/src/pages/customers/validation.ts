import { isEmail } from "@utils/validation";
import {
  addressOrBlank,
  currencyOrBlank,
  decimalAmount,
  orBlank,
  paymentNetwork,
} from "@utils/zod";
import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const EMAIL_MAX_LENGTH = 320;
export const DESCRIPTION_MAX_LENGTH = 280;
export const NOTES_MAX_LENGTH = 2000;

const optionalDecimal = orBlank(decimalAmount("customer.errors.limitInvalid"));

export const customerDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "customer.errors.nameRequired")
    .max(NAME_MAX_LENGTH, "customer.errors.nameTooLong"),
  email: orBlank(
    z
      .string()
      .trim()
      .pipe(
        z
          .email("customer.errors.emailInvalid")
          .max(EMAIL_MAX_LENGTH, "customer.errors.emailTooLong"),
      ),
  ),
  type: z.enum(["HUMAN", "ORGANIZATION", "AGENT", "WALLET"]),
  description: orBlank(
    z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH, "customer.errors.descriptionTooLong"),
  ),
  notes: orBlank(
    z.string().trim().max(NOTES_MAX_LENGTH, "customer.errors.notesTooLong"),
  ),
});

export const customerPaymentSchema = z
  .object({
    network: orBlank(paymentNetwork),
    address: addressOrBlank("customer.errors.addressInvalid"),
    dailyLimit: optionalDecimal,
    monthlyLimit: optionalDecimal,
    limitCurrency: currencyOrBlank("customer.errors.currencyInvalid"),
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
    network: orBlank(paymentNetwork),
    address: addressOrBlank("customer.errors.addressInvalid"),
    value: orBlank(z.string().trim()),
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
    (data) => data.type !== "EMAIL" || !data.value || isEmail(data.value),
    { message: "customer.errors.emailInvalid", path: ["value"] },
  );

export type IdentityValues = z.infer<typeof identitySchema>;
