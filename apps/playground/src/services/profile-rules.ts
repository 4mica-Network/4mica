import type { PublicProfile } from "@/schema/profile";
import { safeBrandColor } from "@/utils/brandColor";

/**
 * The visibility gate and the row -> DTO mapper.
 *
 * Deliberately split out of profile.ts: that module imports `server-only`,
 * Prisma and Clerk, so anything living there drags the whole server graph into
 * a test. These two functions are the security-critical part of the feature and
 * they are pure, so they get a module with no imports beyond types and one
 * validator — which is what makes the unit tests fast and DB-free.
 */

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

/**
 * The single visibility rule.
 *
 * Note `User.private` defaults to `true`, so a freshly created user is NOT
 * publicly renderable until they opt in. That is intentional, and it is why a
 * brand-new account sees an owner-preview banner rather than a live page.
 */
export const isProfileRenderable = (row: ProfileGateRow): boolean =>
  row.username !== null &&
  row.deletedAt === null &&
  row.banned === false &&
  row.hidden === false &&
  row.private === false;

/**
 * Row -> DTO. Every field the user can hide is nulled here rather than in the
 * query, so the gate flags are available to decide and the decision lives in
 * one testable place.
 */
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
