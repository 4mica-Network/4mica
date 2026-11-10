import { type Prisma, prisma } from "@4mica/db";
import type {
  CreateSupportRequestInput,
  ListSupportRequestsQuery,
  UpdateSupportRequestInput,
} from "./schema";

export const SUPPORT_REQUEST_SELECT = {
  id: true,
  number: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  description: true,
  reference: true,
  firstRespondedAt: true,
  resolvedAt: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const SUPPORT_MESSAGE_SELECT = {
  id: true,
  author: true,
  body: true,
  createdAt: true,
} as const;

export type SupportRequestRow = Prisma.SupportRequestGetPayload<{
  select: typeof SUPPORT_REQUEST_SELECT;
}>;

const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] as const;
const DONE_STATUSES = ["RESOLVED", "CLOSED"] as const;
const RESPONSE_SAMPLE_SIZE = 200;

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const referenceNumber = (q: string): number | null => {
  const digits = q.replace(/^#/, "");
  return /^\d{1,9}$/.test(digits) ? Number(digits) : null;
};

const orderFor = (
  sort: ListSupportRequestsQuery["sort"],
): Prisma.SupportRequestOrderByWithRelationInput[] => {
  switch (sort) {
    case "lastActivityAt":
      return [{ lastActivityAt: "asc" }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "-createdAt":
      return [{ createdAt: "desc" }, { id: "desc" }];
    default:
      return [{ lastActivityAt: "desc" }, { id: "desc" }];
  }
};

const whereFor = (
  ownerId: string,
  query: ListSupportRequestsQuery,
): Prisma.SupportRequestWhereInput => {
  const where: Prisma.SupportRequestWhereInput = { ownerId };

  if (query.status) {
    where.status = query.status;
  }
  if (query.category) {
    where.category = query.category;
  }

  if (query.q) {
    const needle = escapeLike(query.q);
    const number = referenceNumber(query.q);
    where.OR = [
      { subject: { contains: needle, mode: "insensitive" } },
      { description: { contains: needle, mode: "insensitive" } },
      { reference: { contains: needle, mode: "insensitive" } },
      ...(number === null ? [] : [{ number }]),
    ];
  }

  return where;
};

export const listSupportRequests = async (
  ownerId: string,
  query: ListSupportRequestsQuery,
): Promise<{
  items: SupportRequestRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const where = whereFor(ownerId, query);
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.supportRequest.findMany({
      where,
      orderBy: orderFor(query.sort),
      skip,
      take: query.limit,
      select: SUPPORT_REQUEST_SELECT,
    }),
    prisma.supportRequest.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
};

export const getSupportRequest = (ownerId: string, id: string) =>
  prisma.supportRequest.findFirst({
    where: { id, ownerId },
    select: {
      ...SUPPORT_REQUEST_SELECT,
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: SUPPORT_MESSAGE_SELECT,
      },
    },
  });

export const createSupportRequest = (
  ownerId: string,
  data: CreateSupportRequestInput,
) =>
  prisma.supportRequest.create({
    data: {
      ownerId,
      subject: data.subject,
      category: data.category,
      priority: data.priority,
      description: data.description,
      reference: data.reference || null,
    },
    select: SUPPORT_REQUEST_SELECT,
  });

export const updateSupportRequest = (
  id: string,
  data: UpdateSupportRequestInput,
  now = new Date(),
) => {
  const { status, reference, ...rest } = data;

  return prisma.supportRequest.update({
    where: { id },
    data: {
      ...rest,
      ...(reference === undefined ? {} : { reference: reference || null }),
      ...(status === "CLOSED" ? { status, resolvedAt: now } : {}),
      ...(status === "OPEN" ? { status, resolvedAt: null } : {}),
      lastActivityAt: now,
    },
    select: SUPPORT_REQUEST_SELECT,
  });
};

export const addCustomerMessage = (
  id: string,
  reopen: boolean,
  body: string,
  now = new Date(),
) =>
  prisma.$transaction(async (tx) => {
    const message = await tx.supportMessage.create({
      data: { requestId: id, author: "CUSTOMER", body },
      select: SUPPORT_MESSAGE_SELECT,
    });

    await tx.supportRequest.update({
      where: { id },
      data: {
        lastActivityAt: now,
        ...(reopen ? { status: "OPEN", resolvedAt: null } : {}),
      },
    });

    return message;
  });

export const deleteSupportRequest = async (
  ownerId: string,
  id: string,
): Promise<boolean> => {
  const { count } = await prisma.supportRequest.deleteMany({
    where: { id, ownerId },
  });
  return count > 0;
};

export const batchDeleteSupportRequests = async (
  ownerId: string,
  ids: string[],
): Promise<{ deleted: string[]; notFound: string[] }> => {
  const owned = await prisma.supportRequest.findMany({
    where: { id: { in: ids }, ownerId },
    select: { id: true },
  });

  const deleted = owned.map((row) => row.id);

  if (deleted.length > 0) {
    await prisma.supportRequest.deleteMany({
      where: { id: { in: deleted }, ownerId },
    });
  }

  const deletedSet = new Set(deleted);
  return {
    deleted,
    notFound: ids.filter((id) => !deletedSet.has(id)),
  };
};

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

export const getSupportStats = async (ownerId: string) => {
  const [active, awaitingYou, resolved, responded] = await prisma.$transaction([
    prisma.supportRequest.count({
      where: { ownerId, status: { in: [...ACTIVE_STATUSES] } },
    }),
    prisma.supportRequest.count({
      where: { ownerId, status: "WAITING_ON_CUSTOMER" },
    }),
    prisma.supportRequest.count({
      where: { ownerId, status: { in: [...DONE_STATUSES] } },
    }),
    prisma.supportRequest.findMany({
      where: { ownerId, firstRespondedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      take: RESPONSE_SAMPLE_SIZE,
      select: { createdAt: true, firstRespondedAt: true },
    }),
  ]);

  const minutes = responded.map((row) =>
    Math.max(
      0,
      Math.round(
        ((row.firstRespondedAt as Date).getTime() - row.createdAt.getTime()) /
          60_000,
      ),
    ),
  );

  return {
    active,
    awaitingYou,
    resolved,
    medianFirstResponseMinutes: median(minutes),
  };
};
