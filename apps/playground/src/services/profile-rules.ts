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

export interface OrganizationProfileRow {
  id: string;
  handle: string | null;
  name: string;
  avatarUrl: string | null;
  personal: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  memberships: { user: ProfileRow }[];
}

export { isProfileRenderable };

export const toProfileRow = (org: OrganizationProfileRow): ProfileRow => {
  const owner = org.personal ? org.memberships[0]?.user : undefined;

  if (owner) {
    return {
      ...owner,
      id: org.id,
      username: org.handle,
      name: owner.name || org.name,
      avatarUrl: owner.avatarUrl ?? org.avatarUrl,
      deletedAt: org.deletedAt ?? owner.deletedAt,
    };
  }

  return {
    id: org.id,
    username: org.handle,
    name: org.name,
    bio: null,
    avatarUrl: org.avatarUrl,
    verified: false,
    createdAt: org.createdAt,
    private: org.personal,
    banned: false,
    deletedAt: org.deletedAt,
    allowSEOIndexing: false,
    allowEmailVisibility: false,
    allowPhoneNumberVisibility: false,
    email: null,
    emailVerified: false,
    phoneNumber: null,
    allowCustomBrandColor: false,
    primaryBrandColor: "",
    secondaryBrandColor: "",
    disableBranding: false,
    theme: "dark",
  };
};

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
