import * as v from "valibot";
import {
  HttpMethodSchema,
  PaymentNetworkSchema,
  VisibilitySchema,
} from "./params";

/** One priced route on a listing. Drives the method and path in a snippet. */
const PublicApiEndpointSchema = v.object({
  id: v.string(),
  method: HttpMethodSchema,
  path: v.string(),
  summary: v.nullable(v.string()),
  /** Serialised as a string — Prisma Decimal does not survive the RSC boundary. */
  priceAmount: v.nullable(v.string()),
});

export type PublicApiEndpoint = v.InferOutput<typeof PublicApiEndpointSchema>;

/**
 * The public API-listing DTO. `ownerId` is omitted so a listing can never be
 * used to correlate two profiles.
 *
 * The payment fields (`network`, `payToAddress`, `assetAddress`, `priceAmount`,
 * `x402Endpoint`) are intentionally public: the x402 handshake advertises all
 * of them in the `402 Payment Required` body to any anonymous caller, so
 * withholding them here would buy no privacy while making the integration
 * snippets untruthful.
 */
const PublicApiListingSchema = v.object({
  /** The row id. Needed by the owner's visibility toggle; opaque otherwise. */
  id: v.string(),
  ref: v.string(),
  name: v.string(),
  summary: v.nullable(v.string()),
  description: v.nullable(v.string()),
  baseUrl: v.nullable(v.string()),
  docsUrl: v.nullable(v.string()),
  category: v.nullable(v.string()),
  tags: v.array(v.string()),
  priceLabel: v.nullable(v.string()),
  visibility: VisibilitySchema,
  publishedAt: v.nullable(v.string()),
  network: v.nullable(PaymentNetworkSchema),
  payToAddress: v.nullable(v.string()),
  assetAddress: v.nullable(v.string()),
  priceAmount: v.nullable(v.string()),
  priceCurrency: v.nullable(v.string()),
  x402Endpoint: v.nullable(v.string()),
  endpoints: v.array(PublicApiEndpointSchema),
});

export type PublicApiListing = v.InferOutput<typeof PublicApiListingSchema>;
