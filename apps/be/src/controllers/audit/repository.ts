import { type Prisma, prisma } from "@4mica/db";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export interface AuditEntry {
  orgId: string;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

export const writeAudit = (db: Db, entry: AuditEntry) =>
  db.auditLog.create({
    data: {
      organizationId: entry.orgId,
      actorUserId: entry.actorUserId ?? null,
      actorApiKeyId: entry.actorApiKeyId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
      ip: entry.ip ?? null,
    },
    select: { id: true },
  });

export interface ListAuditLogsQuery {
  limit: number;
  cursor?: string;
  action?: string;
}

export const listAuditLogs = async (
  orgId: string,
  { limit, cursor, action }: ListAuditLogsQuery,
) => {
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: orgId,
      ...(action ? { action } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      ip: true,
      createdAt: true,
      actorApiKeyId: true,
      actor: {
        select: { id: true, name: true, username: true, avatarUrl: true },
      },
    },
  });

  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
  };
};
