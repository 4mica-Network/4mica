import {
  CURRENCY_CODE_PATTERN,
  DECIMAL_AMOUNT_PATTERN,
  isHttpsUrl,
  isUuidShaped,
  isWebUrl,
  PAYMENT_NETWORK_IDS,
  SLUG_MAX_LENGTH,
} from "@4mica/rules";
import { USERNAME_PATTERN } from "@4mica/url";
import { isAddress } from "viem";
import { z } from "zod";

export const URL_MAX_LENGTH = 2048;

export const orBlank = <T extends z.ZodType>(schema: T) =>
  schema.optional().or(z.literal(""));

export const decimalAmount = (message: string) =>
  z.string().trim().regex(DECIMAL_AMOUNT_PATTERN, message);

export const positiveAmount = (ns: string) =>
  decimalAmount(`${ns}.priceInvalid`).refine(
    (value) => Number(value) > 0,
    `${ns}.pricePositive`,
  );

export const httpsUrl = (ns: string) =>
  z
    .string()
    .trim()
    .refine(isWebUrl, `${ns}.urlInvalid`)
    .max(URL_MAX_LENGTH, `${ns}.urlTooLong`)
    .refine(isHttpsUrl, `${ns}.urlHttps`);

export const addressOrBlank = (message: string) =>
  orBlank(
    z
      .string()
      .trim()
      .refine(
        (value): boolean => value === "" || isAddress(value, { strict: true }),
        message,
      ),
  );

export const slugOrBlank = (ns: string) =>
  orBlank(
    z
      .string()
      .trim()
      .toLowerCase()
      .max(SLUG_MAX_LENGTH, `${ns}.slugTooLong`)
      .refine(
        (value) => value === "" || USERNAME_PATTERN.test(value),
        `${ns}.slugInvalid`,
      )
      .refine((value) => !isUuidShaped(value), `${ns}.slugIdShaped`),
  );

export const paymentNetwork = z.enum(PAYMENT_NETWORK_IDS);

export const currencyOrBlank = (message: string) =>
  orBlank(
    z.string().trim().toUpperCase().regex(CURRENCY_CODE_PATTERN, message),
  );
