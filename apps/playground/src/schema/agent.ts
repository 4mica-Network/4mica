import * as v from "valibot";
import { PaymentNetworkSchema, VisibilitySchema } from "./params";

/**
 * The public agent DTO.
 *
 * `creditLimit` is deliberately absent: it is commercially sensitive.
 *
 * `walletAddress` is **owner-only** — it is populated when the viewer owns the
 * profile and `null` for everyone else, because a wallet address lets anyone
 * correlate a profile with its on-chain activity. The integration snippet falls
 * back to a placeholder when it is null. Making it unconditionally public needs
 * an explicit per-agent opt-in field, not a widened select.
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
  /** The chain this agent signs on. Public — it is not identifying. */
  network: PaymentNetworkSchema,
  /** Owner-only. `null` for every other viewer. */
  walletAddress: v.nullable(v.string()),
});

export type PublicAgent = v.InferOutput<typeof PublicAgentSchema>;
