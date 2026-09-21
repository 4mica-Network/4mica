import "server-only";

import { cache } from "react";
import type { PublicAgent } from "@/schema/agent";
import type { PaymentNetwork } from "@/schema/params";
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
  docsUrl: true,
  status: true,
  visibility: true,
  createdAt: true,
  publishedAt: true,
  network: true,

  payToAddress: true,
  assetAddress: true,
  priceAmount: true,
  priceCurrency: true,
  priceLabel: true,
  endpointUrl: true,
  x402Endpoint: true,
} as const;

/**
 * The owner's own view. `walletAddress` is added only here: the agent detail
 * page needs it to render a runnable payer snippet, and the owner already knows
 * their own address. `creditLimit` stays out of both selects.
 */
const AGENT_OWNER_SELECT = {
  ...AGENT_PUBLIC_SELECT,
  walletAddress: true,
} as const;

type Decimalish = { toString(): string } | null;

type AgentRow = {
  id: string;
  slug: string | null;
  name: string;
  headline: string | null;
  description: string | null;
  avatarUrl: string | null;
  docsUrl: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
  createdAt: Date;
  publishedAt: Date | null;
  network: PaymentNetwork;
  payToAddress: string | null;
  assetAddress: string | null;
  priceAmount: Decimalish;
  priceCurrency: string | null;
  priceLabel: string | null;
  endpointUrl: string | null;
  x402Endpoint: string | null;
  walletAddress?: string | null;
};

const toPublicAgent = (row: AgentRow): PublicAgent => ({
  id: row.id,
  ref: row.slug ?? row.id,
  name: row.name,
  headline: row.headline,
  description: row.description,
  avatarUrl: row.avatarUrl,
  docsUrl: row.docsUrl,
  status: row.status,
  visibility: row.visibility,
  createdAt: row.createdAt.toISOString(),
  publishedAt: row.publishedAt?.toISOString() ?? null,
  network: row.network,

  payToAddress: row.payToAddress,
  assetAddress: row.assetAddress,
  priceAmount: row.priceAmount?.toString() ?? null,
  priceCurrency: row.priceCurrency,
  priceLabel: row.priceLabel,
  endpointUrl: row.endpointUrl,
  x402Endpoint: row.x402Endpoint,

  // Absent from the public select, so this is null for non-owners by
  // construction rather than by a conditional the caller could forget.
  walletAddress: row.walletAddress ?? null,
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
        deletedAt: null,
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
 *
 * `isOwner` is a separate argument from the visibility widening on purpose:
 * conflating "may see hidden rows" with "may see the wallet address" is how a
 * future caller would leak the address.
 */
export const getPublicAgent = cache(
  async (
    ownerId: string,
    idOrSlug: string,
    isOwner = false,
  ): Promise<PublicAgent | null> => {
    const row = await prisma.agent.findFirst({
      where: {
        ownerId,
        deletedAt: null,
        ...(isOwner
          ? {}
          : { visibility: { in: ["PUBLIC", "UNLISTED"] as const } }),
        OR: [{ slug: idOrSlug }, { id: idOrSlug }],
      },
      select: isOwner ? AGENT_OWNER_SELECT : AGENT_PUBLIC_SELECT,
    });

    return row ? toPublicAgent(row) : null;
  },
);
