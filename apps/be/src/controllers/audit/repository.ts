import { Prisma, prisma } from "@4mica/db";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export interface AuditEntry {
  orgId: string;
  projectId?: string | null;
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
      projectId: entry.projectId ?? null,
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

export interface AuditLogFilters {
  from?: Date;
  to?: Date;
  action?: string;
  actionPrefix?: string;
  actorUserId?: string;
  actorApiKeyId?: string;
  targetType?: string;
  targetId?: string;
  projectId?: string;
  q?: string;
}

export interface ListAuditLogsQuery extends AuditLogFilters {
  limit: number;
  cursor?: string;
}

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

export const auditLogWhere = (
  orgId: string,
  filters: AuditLogFilters,
): Prisma.Sql => {
  const clauses: Prisma.Sql[] = [Prisma.sql`l.organization_id = ${orgId}`];

  if (filters.from) {
    clauses.push(Prisma.sql`l.created_at >= ${filters.from}`);
  }
  if (filters.to) {
    clauses.push(Prisma.sql`l.created_at < ${filters.to}`);
  }
  if (filters.action) {
    clauses.push(Prisma.sql`l.action = ${filters.action}`);
  }
  if (filters.actionPrefix) {
    clauses.push(
      Prisma.sql`l.action LIKE ${`${escapeLike(filters.actionPrefix)}%`}`,
    );
  }
  if (filters.actorUserId) {
    clauses.push(Prisma.sql`l.actor_user_id = ${filters.actorUserId}`);
  }
  if (filters.actorApiKeyId) {
    clauses.push(Prisma.sql`l.actor_api_key_id = ${filters.actorApiKeyId}`);
  }
  if (filters.targetType) {
    clauses.push(Prisma.sql`l.target_type = ${filters.targetType}`);
  }
  if (filters.targetId) {
    clauses.push(Prisma.sql`l.target_id = ${filters.targetId}`);
  }
  if (filters.projectId) {
    clauses.push(Prisma.sql`l.project_id = ${filters.projectId}`);
  }
  if (filters.q) {
    const needle = `%${escapeLike(filters.q)}%`;
    clauses.push(Prisma.sql`(
      l.action ILIKE ${needle}
      OR l.target_id ILIKE ${needle}
      OR l.metadata::text ILIKE ${needle}
    )`);
  }

  return Prisma.join(clauses, " AND ");
};

const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  projectId: true,
  targetType: true,
  targetId: true,
  metadata: true,
  ip: true,
  createdAt: true,
  actorApiKeyId: true,
  actor: {
    select: { id: true, name: true, username: true, avatarUrl: true },
  },
} satisfies Prisma.AuditLogSelect;

export const listAuditLogs = async (
  orgId: string,
  { limit, cursor, ...filters }: ListAuditLogsQuery,
) => {
  const after = cursor ? Prisma.sql`AND l.id < ${cursor}` : Prisma.empty;
  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT l.id
      FROM audit_logs l
     WHERE ${auditLogWhere(orgId, filters)} ${after}
     ORDER BY l.id DESC
     LIMIT ${limit + 1}
  `;

  const page = ids.slice(0, limit).map((row) => row.id);
  const items =
    page.length === 0
      ? []
      : await prisma.auditLog.findMany({
          where: { organizationId: orgId, id: { in: page } },
          orderBy: { id: "desc" },
          select: AUDIT_LOG_SELECT,
        });

  return {
    items,
    nextCursor: ids.length > limit ? (page.at(-1) ?? null) : null,
  };
};

export const AUDIT_EXPORT_HEADER = [
  "id",
  "created_at",
  "action",
  "actor_user_id",
  "actor_name",
  "actor_api_key_id",
  "project_id",
  "target_type",
  "target_id",
  "ip",
  "metadata",
] as const;

interface AuditExportRow {
  id: string;
  created_at: Date;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_api_key_id: string | null;
  project_id: string | null;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  metadata: Prisma.JsonValue | null;
}

const AUDIT_EXPORT_PAGE = 5_000;

export const exportAuditLogs = async (
  orgId: string,
  filters: AuditLogFilters,
  limit: number,
): Promise<{ rows: (string | null)[][]; truncated: boolean }> => {
  const rows: (string | null)[][] = [];
  const where = auditLogWhere(orgId, filters);
  let cursor: string | undefined;

  while (rows.length <= limit) {
    const after = cursor ? Prisma.sql`AND l.id < ${cursor}` : Prisma.empty;
    const take = Math.min(AUDIT_EXPORT_PAGE, limit + 1 - rows.length);
    const page = await prisma.$queryRaw<AuditExportRow[]>`
      SELECT l.id,
             l.created_at,
             l.action,
             l.actor_user_id,
             u.name AS actor_name,
             l.actor_api_key_id,
             l.project_id,
             l.target_type,
             l.target_id,
             l.ip,
             l.metadata
        FROM audit_logs l
        LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE ${where} ${after}
       ORDER BY l.id DESC
       LIMIT ${take}
    `;

    for (const row of page) {
      rows.push([
        row.id,
        row.created_at.toISOString(),
        row.action,
        row.actor_user_id,
        row.actor_name,
        row.actor_api_key_id,
        row.project_id,
        row.target_type,
        row.target_id,
        row.ip,
        row.metadata === null ? null : JSON.stringify(row.metadata),
      ]);
    }

    if (page.length < take) {
      break;
    }
    cursor = page.at(-1)?.id;
  }

  const truncated = rows.length > limit;
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated };
};
