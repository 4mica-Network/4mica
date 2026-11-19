import "server-only";

import { cache } from "react";
import { messages } from "@/i18n";
import type { PublicReview, TrustSummary } from "@/schema/trust";
import { cachedPublic, resourceTag } from "./cache";
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
  author: {
    select: {
      id: true,
      username: true,
      name: true,
      avatarUrl: true,
      private: true,
    },
  },
} as const;

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verifiedPurchase: boolean;
  ownerReply: string | null;
  ownerRepliedAt: Date | null;
  createdAt: Date;
  author: {
    id: string;
    username: string | null;
    name: string;
    avatarUrl: string | null;
    private: boolean;
  };
};

const toPublicReview = (row: ReviewRow): PublicReview => ({
  id: row.id,
  rating: row.rating,
  title: row.title,
  body: row.body,
  verifiedPurchase: row.verifiedPurchase,
  ownerReply: row.ownerReply,
  ownerRepliedAt: row.ownerRepliedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  authorId: row.author.id,
  authorName: row.author.private
    ? messages.trust.anonymousReviewer
    : row.author.name,
  authorUsername: row.author.private ? null : row.author.username,
  authorAvatarUrl: row.author.private ? null : row.author.avatarUrl,
});

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
  author: { deletedAt: null, banned: false },
});

const tagged = (kind: ResourceKind, id: string) => [resourceTag(kind, id)];

const loadTrustSummary = cachedPublic(
  "trust:summary",
  async (kind: ResourceKind, id: string): Promise<TrustSummary> => {
    const where = visible(kind, id);

    const [aggregate, byRating, verified] = await Promise.all([
      prisma.review.aggregate({
        where,
        _avg: { rating: true },
        _count: true,
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where,
        _count: { _all: true },
      }),
      prisma.review.count({ where: { ...where, verifiedPurchase: true } }),
    ]);

    const countFor = (rating: number) =>
      byRating.find((group) => group.rating === rating)?._count._all ?? 0;

    return {
      ratingCount: aggregate._count,
      ratingAverage: aggregate._avg.rating,
      verifiedCount: verified,
      distribution: {
        "1": countFor(1),
        "2": countFor(2),
        "3": countFor(3),
        "4": countFor(4),
        "5": countFor(5),
      },
    };
  },
  tagged,
);

export const getTrustSummary = cache(
  (kind: ResourceKind, id: string): Promise<TrustSummary> =>
    loadTrustSummary(kind, id),
);

const loadReviews = cachedPublic(
  "trust:reviews",
  async (
    kind: ResourceKind,
    id: string,
    take: number,
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

    return rows.map(toPublicReview);
  },
  tagged,
);

export const listReviews = cache(
  (kind: ResourceKind, id: string, take = 20): Promise<PublicReview[]> =>
    loadReviews(kind, id, take),
);

const loadPolicyAndFaqs = cachedPublic(
  "trust:policy",
  async (kind: ResourceKind, id: string) => {
    const [row, faqs] = await Promise.all([
      prisma.resourcePolicy.findFirst({
        where: targetOf(kind, id),
        select: POLICY_SELECT,
      }),
      prisma.faqItem.findMany({
        where: targetOf(kind, id),
        select: { id: true, question: true, answer: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    if (!row) {
      return { policy: null, faqs };
    }

    const { policyEnabled, faqEnabled, ...fields } = row;
    const hasAny = Object.values(fields).some((value) => value !== null);

    return {
      policy: policyEnabled && hasAny ? fields : null,
      faqs: faqEnabled ? faqs : [],
    };
  },
  tagged,
);

export const getPolicy = cache(
  async (kind: ResourceKind, id: string) =>
    (await loadPolicyAndFaqs(kind, id)).policy,
);

export const listFaqs = cache(
  async (kind: ResourceKind, id: string) =>
    (await loadPolicyAndFaqs(kind, id)).faqs,
);

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

    return row ? toPublicReview(row) : null;
  },
);
