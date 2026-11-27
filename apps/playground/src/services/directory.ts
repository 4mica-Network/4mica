import "server-only";

import { cache } from "react";
import {
  buildAgentDescriptor,
  buildApiListingDescriptor,
  type ResourceDescriptor,
} from "@/lib/descriptor";
import { AGENT_PUBLIC_SELECT, toPublicAgent } from "./agents";
import { API_LISTING_PUBLIC_SELECT, toPublicApiListing } from "./api-listings";
import { type Prisma, prisma } from "./db";
import { ORGANIZATION_PROFILE_SELECT } from "./profile";
import {
  isProfileRenderable,
  type OrganizationProfileRow,
  toProfileRow,
  toPublicProfile,
} from "./profile-rules";

const RENDERABLE_USER = {
  deletedAt: null,
  banned: false,
  private: false,
} as const;

const RENDERABLE_ORGANIZATION = {
  handle: { not: null },
  deletedAt: null,
  OR: [
    { personal: false },
    { memberships: { some: { role: "OWNER", user: RENDERABLE_USER } } },
  ],
} satisfies Prisma.OrganizationWhereInput;

const INDEXABLE_ORGANIZATION = {
  handle: { not: null },
  deletedAt: null,
  personal: true,
  memberships: {
    some: {
      role: "OWNER",
      user: { ...RENDERABLE_USER, allowSEOIndexing: true },
    },
  },
} satisfies Prisma.OrganizationWhereInput;

const renderableOwner = (org: OrganizationProfileRow | null) => {
  if (!org) {
    return null;
  }

  const row = toProfileRow(org);

  return isProfileRenderable(row) ? row : null;
};

const DIRECTORY_LIMIT = 500;

export interface DirectoryEntry {
  descriptor: ResourceDescriptor;
  updatedAt: Date;
  indexable: boolean;
}

export const listDirectory = cache(async (): Promise<DirectoryEntry[]> => {
  const [listings, agents] = await Promise.all([
    prisma.apiListing.findMany({
      where: {
        deletedAt: null,
        visibility: "PUBLIC",
        organization: RENDERABLE_ORGANIZATION,
      },
      select: {
        ...API_LISTING_PUBLIC_SELECT,
        updatedAt: true,
        organization: { select: ORGANIZATION_PROFILE_SELECT },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: DIRECTORY_LIMIT,
    }),
    prisma.agent.findMany({
      where: {
        deletedAt: null,
        visibility: "PUBLIC",
        organization: RENDERABLE_ORGANIZATION,
      },
      select: {
        ...AGENT_PUBLIC_SELECT,
        updatedAt: true,
        organization: { select: ORGANIZATION_PROFILE_SELECT },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: DIRECTORY_LIMIT,
    }),
  ]);

  const entries: DirectoryEntry[] = [
    ...listings.flatMap(({ organization, updatedAt, ...row }) => {
      const owner = renderableOwner(organization);

      return owner
        ? [
            {
              descriptor: buildApiListingDescriptor(
                toPublicApiListing(row),
                toPublicProfile(owner, { isOwner: false }),
              ),
              updatedAt,
              indexable: owner.allowSEOIndexing,
            },
          ]
        : [];
    }),
    ...agents.flatMap(({ organization, updatedAt, ...row }) => {
      const owner = renderableOwner(organization);

      return owner
        ? [
            {
              descriptor: buildAgentDescriptor(
                toPublicAgent(row),
                toPublicProfile(owner, { isOwner: false }),
              ),
              updatedAt,
              indexable: owner.allowSEOIndexing,
            },
          ]
        : [];
    }),
  ];

  return entries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
});

export const listProfileHandles = cache(
  async (): Promise<{ username: string; updatedAt: Date }[]> => {
    const rows = await prisma.organization.findMany({
      where: INDEXABLE_ORGANIZATION,
      select: { handle: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: DIRECTORY_LIMIT,
    });

    return rows.flatMap((row) =>
      row.handle ? [{ username: row.handle, updatedAt: row.updatedAt }] : [],
    );
  },
);
