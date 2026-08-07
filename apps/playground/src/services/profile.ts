import "server-only";

import { cache } from "react";
import type { PublicProfile } from "@/schema/profile";
import { prisma } from "./db";
import { isProfileRenderable, toPublicProfile } from "./profile-rules";
import { getViewer } from "./viewer";

/**
 * Explicit `select`, never `include`, never a bare `findUnique` — mirroring the
 * USER_SELECT discipline in apps/be/src/controllers/me/repository.ts. This is
 * what makes clerkUserId, twoFactorEnabled, apiKeys, webhooks and business
 * structurally unreachable from a public page rather than merely un-rendered.
 *
 * Module-private on purpose: nothing outside this file gets the raw row.
 */
const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  bio: true,
  description: true,
  avatarUrl: true,
  verified: true,
  createdAt: true,
  // Gate flags — selected so the mapper can enforce them, never emitted.
  private: true,
  hidden: true,
  banned: true,
  deletedAt: true,
  // Visibility toggles and the values they guard.
  allowSEOIndexing: true,
  allowEmailVisibility: true,
  allowPhoneNumberVisibility: true,
  email: true,
  phoneNumber: true,
  allowCustomBrandColor: true,
  primaryBrandColor: true,
  secondaryBrandColor: true,
  disableBranding: true,
} as const;

export interface ProfileResult {
  /** Internal id, for owner-scoped follow-up queries. Never rendered. */
  ownerId: string;
  profile: PublicProfile;
}

/**
 * The only export a page may call.
 *
 * Wrapped in React `cache()` so the layout and the page share one query per
 * request. Returns null when the profile does not exist, or exists but is not
 * renderable and the viewer is not its owner — the caller turns that into a
 * 404. A "this profile is private" 200 would leak handle existence, which is
 * exactly what the `hidden` flag exists to prevent.
 */
export const getPublicProfile = cache(
  async (username: string): Promise<ProfileResult | null> => {
    const row = await prisma.user.findUnique({
      where: { username },
      select: PROFILE_SELECT,
    });

    if (!row) {
      return null;
    }

    const viewer = await getViewer();
    const isOwner = viewer?.id === row.id;

    if (!isProfileRenderable(row) && !isOwner) {
      return null;
    }

    return { ownerId: row.id, profile: toPublicProfile(row, { isOwner }) };
  },
);
