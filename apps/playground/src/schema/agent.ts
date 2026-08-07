import * as v from "valibot";
import { VisibilitySchema } from "./params";

/**
 * The public agent DTO.
 *
 * `walletAddress` and `creditLimit` are deliberately absent: a credit limit is
 * commercially sensitive and a wallet address is a doxxing / on-chain
 * correlation vector. Adding either needs an explicit per-agent opt-in field,
 * not a widened select.
 */
const PublicAgentSchema = v.object({
  /** The row id. Needed by the owner's visibility toggle; opaque otherwise. */
  id: v.string(),
  /** Slug when the owner set one, otherwise the uuid. Always URL-safe. */
  ref: v.string(),
  name: v.string(),
  headline: v.nullable(v.string()),
  description: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  status: v.picklist(["PENDING", "ACTIVE", "SUSPENDED"] as const),
  visibility: VisibilitySchema,
  createdAt: v.string(),
});

export type PublicAgent = v.InferOutput<typeof PublicAgentSchema>;
