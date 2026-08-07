import * as v from "valibot";
import { VisibilitySchema } from "./params";

/**
 * The public API-listing DTO. `ownerId` is omitted so a listing can never be
 * used to correlate two profiles.
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
});

export type PublicApiListing = v.InferOutput<typeof PublicApiListingSchema>;
