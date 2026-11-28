import { type Prisma, prisma } from "@4mica/db";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";
import type { UpdateStreamInput } from "./schema";

type AuditFields = Omit<AuditEntry, "orgId" | "action">;

export const STREAM_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  url: true,
  status: true,
  secretVersion: true,
  actionPrefixes: true,
  lastDeliveryAt: true,
  lastStatusCode: true,
  lastError: true,
  consecutiveFailures: true,
  nextAttemptAt: true,
  createdAt: true,
} as const satisfies Prisma.AuditStreamSelect;

export type StreamRow = Prisma.AuditStreamGetPayload<{
  select: typeof STREAM_SELECT;
}>;

const live = (orgId: string, id?: string) => ({
  organizationId: orgId,
  deletedAt: null,
  ...(id ? { id } : {}),
});

export const listStreams = (orgId: string) =>
  prisma.auditStream.findMany({
    where: live(orgId),
    orderBy: { createdAt: "asc" },
    select: STREAM_SELECT,
  });

export const countStreams = (orgId: string) =>
  prisma.auditStream.count({ where: live(orgId) });

export const findStream = (orgId: string, id: string) =>
  prisma.auditStream.findFirst({
    where: live(orgId, id),
    select: STREAM_SELECT,
  });

export const startingCursor = async (
  orgId: string,
  backfillFrom: Date | undefined,
): Promise<string | null> => {
  const row = await prisma.auditLog.findFirst({
    where: {
      organizationId: orgId,
      ...(backfillFrom ? { createdAt: { lt: backfillFrom } } : {}),
    },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
};

export const createStream = (
  orgId: string,
  userId: string,
  data: {
    name: string;
    url: string;
    actionPrefixes: string[];
    cursorId: string | null;
  },
  meta: AuditFields,
  backfillFrom: Date | undefined,
) =>
  prisma.$transaction(async (tx) => {
    const row = await tx.auditStream.create({
      data: {
        ...data,
        organizationId: orgId,
        createdById: userId,
        nextAttemptAt: new Date(),
      },
      select: STREAM_SELECT,
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "audit_stream.created",
      targetType: "audit_stream",
      targetId: row.id,
      metadata: {
        name: data.name,
        host: new URL(data.url).host,
        actionPrefixes: data.actionPrefixes,
        backfillFrom: backfillFrom?.toISOString() ?? null,
      },
    });
    return row;
  });

const change = (
  orgId: string,
  id: string,
  data: Prisma.AuditStreamUpdateManyMutationInput,
  action: string,
  metadata: Prisma.InputJsonValue | undefined,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.auditStream.updateMany({
      where: live(orgId, id),
      data,
    });
    if (count === 0) {
      return null;
    }
    await writeAudit(tx, {
      ...meta,
      orgId,
      action,
      targetType: "audit_stream",
      targetId: id,
      ...(metadata === undefined ? {} : { metadata }),
    });
    return tx.auditStream.findFirst({
      where: { id },
      select: STREAM_SELECT,
    });
  });

export const updateStream = (
  orgId: string,
  id: string,
  input: UpdateStreamInput,
  meta: AuditFields,
) =>
  change(
    orgId,
    id,
    input,
    "audit_stream.updated",
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.url !== undefined ? { host: new URL(input.url).host } : {}),
      ...(input.actionPrefixes !== undefined
        ? { actionPrefixes: input.actionPrefixes }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    meta,
  );

export const rotateStreamSecret = (
  orgId: string,
  id: string,
  meta: AuditFields,
) =>
  change(
    orgId,
    id,
    { secretVersion: { increment: 1 } },
    "audit_stream.secret_rotated",
    undefined,
    meta,
  );

export const resumeStream = (orgId: string, id: string, meta: AuditFields) =>
  change(
    orgId,
    id,
    { status: "ACTIVE", consecutiveFailures: 0, nextAttemptAt: new Date() },
    "audit_stream.resumed",
    undefined,
    meta,
  );

export const deleteStream = async (
  orgId: string,
  id: string,
  meta: AuditFields,
): Promise<boolean> =>
  (await change(
    orgId,
    id,
    { deletedAt: new Date(), status: "PAUSED", nextAttemptAt: null },
    "audit_stream.deleted",
    undefined,
    meta,
  )) !== null;
