import { type OrgRole, type Prisma, prisma } from "@4mica/db";
import { writeAudit } from "@controllers/audit/repository";

export const VERIFICATION_PREFIX = "_4mica-verification";
export const VERIFICATION_VALUE_PREFIX = "4mica-verification=";

const DOMAIN_SELECT = {
  id: true,
  domain: true,
  verificationToken: true,
  verifiedAt: true,
  lastCheckedAt: true,
  autoJoin: true,
  autoJoinRole: true,
  createdAt: true,
} as const;

export type DomainRow = Prisma.OrganizationDomainGetPayload<{
  select: typeof DOMAIN_SELECT;
}>;

export const verificationRecord = (row: {
  domain: string;
  verificationToken: string;
}) => ({
  type: "TXT" as const,
  name: `${VERIFICATION_PREFIX}.${row.domain}`,
  value: `${VERIFICATION_VALUE_PREFIX}${row.verificationToken}`,
});

export const toDomain = (row: DomainRow) => ({
  id: row.id,
  domain: row.domain,
  verified: row.verifiedAt !== null,
  verifiedAt: row.verifiedAt,
  verificationRecord: verificationRecord(row),
  autoJoin: row.autoJoin,
  autoJoinRole: row.autoJoinRole,
  lastCheckedAt: row.lastCheckedAt,
  createdAt: row.createdAt,
});

export type Domain = ReturnType<typeof toDomain>;

export const listDomains = async (orgId: string): Promise<Domain[]> => {
  const rows = await prisma.organizationDomain.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    select: DOMAIN_SELECT,
  });
  return rows.map(toDomain);
};

export const findDomain = (orgId: string, id: string) =>
  prisma.organizationDomain.findFirst({
    where: { id, organizationId: orgId },
    select: DOMAIN_SELECT,
  });

export const verifiedElsewhere = async (orgId: string, domain: string) =>
  (await prisma.organizationDomain.findFirst({
    where: {
      domain,
      verifiedAt: { not: null },
      organizationId: { not: orgId },
      organization: { deletedAt: null },
    },
    select: { id: true },
  })) !== null;

export const createDomain = (
  orgId: string,
  userId: string,
  domain: string,
  verificationToken: string,
  db: Prisma.TransactionClient = prisma,
) =>
  db.organizationDomain.create({
    data: {
      organizationId: orgId,
      domain,
      verificationToken,
      createdById: userId,
    },
    select: DOMAIN_SELECT,
  });

export const recordCheck = (
  id: string,
  verified: boolean,
  db: Prisma.TransactionClient = prisma,
) =>
  db.organizationDomain.update({
    where: { id },
    data: {
      lastCheckedAt: new Date(),
      ...(verified ? { verifiedAt: new Date() } : {}),
    },
    select: DOMAIN_SELECT,
  });

export const updateDomain = (
  id: string,
  data: { autoJoin?: boolean; autoJoinRole?: OrgRole },
  db: Prisma.TransactionClient = prisma,
) =>
  db.organizationDomain.update({
    where: { id },
    data,
    select: DOMAIN_SELECT,
  });

export const connectionsOfDomain = (orgId: string, domainId: string) =>
  prisma.ssoConnection.findMany({
    where: { organizationId: orgId, domainId },
    select: { id: true, clerkConnectionId: true },
  });

export const deleteDomain = (
  orgId: string,
  id: string,
  db: Prisma.TransactionClient = prisma,
) =>
  db.organizationDomain.deleteMany({
    where: { id, organizationId: orgId },
  });

export interface JoinCandidate {
  orgId: string;
  role: OrgRole;
  via: "domain" | "sso";
  sourceId: string;
}

export const autoJoinDomains = (domains: string[]) =>
  domains.length === 0
    ? Promise.resolve([])
    : prisma.organizationDomain.findMany({
        where: {
          domain: { in: domains },
          verifiedAt: { not: null },
          autoJoin: true,
          organization: { deletedAt: null, personal: false },
        },
        select: { id: true, organizationId: true, autoJoinRole: true },
      });

export const jitConnections = (clerkConnectionIds: string[]) =>
  clerkConnectionIds.length === 0
    ? Promise.resolve([])
    : prisma.ssoConnection.findMany({
        where: {
          clerkConnectionId: { in: clerkConnectionIds },
          active: true,
          jitProvisioning: true,
          domain: { verifiedAt: { not: null } },
          organization: { deletedAt: null, personal: false },
        },
        select: { id: true, organizationId: true, defaultRole: true },
      });

export const existingMemberships = async (userId: string, orgIds: string[]) =>
  new Set(
    (
      await prisma.membership.findMany({
        where: { userId, organizationId: { in: orgIds } },
        select: { organizationId: true },
      })
    ).map((row) => row.organizationId),
  );

export const joinOrganization = (
  userId: string,
  candidate: JoinCandidate,
  ip: string | null,
) =>
  prisma.$transaction(async (tx) => {
    await tx.membership.create({
      data: {
        organizationId: candidate.orgId,
        userId,
        role: candidate.role,
        source: "DOMAIN",
      },
    });
    await writeAudit(tx, {
      orgId: candidate.orgId,
      actorUserId: userId,
      action: "member.joined",
      targetType: "user",
      targetId: userId,
      metadata: {
        source: "DOMAIN",
        via: candidate.via,
        role: candidate.role,
        ...(candidate.via === "domain"
          ? { domainId: candidate.sourceId }
          : { ssoConnectionId: candidate.sourceId }),
      },
      ip,
    });
  });

export const DEPARTURE_ACTIONS = [
  "member.removed",
  "member.left",
  "member.deprovisioned",
];

export const departedFrom = async (userId: string, orgIds: string[]) =>
  new Set(
    (
      await prisma.auditLog.findMany({
        where: {
          organizationId: { in: orgIds },
          targetType: "user",
          targetId: userId,
          action: { in: DEPARTURE_ACTIONS },
        },
        select: { organizationId: true },
      })
    ).map((row) => row.organizationId),
  );
