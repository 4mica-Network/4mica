import type { PublicProfile } from "@/schema/profile";
import { safeBrandColor } from "@/utils/brandColor";

export interface ProfileGateRow {
  username: string | null;
  private: boolean;
  hidden: boolean;
  banned: boolean;
  deletedAt: Date | null;
}

export interface ProfileRow extends ProfileGateRow {
  id: string;
  name: string;
  bio: string | null;
  description: string | null;
  avatarUrl: string | null;
  verified: boolean;
  createdAt: Date;
  allowSEOIndexing: boolean;
  allowEmailVisibility: boolean;
  allowPhoneNumberVisibility: boolean;
  email: string | null;
  phoneNumber: string | null;
  allowCustomBrandColor: boolean;
  primaryBrandColor: string;
  secondaryBrandColor: string;
  disableBranding: boolean;
}

export const isProfileRenderable = (row: ProfileGateRow): boolean =>
  row.username !== null &&
  row.deletedAt === null &&
  row.banned === false &&
  row.hidden === false &&
  row.private === false;

export const toPublicProfile = (
  row: ProfileRow,
  { isOwner }: { isOwner: boolean },
): PublicProfile => ({
  username: row.username ?? "",
  name: row.name,
  bio: row.bio,
  description: row.description,
  avatarUrl: row.avatarUrl,
  verified: row.verified,
  memberSince: row.createdAt.toISOString(),

  email: row.allowEmailVisibility ? row.email : null,
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

  isOwner,
  isPublished: isProfileRenderable(row),
});
