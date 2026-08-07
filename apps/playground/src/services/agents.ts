import "server-only";

import { cache } from "react";
import type { PublicAgent } from "@/schema/agent";
import { prisma } from "./db";

/**
 * Note what is NOT selected: `walletAddress` and `creditLimit`. A credit limit
 * is commercially sensitive and a wallet address lets anyone correlate a
 * profile with its on-chain activity. Widening this select is a product
 * decision, not a refactor.
 */
const AGENT_PUBLIC_SELECT = {
  id: true,
  slug: true,
  name: true,
  headline: true,
  description: true,
  avatarUrl: true,
  status: true,
  visibility: true,
  createdAt: true,
} as const;

type AgentRow = {
  id: string;
  slug: string | null;
  name: string;
  headline: string | null;
  description: string | null;
  avatarUrl: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  createdAt: Date;
};

const toPublicAgent = (row: AgentRow): PublicAgent => ({
  id: row.id,
  ref: row.slug ?? row.id,
  name: row.name,
  headline: row.headline,
  description: row.description,
  avatarUrl: row.avatarUrl,
  status: row.status,
  visibility: row.visibility,
  createdAt: row.createdAt.toISOString(),
});

/**
 * The profile index. UNLISTED agents are reachable at their direct URL but are
 * deliberately absent here — that is the whole point of the tier. An owner
 * previewing their own profile sees everything.
 */
export const listPublicAgents = cache(
  async (ownerId: string, includeHidden = false): Promise<PublicAgent[]> => {
    const rows = await prisma.agent.findMany({
      where: {
        ownerId,
        ...(includeHidden ? {} : { visibility: "PUBLIC" }),
      },
      select: AGENT_PUBLIC_SELECT,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return rows.map(toPublicAgent);
  },
);

/**
 * Resolve one agent by slug or id, scoped to its owner so a valid id from
 * another profile cannot be read through this URL.
 */
export const getPublicAgent = cache(
  async (
    ownerId: string,
    idOrSlug: string,
    includeHidden = false,
  ): Promise<PublicAgent | null> => {
    const row = await prisma.agent.findFirst({
      where: {
        ownerId,
        ...(includeHidden
          ? {}
          : { visibility: { in: ["PUBLIC", "UNLISTED"] as const } }),
        OR: [{ slug: idOrSlug }, { id: idOrSlug }],
      },
      select: AGENT_PUBLIC_SELECT,
    });

    return row ? toPublicAgent(row) : null;
  },
);
