import { prisma } from "@4mica/db";
import { writeAudit } from "@controllers/audit/repository";

const DAY_MS = 86_400_000;

export interface RetentionPolicy {
  organizationId: string;
  auditRetentionDays: number;
}

export const retentionPolicies = async (): Promise<RetentionPolicy[]> => {
  const rows = await prisma.governanceSettings.findMany({
    where: {
      auditRetentionDays: { not: null },
      organization: { deletedAt: null },
    },
    select: { organizationId: true, auditRetentionDays: true },
  });
  return rows.flatMap((row) =>
    row.auditRetentionDays === null
      ? []
      : [
          {
            organizationId: row.organizationId,
            auditRetentionDays: row.auditRetentionDays,
          },
        ],
  );
};

export const cutoffFor = (days: number, now: Date): Date =>
  new Date(now.getTime() - days * DAY_MS);

export const purgeExpiredAuditLogs = (
  policy: RetentionPolicy,
  now: Date,
): Promise<number> =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL fourmica.audit_retention = 'on'`;

    const before = cutoffFor(policy.auditRetentionDays, now);
    const { count } = await tx.auditLog.deleteMany({
      where: {
        organizationId: policy.organizationId,
        createdAt: { lt: before },
      },
    });

    if (count > 0) {
      await writeAudit(tx, {
        orgId: policy.organizationId,
        action: "audit.retention_purged",
        targetType: "organization",
        targetId: policy.organizationId,
        metadata: {
          count,
          retentionDays: policy.auditRetentionDays,
          before: before.toISOString(),
        },
      });
    }

    return count;
  });
