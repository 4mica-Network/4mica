import "server-only";

import { cache } from "react";
import {
  buildAgentDescriptor,
  buildApiListingDescriptor,
  type ResourceDescriptor,
} from "@/lib/descriptor";
import { AGENT_PUBLIC_SELECT, toPublicAgent } from "./agents";
import { API_LISTING_PUBLIC_SELECT, toPublicApiListing } from "./api-listings";
import { prisma } from "./db";
import { PROFILE_SELECT } from "./profile";
import { toPublicProfile } from "./profile-rules";

const RENDERABLE_OWNER = {
  username: { not: null },
  deletedAt: null,
  banned: false,
  hidden: false,
  private: false,
} as const;

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
        owner: RENDERABLE_OWNER,
      },
      select: {
        ...API_LISTING_PUBLIC_SELECT,
        updatedAt: true,
        owner: { select: PROFILE_SELECT },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: DIRECTORY_LIMIT,
    }),
    prisma.agent.findMany({
      where: {
        deletedAt: null,
        visibility: "PUBLIC",
        owner: RENDERABLE_OWNER,
      },
      select: {
        ...AGENT_PUBLIC_SELECT,
        updatedAt: true,
        owner: { select: PROFILE_SELECT },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: DIRECTORY_LIMIT,
    }),
  ]);

  const entries: DirectoryEntry[] = [
    ...listings.map(({ owner, updatedAt, ...row }) => ({
      descriptor: buildApiListingDescriptor(
        toPublicApiListing(row),
        toPublicProfile(owner, { isOwner: false }),
      ),
      updatedAt,
      indexable: owner.allowSEOIndexing,
    })),
    ...agents.flatMap(({ owner, updatedAt, ...row }) =>
      owner
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
        : [],
    ),
  ];

  return entries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
});

export const listProfileHandles = cache(
  async (): Promise<{ username: string; updatedAt: Date }[]> => {
    const rows = await prisma.user.findMany({
      where: RENDERABLE_OWNER,
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: DIRECTORY_LIMIT,
    });

    return rows.flatMap((row) =>
      row.username
        ? [{ username: row.username, updatedAt: row.updatedAt }]
        : [],
    );
  },
);
