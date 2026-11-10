import * as v from "valibot";

const PublicProfileSchema = v.object({
  username: v.string(),
  name: v.string(),
  bio: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  verified: v.boolean(),
  memberSince: v.string(),
  email: v.nullable(v.string()),
  emailVerified: v.boolean(),
  phoneNumber: v.nullable(v.string()),
  primaryBrandColor: v.nullable(v.string()),
  secondaryBrandColor: v.nullable(v.string()),
  allowSEOIndexing: v.boolean(),
  showBranding: v.boolean(),
  theme: v.picklist(["dark", "light", "system"]),
  isOwner: v.boolean(),
  isPublished: v.boolean(),
});

export type PublicProfile = v.InferOutput<typeof PublicProfileSchema>;
