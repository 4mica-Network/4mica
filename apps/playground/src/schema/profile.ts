import * as v from "valibot";

/**
 * The public profile DTO. This is the contract the service-layer mapper must
 * satisfy — note what is absent: clerkUserId, the gate flags (private, hidden,
 * banned, deletedAt), and every setting that is not about presentation.
 */
const PublicProfileSchema = v.object({
  username: v.string(),
  name: v.string(),
  bio: v.nullable(v.string()),
  description: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  verified: v.boolean(),
  memberSince: v.string(),

  /** Null unless the corresponding visibility flag is on. */
  email: v.nullable(v.string()),
  phoneNumber: v.nullable(v.string()),

  /** Null unless allowCustomBrandColor is on AND the value is valid hex. */
  primaryBrandColor: v.nullable(v.string()),
  secondaryBrandColor: v.nullable(v.string()),

  /** Drives robots metadata; never rendered. */
  allowSEOIndexing: v.boolean(),
  showBranding: v.boolean(),

  /** True only when the signed-in viewer owns this profile. */
  isOwner: v.boolean(),
  /** True when the profile is live to the public; false means owner-preview. */
  isPublished: v.boolean(),
});

export type PublicProfile = v.InferOutput<typeof PublicProfileSchema>;
