import "server-only";

import { cache } from "react";
import type { PublicApiListing } from "@/schema/api-listing";
import { prisma } from "./db";

/** `ownerId` is omitted so a listing can never correlate two profiles. */
const API_LISTING_PUBLIC_SELECT = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  description: true,
  baseUrl: true,
  docsUrl: true,
  category: true,
  tags: true,
  priceLabel: true,
  visibility: true,
  publishedAt: true,
} as const;

type ApiListingRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  baseUrl: string | null;
  docsUrl: string | null;
  category: string | null;
  tags: string[];
  priceLabel: string | null;
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  publishedAt: Date | null;
};

const toPublicApiListing = (row: ApiListingRow): PublicApiListing => ({
  id: row.id,
  ref: row.slug,
  name: row.name,
  summary: row.summary,
  description: row.description,
  baseUrl: row.baseUrl,
  docsUrl: row.docsUrl,
  category: row.category,
  tags: row.tags,
  priceLabel: row.priceLabel,
  visibility: row.visibility,
  publishedAt: row.publishedAt?.toISOString() ?? null,
});

export const listPublicApiListings = cache(
  async (
    ownerId: string,
    includeHidden = false,
  ): Promise<PublicApiListing[]> => {
    const rows = await prisma.apiListing.findMany({
      where: {
        ownerId,
        deletedAt: null,
        ...(includeHidden ? {} : { visibility: "PUBLIC" }),
      },
      select: API_LISTING_PUBLIC_SELECT,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return rows.map(toPublicApiListing);
  },
);

export const getPublicApiListing = cache(
  async (
    ownerId: string,
    idOrSlug: string,
    includeHidden = false,
  ): Promise<PublicApiListing | null> => {
    const row = await prisma.apiListing.findFirst({
      where: {
        ownerId,
        deletedAt: null,
        ...(includeHidden
          ? {}
          : { visibility: { in: ["PUBLIC", "UNLISTED"] as const } }),
        OR: [{ slug: idOrSlug }, { id: idOrSlug }],
      },
      select: API_LISTING_PUBLIC_SELECT,
    });

    return row ? toPublicApiListing(row) : null;
  },
);
