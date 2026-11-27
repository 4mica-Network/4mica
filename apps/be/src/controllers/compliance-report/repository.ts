import { prisma } from "@4mica/db";
import { findSecuritySettings } from "@controllers/security/repository";

const DAY_MS = 86_400_000;

export const complianceSnapshot = async (orgId: string, now: Date) => {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [
    organization,
    memberships,
    customRoles,
    projects,
    apiKeys,
    cliSessions,
    scimTokens,
    ssoConnections,
    policies,
    governance,
    approvals,
    streams,
    security,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, handle: true, personal: true },
    }),
    prisma.membership.findMany({
      where: { organizationId: orgId },
      select: {
        role: true,
        suspendedAt: true,
        customRole: { select: { id: true, name: true, deletedAt: true } },
        user: { select: { id: true, clerkUserId: true } },
      },
    }),
    prisma.customRole.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        permissions: true,
        projectRole: true,
        _count: { select: { memberships: true } },
      },
    }),
    prisma.project.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        OR: [{ restricted: true }, { restrictProduction: true }],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        restricted: true,
        restrictProduction: true,
      },
    }),
    prisma.apiKey.findMany({
      where: {
        organizationId: orgId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        project: { deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        ipAllowlist: true,
        environment: { select: { kind: true } },
        serviceAccount: { select: { id: true, name: true } },
      },
    }),
    prisma.cliSession.count({
      where: {
        organizationId: orgId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    }),
    prisma.scimToken.count({
      where: { organizationId: orgId, revokedAt: null },
    }),
    prisma.ssoConnection.findMany({
      where: { organizationId: orgId },
      select: {
        clerkConnectionId: true,
        active: true,
        enforced: true,
      },
    }),
    prisma.spendingPolicy.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { enabled: true, mode: true, frozenAt: true },
    }),
    prisma.governanceSettings.findUnique({
      where: { organizationId: orgId },
      select: {
        approvalsRequired: true,
        governedActions: true,
        auditRetentionDays: true,
      },
    }),
    prisma.approvalRequest.groupBy({
      by: ["status"],
      where: { organizationId: orgId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditStream.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { status: true },
    }),
    findSecuritySettings(orgId),
  ]);

  return {
    organization,
    memberships,
    customRoles,
    projects,
    apiKeys,
    cliSessions,
    scimTokens,
    ssoConnections,
    policies,
    governance,
    approvals,
    streams,
    security,
  };
};

export type ComplianceSnapshot = Awaited<ReturnType<typeof complianceSnapshot>>;
