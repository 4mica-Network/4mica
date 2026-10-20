import "server-only";

import { cache } from "react";
import type { PublicProfile } from "@/schema/profile";
import { prisma } from "./db";
import { isProfileRenderable, toPublicProfile } from "./profile-rules";
import { getViewer } from "./viewer";

export const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  bio: true,
  description: true,
  avatarUrl: true,
  verified: true,
  createdAt: true,
  private: true,
  hidden: true,
  banned: true,
  deletedAt: true,
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
  ownerId: string;
  profile: PublicProfile;
}

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
