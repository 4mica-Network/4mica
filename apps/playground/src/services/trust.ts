import "server-only";

import { cache } from "react";
import type { PublicReview, TrustSummary } from "@/schema/trust";
import { prisma } from "./db";

export type ResourceKind = "listing" | "agent";

export const targetOf = (kind: ResourceKind, id: string) =>
  kind === "listing" ? { listingId: id } : { agentId: id };

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  verifiedPurchase: true,
  ownerReply: true,
  ownerRepliedAt: true,
  createdAt: true,
  author: { select: { id: true, username: true, name: true, avatarUrl: true } },
} as const;

const POLICY_SELECT = {
  policyEnabled: true,
  faqEnabled: true,
  refundPolicy: true,
  uptimeTarget: true,
  supportResponse: true,
  supportEmail: true,
  rateLimit: true,
  dataRetention: true,
  testEndpoint: true,
  termsUrl: true,
  privacyUrl: true,
  statusUrl: true,
} as const;

const visible = (kind: ResourceKind, id: string) => ({
  ...targetOf(kind, id),
  hiddenAt: null,
});

export const getTrustSummary = cache(
  async (kind: ResourceKind, id: string): Promise<TrustSummary> => {
    const where = visible(kind, id);

    const [aggregate, one, two, three, four, five, verified] =
      await prisma.$transaction([
        prisma.review.aggregate({
          where,
          _avg: { rating: true },
          _count: true,
        }),
        prisma.review.count({ where: { ...where, rating: 1 } }),
        prisma.review.count({ where: { ...where, rating: 2 } }),
        prisma.review.count({ where: { ...where, rating: 3 } }),
        prisma.review.count({ where: { ...where, rating: 4 } }),
        prisma.review.count({ where: { ...where, rating: 5 } }),
        prisma.review.count({ where: { ...where, verifiedPurchase: true } }),
      ]);

    return {
      ratingCount: aggregate._count,
      ratingAverage: aggregate._avg.rating,
      verifiedCount: verified,
      distribution: { "1": one, "2": two, "3": three, "4": four, "5": five },
    };
  },
);

export const listReviews = cache(
  async (
    kind: ResourceKind,
    id: string,
    take = 20,
  ): Promise<PublicReview[]> => {
    const rows = await prisma.review.findMany({
      where: visible(kind, id),
      select: REVIEW_SELECT,
      orderBy: [
        { verifiedPurchase: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      verifiedPurchase: row.verifiedPurchase,
      ownerReply: row.ownerReply,
      ownerRepliedAt: row.ownerRepliedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      authorId: row.author.id,
      authorName: row.author.name,
      authorUsername: row.author.username,
      authorAvatarUrl: row.author.avatarUrl,
    }));
  },
);

export const getPolicy = cache(async (kind: ResourceKind, id: string) => {
  const row = await prisma.resourcePolicy.findFirst({
    where: targetOf(kind, id),
    select: POLICY_SELECT,
  });

  if (!row || !row.policyEnabled) {
    return null;
  }

  const { policyEnabled, faqEnabled, ...fields } = row;
  const hasAny = Object.values(fields).some((value) => value !== null);

  return hasAny ? fields : null;
});

export const listFaqs = cache(async (kind: ResourceKind, id: string) => {
  const settings = await prisma.resourcePolicy.findFirst({
    where: targetOf(kind, id),
    select: { faqEnabled: true },
  });

  if (settings && !settings.faqEnabled) {
    return [];
  }

  const rows = await prisma.faqItem.findMany({
    where: targetOf(kind, id),
    select: { id: true, question: true, answer: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return rows;
});

export const hasSettledPayment = async (
  kind: ResourceKind,
  id: string,
  viewerId: string,
): Promise<boolean> => {
  const wallets = await prisma.wallet.findMany({
    where: { ownerId: viewerId },
    select: { address: true },
  });

  if (wallets.length === 0) {
    return false;
  }

  const payment = await prisma.payment.findFirst({
    where: {
      ...targetOf(kind, id),
      status: "SETTLED",
      payerAddress: { in: wallets.map((wallet) => wallet.address) },
    },
    select: { id: true },
  });

  return payment !== null;
};

export const getViewerReview = cache(
  async (
    kind: ResourceKind,
    id: string,
    viewerId: string,
  ): Promise<PublicReview | null> => {
    const row = await prisma.review.findFirst({
      where: { ...targetOf(kind, id), authorId: viewerId },
      select: REVIEW_SELECT,
    });

    return row
      ? {
          id: row.id,
          rating: row.rating,
          title: row.title,
          body: row.body,
          verifiedPurchase: row.verifiedPurchase,
          ownerReply: row.ownerReply,
          ownerRepliedAt: row.ownerRepliedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          authorId: row.author.id,
          authorName: row.author.name,
          authorUsername: row.author.username,
          authorAvatarUrl: row.author.avatarUrl,
        }
      : null;
  },
);
