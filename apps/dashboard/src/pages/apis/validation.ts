import { USERNAME_PATTERN } from "@4mica/url";
import { isSingleLine, isUuidShaped, isWebUrl } from "@utils/validation";
import { isAddress } from "viem";
import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const SUMMARY_MAX_LENGTH = 280;
export const DESCRIPTION_MAX_LENGTH = 10_000;
export const SLUG_MAX_LENGTH = 64;
export const MAX_TAGS = 10;
export const MAX_ENDPOINTS = 50;

const decimalAmount = z
  .string()
  .trim()
  .regex(/^(?!0\d)\d{1,20}(\.\d{1,18})?$/, "apiListing.errors.priceInvalid")
  .refine((value) => Number(value) > 0, "apiListing.errors.pricePositive");

const optionalDecimal = decimalAmount.optional().or(z.literal(""));

const httpsUrl = z
  .string()
  .trim()
  .refine(isWebUrl, "apiListing.errors.urlInvalid")
  .max(2048, "apiListing.errors.urlTooLong")
  .refine(
    (value) => value.startsWith("https://"),
    "apiListing.errors.urlHttps",
  );

const optionalHttpsUrl = httpsUrl.optional().or(z.literal(""));

const optionalAddress = z
  .string()
  .trim()
  .refine(
    (value): boolean => value === "" || isAddress(value, { strict: true }),
    "apiListing.errors.assetInvalid",
  )
  .optional()
  .or(z.literal(""));

const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .max(SLUG_MAX_LENGTH, "apiListing.errors.slugTooLong")
  .refine(
    (value) => value === "" || USERNAME_PATTERN.test(value),
    "apiListing.errors.slugInvalid",
  )
  .refine((value) => !isUuidShaped(value), "apiListing.errors.slugIdShaped")
  .optional()
  .or(z.literal(""));

export const apiListingDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "apiListing.errors.nameRequired")
    .max(NAME_MAX_LENGTH, "apiListing.errors.nameTooLong")
    .refine(isSingleLine, "validation.singleLine"),
  slug: slugField,
  summary: z
    .string()
    .trim()
    .max(SUMMARY_MAX_LENGTH, "apiListing.errors.summaryTooLong")
    .refine(isSingleLine, "validation.singleLine")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX_LENGTH, "apiListing.errors.descriptionTooLong")
    .optional()
    .or(z.literal("")),
});

export const apiListingPaymentSchema = z.object({
  walletId: z.string().optional().or(z.literal("")),
  assetAddress: optionalAddress,
  priceAmount: optionalDecimal,
  priceCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,16}$/, "apiListing.errors.currencyInvalid")
    .optional()
    .or(z.literal("")),
  priceLabel: z
    .string()
    .trim()
    .max(64, "apiListing.errors.priceLabelTooLong")
    .refine(isSingleLine, "validation.singleLine")
    .optional()
    .or(z.literal("")),
});

export const apiListingPublishingSchema = z.object({
  url: optionalHttpsUrl,
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  docsUrl: optionalHttpsUrl,
  x402Endpoint: optionalHttpsUrl,
  category: z
    .string()
    .trim()
    .max(64, "apiListing.errors.categoryTooLong")
    .refine(isSingleLine, "validation.singleLine")
    .optional()
    .or(z.literal("")),
  tags: z
    .array(z.string().trim().min(1).max(32))
    .max(MAX_TAGS, "apiListing.errors.tooManyTags"),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]),
});

export const createApiListingSchema = apiListingDetailsSchema
  .merge(apiListingPaymentSchema)
  .merge(apiListingPublishingSchema);

export const editApiListingSchema = createApiListingSchema;

export type ApiListingValues = z.infer<typeof createApiListingSchema>;

export const CREATE_STEP_FIELDS = [
  ["name", "slug", "summary", "description"],
  ["walletId", "assetAddress", "priceAmount", "priceCurrency", "priceLabel"],
  [
    "method",
    "url",
    "docsUrl",
    "x402Endpoint",
    "category",
    "tags",
    "visibility",
  ],
] as const satisfies readonly (readonly (keyof ApiListingValues)[])[];

export const blankToNull = (value: string | undefined | null): string | null =>
  value == null || value.trim() === "" ? null : value.trim();
