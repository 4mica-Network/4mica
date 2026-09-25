import { type Prisma, prisma } from "@4mica/db";
import type {
  ListReportsQuery,
  ListReviewsQuery,
  UpsertPolicyInput,
} from "./schema";

export type ResourceKind = "listing" | "agent";

export const ownsResource = async (
  kind: ResourceKind,
  ownerId: string,
  id: string,
): Promise<boolean> => {
  if (kind === "listing") {
    const row = await prisma.apiListing.findFirst({
      where: { id, ownerId, deletedAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  const row = await prisma.agent.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { id: true },
  });
  return row !== null;
};

const target = (kind: ResourceKind, id: string) =>
  kind === "listing" ? { listingId: id } : { agentId: id };

export const POLICY_SELECT = {
  id: true,
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ResourcePolicySelect;

export const getPolicy = (kind: ResourceKind, id: string) =>
  prisma.resourcePolicy.findFirst({
    where: target(kind, id),
    select: POLICY_SELECT,
  });

export const upsertPolicy = async (
  kind: ResourceKind,
  id: string,
  input: UpsertPolicyInput,
) => {
  const existing = await prisma.resourcePolicy.findFirst({
    where: target(kind, id),
    select: { id: true },
  });

  if (existing) {
    return prisma.resourcePolicy.update({
      where: { id: existing.id },
      data: input,
      select: POLICY_SELECT,
    });
  }

  return prisma.resourcePolicy.create({
    data: { ...target(kind, id), ...input },
    select: POLICY_SELECT,
  });
};

export const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  verifiedPurchase: true,
  ownerReply: true,
  ownerRepliedAt: true,
  hiddenAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { username: true, name: true, avatarUrl: true } },
} satisfies Prisma.ReviewSelect;

export const listReviews = async (
  kind: ResourceKind,
  id: string,
  query: ListReviewsQuery,
) => {
  const where = target(kind, id);

  const [total, data] = await prisma.$transaction([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      select: REVIEW_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data, page: query.page, limit: query.limit, total };
};

export const findReview = (kind: ResourceKind, id: string, reviewId: string) =>
  prisma.review.findFirst({
    where: { id: reviewId, ...target(kind, id) },
    select: { id: true },
  });

export const replyToReview = (reviewId: string, reply: string | null) =>
  prisma.review.update({
    where: { id: reviewId },
    data: {
      ownerReply: reply,
      ownerRepliedAt: reply === null ? null : new Date(),
    },
    select: REVIEW_SELECT,
  });

export const REPORT_SELECT = {
  id: true,
  reason: true,
  detail: true,
  status: true,
  acknowledgedAt: true,
  resolvedAt: true,
  resolutionNote: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReportSelect;

export const listReports = async (
  kind: ResourceKind,
  id: string,
  query: ListReportsQuery,
) => {
  const where = {
    ...target(kind, id),
    ...(query.status ? { status: query.status } : {}),
  };

  const [total, data] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      select: REPORT_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return { data, page: query.page, limit: query.limit, total };
};

export const findReport = (kind: ResourceKind, id: string, reportId: string) =>
  prisma.report.findFirst({
    where: { id: reportId, ...target(kind, id) },
    select: { id: true, status: true },
  });

export const updateReport = (
  reportId: string,
  status: "ACKNOWLEDGED" | "RESOLVED",
  resolutionNote: string | null | undefined,
) =>
  prisma.report.update({
    where: { id: reportId },
    data: {
      status,
      ...(resolutionNote === undefined ? {} : { resolutionNote }),
      acknowledgedAt: new Date(),
      ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
    },
    select: REPORT_SELECT,
  });

export interface TrustSummary {
  ratingCount: number;
  ratingAverage: number | null;
  verifiedCount: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  openReports: number;
  unansweredReviews: number;
}

export const trustSummary = async (
  kind: ResourceKind,
  id: string,
): Promise<TrustSummary> => {
  const where = { ...target(kind, id), hiddenAt: null };

  const [
    aggregate,
    one,
    two,
    three,
    four,
    five,
    verifiedCount,
    openReports,
    unanswered,
  ] = await prisma.$transaction([
    prisma.review.aggregate({ where, _avg: { rating: true }, _count: true }),
    prisma.review.count({ where: { ...where, rating: 1 } }),
    prisma.review.count({ where: { ...where, rating: 2 } }),
    prisma.review.count({ where: { ...where, rating: 3 } }),
    prisma.review.count({ where: { ...where, rating: 4 } }),
    prisma.review.count({ where: { ...where, rating: 5 } }),
    prisma.review.count({ where: { ...where, verifiedPurchase: true } }),
    prisma.report.count({ where: { ...target(kind, id), status: "OPEN" } }),
    prisma.review.count({ where: { ...where, ownerReply: null } }),
  ]);

  return {
    ratingCount: aggregate._count,
    ratingAverage: aggregate._avg.rating,
    verifiedCount,
    distribution: { "1": one, "2": two, "3": three, "4": four, "5": five },
    openReports,
    unansweredReviews: unanswered,
  };
};
