import "server-only";

import { cache } from "react";
import type { PublicApiListing } from "@/schema/api-listing";
import type { HttpMethod, PaymentNetwork } from "@/schema/params";
import { cachedPublic, ownerTag } from "./cache";
import { type Prisma, prisma } from "./db";

export const API_LISTING_PUBLIC_SELECT = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  description: true,
  url: true,
  method: true,
  docsUrl: true,
  category: true,
  tags: true,
  priceLabel: true,
  visibility: true,
  publishedAt: true,
  network: true,
  payToAddress: true,
  assetAddress: true,
  priceAmount: true,
  priceCurrency: true,
  x402Endpoint: true,
} satisfies Prisma.ApiListingSelect;

type Decimalish = { toString(): string } | null;

type ApiListingRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  url: string | null;
  method: HttpMethod;
  docsUrl: string | null;
  category: string | null;
  tags: string[];
  priceLabel: string | null;
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  publishedAt: Date | null;
  network: PaymentNetwork | null;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: Decimalish;
  priceCurrency: string | null;
  x402Endpoint: string | null;
};

const toAmount = (value: Decimalish): string | null =>
  value === null ? null : value.toString();

export const toPublicApiListing = (row: ApiListingRow): PublicApiListing => ({
  id: row.id,
  ref: row.slug,
  name: row.name,
  summary: row.summary,
  description: row.description,
  url: row.url,
  method: row.method,
  docsUrl: row.docsUrl,
  category: row.category,
  tags: row.tags,
  priceLabel: row.priceLabel,
  visibility: row.visibility,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  network: row.network,
  payToAddress: row.payToAddress,
  assetAddress: row.assetAddress,
  priceAmount: toAmount(row.priceAmount),
  priceCurrency: row.priceCurrency,
  x402Endpoint: row.x402Endpoint,
});

const queryApiListings = async (
  ownerId: string,
  includeHidden: boolean,
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
};

const loadPublicApiListings = cachedPublic(
  "api-listings:list",
  (ownerId: string) => queryApiListings(ownerId, false),
  (ownerId) => [ownerTag(ownerId)],
);

export const listPublicApiListings = cache(
  (ownerId: string, includeHidden = false): Promise<PublicApiListing[]> =>
    includeHidden
      ? queryApiListings(ownerId, true)
      : loadPublicApiListings(ownerId),
);

const queryApiListing = async (
  ownerId: string,
  idOrSlug: string,
  includeHidden: boolean,
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
};

const loadPublicApiListing = cachedPublic(
  "api-listings:one",
  (ownerId: string, idOrSlug: string) =>
    queryApiListing(ownerId, idOrSlug, false),
  (ownerId) => [ownerTag(ownerId)],
);

export const getPublicApiListing = cache(
  (
    ownerId: string,
    idOrSlug: string,
    includeHidden = false,
  ): Promise<PublicApiListing | null> =>
    includeHidden
      ? queryApiListing(ownerId, idOrSlug, true)
      : loadPublicApiListing(ownerId, idOrSlug),
);
