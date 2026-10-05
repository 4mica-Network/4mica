import { type Prisma, prisma } from "@4mica/db";
import { SLUG_MAX_LENGTH } from "@services/slug";
import type { ListAgentsQuery } from "./schema";

export const AGENT_SELECT = {
  id: true,
  slug: true,
  name: true,
  headline: true,
  description: true,
  avatarUrl: true,
  docsUrl: true,
  status: true,
  visibility: true,
  network: true,

  walletAddress: true,
  payerWalletId: true,
  creditLimit: true,

  walletId: true,
  payToAddress: true,
  assetAddress: true,
  priceAmount: true,
  priceCurrency: true,
  priceLabel: true,
  endpointUrl: true,
  x402Endpoint: true,

  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AgentSelect;

type RawAgent = Prisma.AgentGetPayload<{ select: typeof AGENT_SELECT }>;

export type AgentRow = Omit<RawAgent, "creditLimit" | "priceAmount"> & {
  creditLimit: string;
  priceAmount: string | null;
};

const toRow = (row: RawAgent): AgentRow => ({
  ...row,
  creditLimit: row.creditLimit.toString(),
  priceAmount: row.priceAmount?.toString() ?? null,
});

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const orderFor = (
  sort: ListAgentsQuery["sort"],
): Prisma.AgentOrderByWithRelationInput[] => {
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
  query: ListAgentsQuery,
): Prisma.AgentWhereInput => {
  const where: Prisma.AgentWhereInput = { ownerId, deletedAt: null };

  if (query.status) {
    where.status = query.status;
  }
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
      { headline: { contains: needle, mode: "insensitive" } },
      { slug: { contains: needle, mode: "insensitive" } },
    ];
  }

  return where;
};

export const listAgents = async (
  ownerId: string,
  query: ListAgentsQuery,
): Promise<{
  items: AgentRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const where = whereFor(ownerId, query);
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.agent.findMany({
      where,
      orderBy: orderFor(query.sort),
      skip,
      take: query.limit,
      select: AGENT_SELECT,
    }),
    prisma.agent.count({ where }),
  ]);

  return {
    items: items.map(toRow),
    total,
    page: query.page,
    limit: query.limit,
  };
};

export const getAgent = async (
  ownerId: string,
  id: string,
): Promise<AgentRow | null> => {
  const row = await prisma.agent.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: AGENT_SELECT,
  });

  return row ? toRow(row) : null;
};

export const takenSlugs = async (ownerId: string): Promise<Set<string>> => {
  const rows = await prisma.agent.findMany({
    where: { ownerId },
    select: { slug: true },
  });

  return new Set(rows.flatMap((row) => (row.slug ? [row.slug] : [])));
};

export const createAgent = async (
  ownerId: string,
  data: Prisma.AgentUncheckedCreateInput,
): Promise<AgentRow> => {
  const row = await prisma.agent.create({
    data: { ...data, ownerId },
    select: AGENT_SELECT,
  });

  return toRow(row);
};

export const updateAgent = async (
  ownerId: string,
  id: string,
  data: Record<string, unknown>,
): Promise<AgentRow | null> => {
  const { count } = await prisma.agent.updateMany({
    where: { id, ownerId, deletedAt: null },
    data: data as Prisma.AgentUpdateManyMutationInput,
  });

  return count > 0 ? getAgent(ownerId, id) : null;
};

export const softDeleteAgent = async (
  ownerId: string,
  id: string,
): Promise<boolean> => {
  const row = await prisma.agent.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { id: true, slug: true },
  });

  if (!row) {
    return false;
  }

  await prisma.agent.update({
    where: { id: row.id },
    data: {
      deletedAt: new Date(),
      walletAddress: null,
      slug: row.slug
        ? `${row.slug}-deleted-${row.id.slice(0, 8)}`.slice(0, SLUG_MAX_LENGTH)
        : null,
    },
  });

  return true;
};

export const batchSoftDeleteAgents = async (
  ownerId: string,
  ids: string[],
): Promise<{ deleted: string[]; notFound: string[] }> => {
  const owned = await prisma.agent.findMany({
    where: { id: { in: ids }, ownerId, deletedAt: null },
    select: { id: true, slug: true },
  });

  const now = new Date();
  for (const row of owned) {
    await prisma.agent.update({
      where: { id: row.id },
      data: {
        deletedAt: now,
        walletAddress: null,
        slug: row.slug
          ? `${row.slug}-deleted-${row.id.slice(0, 8)}`.slice(
              0,
              SLUG_MAX_LENGTH,
            )
          : null,
      },
    });
  }

  const deleted = owned.map((row) => row.id);
  const deletedSet = new Set(deleted);

  return { deleted, notFound: ids.filter((id) => !deletedSet.has(id)) };
};
