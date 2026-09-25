import * as v from "valibot";
import {
  HttpMethodSchema,
  PaymentNetworkSchema,
  VisibilitySchema,
} from "./params";

const PublicApiEndpointSchema = v.object({
  id: v.string(),
  method: HttpMethodSchema,
  path: v.string(),
  summary: v.nullable(v.string()),
  priceAmount: v.nullable(v.string()),
});

export type PublicApiEndpoint = v.InferOutput<typeof PublicApiEndpointSchema>;

const PublicApiListingSchema = v.object({
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
