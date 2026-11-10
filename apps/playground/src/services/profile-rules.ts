import { isProfileRenderable } from "@4mica/rules";
import { toThemePreference } from "@/lib/theme";
import type { PublicProfile } from "@/schema/profile";
import { safeBrandColor } from "@/utils/brandColor";

export interface ProfileGateRow {
  username: string | null;
  private: boolean;
  banned: boolean;
  deletedAt: Date | null;
}

export interface ProfileRow extends ProfileGateRow {
  id: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  verified: boolean;
  createdAt: Date;
  allowSEOIndexing: boolean;
  allowEmailVisibility: boolean;
  allowPhoneNumberVisibility: boolean;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  allowCustomBrandColor: boolean;
  primaryBrandColor: string;
  secondaryBrandColor: string;
  disableBranding: boolean;
  theme: string;
}

export { isProfileRenderable };

export const toPublicProfile = (
  row: ProfileRow,
  { isOwner }: { isOwner: boolean },
): PublicProfile => ({
  username: row.username ?? "",
  name: row.name,
  bio: row.bio,
  avatarUrl: row.avatarUrl,
  verified: row.verified,
  memberSince: row.createdAt.toISOString(),

  email: row.allowEmailVisibility && row.emailVerified ? row.email : null,
  emailVerified: row.emailVerified,
  phoneNumber: row.allowPhoneNumberVisibility ? row.phoneNumber : null,

  primaryBrandColor: safeBrandColor(
    row.primaryBrandColor,
    row.allowCustomBrandColor,
  ),
  secondaryBrandColor: safeBrandColor(
    row.secondaryBrandColor,
    row.allowCustomBrandColor,
  ),

  allowSEOIndexing: row.allowSEOIndexing,
  showBranding: !row.disableBranding,
  theme: toThemePreference(row.theme),

  isOwner,
  isPublished: isProfileRenderable(row),
});
