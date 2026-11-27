import { prisma } from "@4mica/db";
import { writeAudit } from "@controllers/audit/repository";
import type { AuditEventRow } from "@controllers/audit-streams/delivery";

export const STREAMS_PER_RUN = 100;
export const EVENTS_PER_DELIVERY = 500;

export interface DueStream {
  id: string;
  organizationId: string;
  url: string;
  secretVersion: number;
  actionPrefixes: string[];
  cursorId: string | null;
  consecutiveFailures: number;
}

export const dueStreams = (now: Date): Promise<DueStream[]> =>
  prisma.auditStream.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ACTIVE", "FAILING"] },
      organization: { deletedAt: null },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: STREAMS_PER_RUN,
    select: {
      id: true,
      organizationId: true,
      url: true,
      secretVersion: true,
      actionPrefixes: true,
      cursorId: true,
      consecutiveFailures: true,
    },
  });

export const pendingEvents = (stream: DueStream): Promise<AuditEventRow[]> =>
  prisma.auditLog.findMany({
    where: {
      organizationId: stream.organizationId,
      ...(stream.cursorId ? { id: { gt: stream.cursorId } } : {}),
      ...(stream.actionPrefixes.length > 0
        ? {
            OR: stream.actionPrefixes.map((prefix) => ({
              action: { startsWith: prefix },
            })),
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: EVENTS_PER_DELIVERY,
    select: {
      id: true,
      organizationId: true,
      projectId: true,
      actorUserId: true,
      actorApiKeyId: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      ip: true,
      createdAt: true,
    },
  });

export const recordSuccess = (
  stream: DueStream,
  cursorId: string,
  statusCode: number | null,
  now: Date,
) =>
  prisma.auditStream.updateMany({
    where: { id: stream.id, deletedAt: null },
    data: {
      cursorId,
      status: "ACTIVE",
      consecutiveFailures: 0,
      lastDeliveryAt: now,
      lastStatusCode: statusCode,
      lastError: null,
      nextAttemptAt: null,
    },
  });

export const recordFailure = (
  stream: DueStream,
  failure: {
    statusCode: number | null;
    error: string | null;
    failures: number;
    pause: boolean;
    nextAttemptAt: Date | null;
  },
) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.auditStream.updateMany({
      where: {
        id: stream.id,
        deletedAt: null,
        status: { in: ["ACTIVE", "FAILING"] },
      },
      data: {
        status: failure.pause ? "PAUSED" : "FAILING",
        consecutiveFailures: failure.failures,
        lastStatusCode: failure.statusCode,
        lastError: failure.error,
        nextAttemptAt: failure.nextAttemptAt,
      },
    });
    if (count > 0 && failure.pause) {
      await writeAudit(tx, {
        orgId: stream.organizationId,
        action: "audit_stream.paused",
        targetType: "audit_stream",
        targetId: stream.id,
        metadata: {
          consecutiveFailures: failure.failures,
          lastStatusCode: failure.statusCode,
          lastError: failure.error,
        },
      });
    }
  });
