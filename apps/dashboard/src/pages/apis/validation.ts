import { isSingleLine } from "@4mica/rules";
import { PUBLIC_VISIBILITY } from "@stores/shared/type";
import {
  addressOrBlank,
  currencyOrBlank,
  httpsUrl,
  orBlank,
  positiveAmount,
  slugOrBlank,
} from "@utils/zod";
import { z } from "zod";

export const NAME_MAX_LENGTH = 120;
export const SUMMARY_MAX_LENGTH = 280;
export const DESCRIPTION_MAX_LENGTH = 10_000;
export const MAX_TAGS = 10;
export const MAX_ENDPOINTS = 50;

const NS = "apiListing.errors";
const optionalHttpsUrl = orBlank(httpsUrl(NS));

export const apiListingDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "apiListing.errors.nameRequired")
    .max(NAME_MAX_LENGTH, "apiListing.errors.nameTooLong")
    .refine(isSingleLine, "validation.singleLine"),
  slug: slugOrBlank(NS),
  summary: orBlank(
    z
      .string()
      .trim()
      .max(SUMMARY_MAX_LENGTH, "apiListing.errors.summaryTooLong")
      .refine(isSingleLine, "validation.singleLine"),
  ),
  description: orBlank(
    z
      .string()
      .trim()
      .max(DESCRIPTION_MAX_LENGTH, "apiListing.errors.descriptionTooLong"),
  ),
});

export const apiListingPaymentSchema = z.object({
  walletId: orBlank(z.string()),
  assetAddress: addressOrBlank(`${NS}.assetInvalid`),
  priceAmount: orBlank(positiveAmount(NS)),
  priceCurrency: currencyOrBlank("apiListing.errors.currencyInvalid"),
  priceLabel: orBlank(
    z
      .string()
      .trim()
      .max(64, "apiListing.errors.priceLabelTooLong")
      .refine(isSingleLine, "validation.singleLine"),
  ),
});

export const apiListingPublishingSchema = z.object({
  url: optionalHttpsUrl,
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  docsUrl: optionalHttpsUrl,
  x402Endpoint: optionalHttpsUrl,
  category: orBlank(
    z
      .string()
      .trim()
      .max(64, "apiListing.errors.categoryTooLong")
      .refine(isSingleLine, "validation.singleLine"),
  ),
  tags: z
    .array(z.string().trim().min(1).max(32))
    .max(MAX_TAGS, "apiListing.errors.tooManyTags"),
  visibility: z.enum(PUBLIC_VISIBILITY),
});

export const createApiListingSchema = apiListingDetailsSchema
  .merge(apiListingPaymentSchema)
  .merge(apiListingPublishingSchema);

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
