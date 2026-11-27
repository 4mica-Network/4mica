import "server-only";

import { cache } from "react";
import { profileTag } from "@/actions/shared";
import type { PublicProfile } from "@/schema/profile";
import { cachedPublic } from "./cache";
import { type Prisma, prisma } from "./db";
import {
  isProfileRenderable,
  toProfileRow,
  toPublicProfile,
} from "./profile-rules";
import { getViewer, type Viewer } from "./viewer";

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
} as const satisfies Prisma.UserSelect;

export const ORGANIZATION_PROFILE_SELECT = {
  id: true,
  handle: true,
  name: true,
  avatarUrl: true,
  personal: true,
  createdAt: true,
  deletedAt: true,
  memberships: {
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { user: { select: PROFILE_SELECT } },
  },
} as const satisfies Prisma.OrganizationSelect;

export interface ProfileResult {
  organizationId: string;
  profile: PublicProfile;
}

interface PublicProfileGate {
  organizationId: string;
  renderable: boolean;
  profile: PublicProfile;
}

const findOrganization = (handle: string) =>
  prisma.organization.findFirst({
    where: { handle, deletedAt: null },
    select: ORGANIZATION_PROFILE_SELECT,
  });

const loadPublicProfileGate = cachedPublic(
  "profile-gate",
  async (handle: string): Promise<PublicProfileGate | null> => {
    const org = await findOrganization(handle);

    if (!org) {
      return null;
    }

    const row = toProfileRow(org);

    return {
      organizationId: org.id,
      renderable: isProfileRenderable(row),
      profile: toPublicProfile(row, { isOwner: false }),
    };
  },
  (handle) => [profileTag(handle)],
);

const loadMemberProfile = async (
  handle: string,
): Promise<ProfileResult | null> => {
  const org = await findOrganization(handle);

  return org
    ? {
        organizationId: org.id,
        profile: toPublicProfile(toProfileRow(org), { isOwner: true }),
      }
    : null;
};

export const isMemberOf = (
  viewer: Viewer | null,
  organizationId: string,
): boolean => viewer?.organizationIds.includes(organizationId) ?? false;

export const getPublicProfile = cache(
  async (handle: string): Promise<ProfileResult | null> => {
    const [gate, viewer] = await Promise.all([
      loadPublicProfileGate(handle),
      getViewer(),
    ]);

    if (!gate) {
      return null;
    }

    if (isMemberOf(viewer, gate.organizationId)) {
      return loadMemberProfile(handle);
    }

    return gate.renderable
      ? { organizationId: gate.organizationId, profile: gate.profile }
      : null;
  },
);

export const getAnonymousProfile = cache(
  async (handle: string): Promise<ProfileResult | null> => {
    const gate = await loadPublicProfileGate(handle);

    return gate?.renderable
      ? { organizationId: gate.organizationId, profile: gate.profile }
      : null;
  },
);
