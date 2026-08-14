import "server-only";

import { cache } from "react";
import type { PublicApiListing } from "@/schema/api-listing";
import type { HttpMethod, PaymentNetwork } from "@/schema/params";
import { type Prisma, prisma } from "./db";

/**
 * `ownerId` is omitted so a listing can never correlate two profiles.
 *
 * The payment columns ARE selected: x402 advertises `payTo`, `asset`, `network`
 * and the price to any anonymous caller in the 402 response, so they are public
 * facts by protocol design.
 */
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
  network: true,
  payToAddress: true,
  assetAddress: true,
  priceAmount: true,
  priceCurrency: true,
  x402Endpoint: true,
  endpoints: {
    select: {
      id: true,
      method: true,
      path: true,
      summary: true,
      priceAmount: true,
    },
    // Deterministic: the snippet builder demonstrates endpoints[0], so a tie
    // here would make the generated code unstable between renders.
    orderBy: [{ sortOrder: "asc" }, { path: "asc" }],
  },
  // `satisfies` rather than `as const`, which would make the nested `orderBy`
  // array readonly and so unassignable to Prisma's input type.
} satisfies Prisma.ApiListingSelect;

/** Prisma Decimal is not serialisable across the RSC boundary. */
type Decimalish = { toString(): string } | null;

type ApiEndpointRow = {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string | null;
  priceAmount: Decimalish;
};

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
  network: PaymentNetwork | null;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: Decimalish;
  priceCurrency: string | null;
  x402Endpoint: string | null;
  endpoints: ApiEndpointRow[];
};

const toAmount = (value: Decimalish): string | null =>
  value === null ? null : value.toString();

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
  network: row.network,
  payToAddress: row.payToAddress,
  assetAddress: row.assetAddress,
  priceAmount: toAmount(row.priceAmount),
  priceCurrency: row.priceCurrency,
  x402Endpoint: row.x402Endpoint,
  endpoints: row.endpoints.map((endpoint) => ({
    id: endpoint.id,
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary,
    priceAmount: toAmount(endpoint.priceAmount),
  })),
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
