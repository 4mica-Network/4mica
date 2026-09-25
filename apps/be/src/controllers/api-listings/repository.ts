import { type Prisma, prisma } from "@4mica/db";
import { SLUG_MAX_LENGTH } from "@services/slug";
import type { ApiEndpointInput, ListApiListingsQuery } from "./schema";

export const API_LISTING_SELECT = {
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
  walletId: true,
  network: true,
  payToAddress: true,
  assetAddress: true,
  priceAmount: true,
  priceCurrency: true,
  x402Endpoint: true,
  createdAt: true,
  updatedAt: true,
  endpoints: {
    select: {
      id: true,
      method: true,
      path: true,
      summary: true,
      priceAmount: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: "asc" }, { path: "asc" }],
  },
} satisfies Prisma.ApiListingSelect;

type RawApiListing = Prisma.ApiListingGetPayload<{
  select: typeof API_LISTING_SELECT;
}>;

export type ApiListingRow = Omit<RawApiListing, "priceAmount" | "endpoints"> & {
  priceAmount: string | null;
  endpoints: (Omit<RawApiListing["endpoints"][number], "priceAmount"> & {
    priceAmount: string | null;
  })[];
};

const toRow = (row: RawApiListing): ApiListingRow => ({
  ...row,
  priceAmount: row.priceAmount?.toString() ?? null,
  endpoints: row.endpoints.map((endpoint) => ({
    ...endpoint,
    priceAmount: endpoint.priceAmount?.toString() ?? null,
  })),
});

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const orderFor = (
  sort: ListApiListingsQuery["sort"],
): Prisma.ApiListingOrderByWithRelationInput[] => {
  switch (sort) {
    case "createdAt":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "updatedAt":
      return [{ updatedAt: "asc" }, { id: "asc" }];
    case "-updatedAt":
      return [{ updatedAt: "desc" }, { id: "desc" }];
    case "name":
      return [{ name: "asc" }, { id: "asc" }];
    case "-name":
      return [{ name: "desc" }, { id: "desc" }];
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
};

const whereFor = (
  ownerId: string,
  query: ListApiListingsQuery,
): Prisma.ApiListingWhereInput => {
  const where: Prisma.ApiListingWhereInput = { ownerId, deletedAt: null };

  if (query.visibility) {
    where.visibility = query.visibility;
  }
  if (query.network) {
    where.network = query.network;
  }

  if (query.q) {
    const needle = escapeLike(query.q);
    where.OR = [
      { name: { contains: needle, mode: "insensitive" } },
      { summary: { contains: needle, mode: "insensitive" } },
      { slug: { contains: needle, mode: "insensitive" } },
    ];
  }

  return where;
};

export const listApiListings = async (
  ownerId: string,
  query: ListApiListingsQuery,
): Promise<{
  items: ApiListingRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const where = whereFor(ownerId, query);
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.apiListing.findMany({
      where,
      orderBy: orderFor(query.sort),
      skip,
      take: query.limit,
      select: API_LISTING_SELECT,
    }),
    prisma.apiListing.count({ where }),
  ]);

  return {
    items: items.map(toRow),
    total,
    page: query.page,
    limit: query.limit,
  };
};

export const getApiListing = async (
  ownerId: string,
  id: string,
): Promise<ApiListingRow | null> => {
  const row = await prisma.apiListing.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: API_LISTING_SELECT,
  });

  return row ? toRow(row) : null;
};

export const takenSlugs = async (ownerId: string): Promise<Set<string>> => {
  const rows = await prisma.apiListing.findMany({
    where: { ownerId },
    select: { slug: true },
  });

  return new Set(rows.map((row) => row.slug));
};

const endpointCreateData = (endpoints: ApiEndpointInput[]) =>
  endpoints.map((endpoint, index) => ({
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary ?? null,
    priceAmount: endpoint.priceAmount ?? null,
    sortOrder: endpoint.sortOrder || index,
  }));

export interface CreateApiListingData {
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
  walletId: string | null;
  network: "BASE" | "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA" | null;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  x402Endpoint: string | null;
  endpoints: ApiEndpointInput[];
}

export const createApiListing = async (
  ownerId: string,
  data: CreateApiListingData,
): Promise<ApiListingRow> => {
  const { endpoints, ...listing } = data;

  const row = await prisma.apiListing.create({
    data: {
      ownerId,
      ...listing,
      ...(endpoints.length > 0
        ? { endpoints: { create: endpointCreateData(endpoints) } }
        : {}),
    },
    select: API_LISTING_SELECT,
  });

  return toRow(row);
};

export const updateApiListing = async (
  ownerId: string,
  id: string,
  data: Prisma.ApiListingUpdateInput,
): Promise<ApiListingRow | null> => {
  const { count } = await prisma.apiListing.updateMany({
    where: { id, ownerId, deletedAt: null },
    data: data as Prisma.ApiListingUpdateManyMutationInput,
  });

  return count > 0 ? getApiListing(ownerId, id) : null;
};

export const replaceApiEndpoints = async (
  ownerId: string,
  id: string,
  endpoints: ApiEndpointInput[],
): Promise<ApiListingRow | null> => {
  const owned = await prisma.apiListing.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { id: true },
  });

  if (!owned) {
    return null;
  }

  await prisma.$transaction([
    prisma.apiEndpoint.deleteMany({ where: { listingId: owned.id } }),
    ...(endpoints.length > 0
      ? [
          prisma.apiEndpoint.createMany({
            data: endpointCreateData(endpoints).map((endpoint) => ({
              ...endpoint,
              listingId: owned.id,
            })),
          }),
        ]
      : []),
  ]);

  return getApiListing(ownerId, id);
};

export const softDeleteApiListing = async (
  ownerId: string,
  id: string,
): Promise<boolean> => {
  const row = await prisma.apiListing.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { id: true, slug: true },
  });

  if (!row) {
    return false;
  }

  await prisma.apiListing.update({
    where: { id: row.id },
    data: {
      deletedAt: new Date(),
      slug: `${row.slug}-deleted-${row.id.slice(0, 8)}`.slice(
        0,
        SLUG_MAX_LENGTH,
      ),
    },
  });

  return true;
};

export const batchSoftDeleteApiListings = async (
  ownerId: string,
  ids: string[],
): Promise<{ deleted: string[]; notFound: string[] }> => {
  const owned = await prisma.apiListing.findMany({
    where: { id: { in: ids }, ownerId, deletedAt: null },
    select: { id: true, slug: true },
  });

  const now = new Date();
  for (const row of owned) {
    await prisma.apiListing.update({
      where: { id: row.id },
      data: {
        deletedAt: now,
        slug: `${row.slug}-deleted-${row.id.slice(0, 8)}`.slice(
          0,
          SLUG_MAX_LENGTH,
        ),
      },
    });
  }

  const deleted = owned.map((row) => row.id);
  const deletedSet = new Set(deleted);

  return { deleted, notFound: ids.filter((id) => !deletedSet.has(id)) };
};
