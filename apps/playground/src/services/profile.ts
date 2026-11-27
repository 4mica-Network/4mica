import "server-only";

import { cache } from "react";
import { profileTag } from "@/actions/shared";
import type { PublicProfile } from "@/schema/profile";
import { cachedPublic } from "./cache";
import { prisma } from "./db";
import { isProfileRenderable, toPublicProfile } from "./profile-rules";
import { getViewer } from "./viewer";

export const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  bio: true,
  avatarUrl: true,
  verified: true,
  createdAt: true,
  private: true,
  banned: true,
  deletedAt: true,
  allowSEOIndexing: true,
  allowEmailVisibility: true,
  allowPhoneNumberVisibility: true,
  email: true,
  emailVerified: true,
  phoneNumber: true,
  allowCustomBrandColor: true,
  primaryBrandColor: true,
  secondaryBrandColor: true,
  disableBranding: true,
  theme: true,
} as const;

export interface ProfileResult {
  ownerId: string;
  profile: PublicProfile;
}

interface PublicProfileGate {
  ownerId: string;
  renderable: boolean;
  profile: PublicProfile;
}

const loadPublicProfileGate = cachedPublic(
  "profile-gate",
  async (username: string): Promise<PublicProfileGate | null> => {
    const row = await prisma.user.findUnique({
      where: { username },
      select: PROFILE_SELECT,
    });

    return row
      ? {
          ownerId: row.id,
          renderable: isProfileRenderable(row),
          profile: toPublicProfile(row, { isOwner: false }),
        }
      : null;
  },
  (username) => [profileTag(username)],
);

const loadOwnerProfile = async (
  username: string,
): Promise<ProfileResult | null> => {
  const row = await prisma.user.findUnique({
    where: { username },
    select: PROFILE_SELECT,
  });

  return row
    ? { ownerId: row.id, profile: toPublicProfile(row, { isOwner: true }) }
    : null;
};

export const getPublicProfile = cache(
  async (username: string): Promise<ProfileResult | null> => {
    const [gate, viewer] = await Promise.all([
      loadPublicProfileGate(username),
      getViewer(),
    ]);

    if (!gate) {
      return null;
    }

    if (viewer?.id === gate.ownerId) {
      return loadOwnerProfile(username);
    }

    return gate.renderable
      ? { ownerId: gate.ownerId, profile: gate.profile }
      : null;
  },
);

export const getAnonymousProfile = cache(
  async (username: string): Promise<ProfileResult | null> => {
    const gate = await loadPublicProfileGate(username);

    return gate?.renderable
      ? { ownerId: gate.ownerId, profile: gate.profile }
      : null;
  },
);
