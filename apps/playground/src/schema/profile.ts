import * as v from "valibot";

const PublicProfileSchema = v.object({
  username: v.string(),
  name: v.string(),
  bio: v.nullable(v.string()),
  description: v.nullable(v.string()),
  avatarUrl: v.nullable(v.string()),
  verified: v.boolean(),
  memberSince: v.string(),
  email: v.nullable(v.string()),
  phoneNumber: v.nullable(v.string()),
  primaryBrandColor: v.nullable(v.string()),
  secondaryBrandColor: v.nullable(v.string()),
  allowSEOIndexing: v.boolean(),
  showBranding: v.boolean(),
  isOwner: v.boolean(),
  isPublished: v.boolean(),
});

export type PublicProfile = v.InferOutput<typeof PublicProfileSchema>;
