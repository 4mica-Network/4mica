import { USERNAME_PATTERN } from "@4mica/url";
import {
  address,
  batchDeleteSchema,
  DEFAULT_PAGE_SIZE,
  HttpMethodSchema,
  httpsUrl,
  MAX_PAGE_SIZE,
  PaymentNetworkSchema,
  PublicVisibilitySchema,
  positiveDecimalAmount,
  positiveInt,
  singleLine,
} from "@controllers/schema-primitives";
import { isUuidShaped, SLUG_MAX_LENGTH, SLUG_MESSAGE } from "@utils/slug";
import * as v from "valibot";

const slug = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.minLength(1),
  v.maxLength(SLUG_MAX_LENGTH),
  v.regex(USERNAME_PATTERN, SLUG_MESSAGE),
  v.check((value) => !isUuidShaped(value), "must not look like an id"),
);

const name = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(120),
  singleLine,
);
const summary = v.pipe(v.string(), v.trim(), v.maxLength(280), singleLine);
const description = v.pipe(v.string(), v.trim(), v.maxLength(10_000));
const category = v.pipe(v.string(), v.trim(), v.maxLength(64), singleLine);
const priceLabel = v.pipe(v.string(), v.trim(), v.maxLength(64), singleLine);

const url = httpsUrl(2048);

const priceCurrency = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.regex(/^[A-Z0-9]{2,16}$/, "must be a currency code"),
);

const tags = v.pipe(
  v.array(
    v.pipe(
      v.string(),
      v.trim(),
      v.toLowerCase(),
      v.minLength(1),
      v.maxLength(32),
      singleLine,
    ),
  ),
  v.maxLength(10),
  v.transform((values) => [...new Set(values)]),
);

const walletId = v.pipe(v.string(), v.uuid("must be a wallet id"));

export const CreateApiListingSchema = v.object({
  name,
  slug: v.optional(slug),
  summary: v.optional(v.nullable(summary)),
  description: v.optional(v.nullable(description)),
  url: v.optional(v.nullable(url)),
  method: v.optional(HttpMethodSchema, "GET"),
  docsUrl: v.optional(v.nullable(url)),
  category: v.optional(v.nullable(category)),
  tags: v.optional(tags, []),
  priceLabel: v.optional(v.nullable(priceLabel)),
  visibility: v.optional(PublicVisibilitySchema, "PRIVATE"),

  walletId: v.optional(v.nullable(walletId)),
  assetAddress: v.optional(v.nullable(address)),
  priceAmount: v.optional(v.nullable(positiveDecimalAmount)),
  priceCurrency: v.optional(v.nullable(priceCurrency)),
  x402Endpoint: v.optional(v.nullable(url)),
});

export const UpdateApiListingSchema = v.partial(
  v.object({
    name,
    slug,
    summary: v.nullable(summary),
    description: v.nullable(description),
    url: v.nullable(url),
    method: HttpMethodSchema,
    docsUrl: v.nullable(url),
    category: v.nullable(category),
    tags,
    priceLabel: v.nullable(priceLabel),
    visibility: PublicVisibilitySchema,

    walletId: v.nullable(walletId),
    assetAddress: v.nullable(address),
    priceAmount: v.nullable(positiveDecimalAmount),
    priceCurrency: v.nullable(priceCurrency),
    x402Endpoint: v.nullable(url),
  }),
);

export const BatchDeleteApiListingsSchema = batchDeleteSchema("a listing id");

export const ListApiListingsQuerySchema = v.object({
  page: positiveInt(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInt(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  visibility: v.optional(PublicVisibilitySchema),
  network: v.optional(PaymentNetworkSchema),
  sort: v.optional(
    v.picklist([
      "createdAt",
      "-createdAt",
      "updatedAt",
      "-updatedAt",
      "name",
      "-name",
    ]),
    "-createdAt",
  ),
});

export type CreateApiListingInput = v.InferOutput<
  typeof CreateApiListingSchema
>;
export type UpdateApiListingInput = v.InferOutput<
  typeof UpdateApiListingSchema
>;
export type ListApiListingsQuery = v.InferOutput<
  typeof ListApiListingsQuerySchema
>;
