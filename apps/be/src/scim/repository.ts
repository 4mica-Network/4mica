import { type OrgRole, type Prisma, prisma } from "@4mica/db";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";

export const findScimTokenByHash = (hashedToken: string) =>
  prisma.scimToken.findUnique({
    where: { hashedToken },
    select: {
      id: true,
      organizationId: true,
      revokedAt: true,
      lastUsedAt: true,
      organization: { select: { deletedAt: true, personal: true } },
    },
  });

export const touchScimToken = (id: string) =>
  prisma.scimToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
    select: { id: true },
  });

const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  customRoleId: true,
  source: true,
  scimExternalId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true, name: true } },
} as const;

export type MemberRow = Prisma.MembershipGetPayload<{
  select: typeof MEMBER_SELECT;
}>;

export type MemberWhere = Prisma.MembershipWhereInput[];

export const listMembers = async (
  orgId: string,
  and: MemberWhere,
  skip: number,
  take: number,
): Promise<{ total: number; rows: MemberRow[] }> => {
  const where = { organizationId: orgId, AND: and };
  const [total, rows] = await Promise.all([
    prisma.membership.count({ where }),
    take > 0
      ? prisma.membership.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip,
          take,
          select: MEMBER_SELECT,
        })
      : Promise.resolve([]),
  ]);
  return { total, rows };
};

export const findMember = (orgId: string, userId: string) =>
  prisma.membership.findFirst({
    where: { organizationId: orgId, userId },
    select: MEMBER_SELECT,
  });

export const findMemberByEmail = (orgId: string, email: string) =>
  prisma.membership.findFirst({
    where: {
      organizationId: orgId,
      user: { email: { equals: email, mode: "insensitive" } },
    },
    select: MEMBER_SELECT,
  });

export const findUser = (id: string) =>
  prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

export const groupsOfUsers = async (
  orgId: string,
  userIds: string[],
): Promise<Map<string, { id: string; displayName: string }[]>> => {
  const byUser = new Map<string, { id: string; displayName: string }[]>();
  if (userIds.length === 0) {
    return byUser;
  }
  const rows = await prisma.scimGroupMember.findMany({
    where: { userId: { in: userIds }, group: { organizationId: orgId } },
    select: {
      userId: true,
      group: { select: { id: true, displayName: true } },
    },
  });
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.group]);
  }
  return byUser;
};

export const USER_LIFECYCLE_ACTIONS = [
  "scim.user.created",
  "scim.user.reactivated",
  "scim.user.deactivated",
  "scim.user.deleted",
] as const;

export const lastLifecycleEvent = (orgId: string, userId: string) =>
  prisma.auditLog.findFirst({
    where: {
      organizationId: orgId,
      targetType: "user",
      targetId: userId,
      action: { in: [...USER_LIFECYCLE_ACTIONS] },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, metadata: true, createdAt: true },
  });

export interface MembershipGrant {
  role: OrgRole;
  customRoleId: string | null;
}

export const createScimMembership = (
  orgId: string,
  userId: string,
  externalId: string | null,
  grant: MembershipGrant,
  audit: Omit<AuditEntry, "orgId">,
) =>
  prisma.$transaction(async (tx) => {
    const created = await tx.membership.create({
      data: {
        organizationId: orgId,
        userId,
        role: grant.role,
        customRoleId: grant.customRoleId,
        source: "SCIM",
        scimExternalId: externalId,
      },
      select: MEMBER_SELECT,
    });
    await writeAudit(tx, { ...audit, orgId });
    return created;
  });

export const updateMember = (
  membershipId: string,
  data: {
    scimExternalId?: string | null;
    role?: OrgRole;
    customRoleId?: string | null;
  },
  audit: AuditEntry,
) =>
  prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({
      where: { id: membershipId },
      data,
      select: MEMBER_SELECT,
    });
    await writeAudit(tx, audit);
    return updated;
  });

export const deprovisionMember = (
  orgId: string,
  userId: string,
  options: { forgetGroups: boolean },
  audit: Omit<AuditEntry, "orgId">,
) =>
  prisma.$transaction(async (tx) => {
    const removed = await tx.membership.deleteMany({
      where: { organizationId: orgId, userId, role: { not: "OWNER" } },
    });
    await tx.projectMembership.deleteMany({
      where: { userId, project: { organizationId: orgId } },
    });
    const sessions = await tx.cliSession.updateMany({
      where: { userId, organizationId: orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.user.updateMany({
      where: { id: userId, defaultOrganizationId: orgId },
      data: { defaultOrganizationId: null },
    });
    if (options.forgetGroups) {
      await tx.scimGroupMember.deleteMany({
        where: { userId, group: { organizationId: orgId } },
      });
    }
    const metadata = {
      ...(audit.metadata as Record<string, Prisma.InputJsonValue>),
      removedMembership: removed.count > 0,
      revokedCliSessions: sessions.count,
    };
    await writeAudit(tx, { ...audit, orgId, metadata });
    await writeAudit(tx, {
      ...audit,
      orgId,
      action: "member.deprovisioned",
      targetType: "user",
      targetId: userId,
      metadata: { ...metadata, source: "SCIM", scimAction: audit.action },
    });
    return { revokedCliSessions: sessions.count };
  });

export const isVerifiedDomain = async (orgId: string, domain: string) =>
  (await prisma.organizationDomain.findFirst({
    where: { organizationId: orgId, domain, verifiedAt: { not: null } },
    select: { id: true },
  })) !== null;

export const mappedGroupsOf = (orgId: string, userId: string) =>
  prisma.scimGroupMember.findMany({
    where: { userId, group: { organizationId: orgId } },
    select: {
      group: {
        select: {
          id: true,
          role: true,
          customRoleId: true,
          priority: true,
          createdAt: true,
          customRole: { select: { deletedAt: true } },
        },
      },
    },
  });

export const findCustomRole = (orgId: string, id: string) =>
  prisma.customRole.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: { id: true, name: true },
  });

export const GROUP_SELECT = {
  id: true,
  displayName: true,
  externalId: true,
  role: true,
  customRoleId: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  customRole: { select: { id: true, name: true, deletedAt: true } },
} as const;

export type GroupRow = Prisma.ScimGroupGetPayload<{
  select: typeof GROUP_SELECT;
}>;

export type GroupWhere = Prisma.ScimGroupWhereInput[];

export const listGroups = async (
  orgId: string,
  and: GroupWhere,
  skip: number,
  take: number,
): Promise<{ total: number; rows: GroupRow[] }> => {
  const where = { organizationId: orgId, AND: and };
  const [total, rows] = await Promise.all([
    prisma.scimGroup.count({ where }),
    take > 0
      ? prisma.scimGroup.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip,
          take,
          select: GROUP_SELECT,
        })
      : Promise.resolve([]),
  ]);
  return { total, rows };
};

export const findGroup = (orgId: string, id: string) =>
  prisma.scimGroup.findFirst({
    where: { id, organizationId: orgId },
    select: GROUP_SELECT,
  });

export const membersOfGroups = async (
  groupIds: string[],
): Promise<Map<string, { id: string; display: string | null }[]>> => {
  const byGroup = new Map<string, { id: string; display: string | null }[]>();
  if (groupIds.length === 0) {
    return byGroup;
  }
  const rows = await prisma.scimGroupMember.findMany({
    where: { groupId: { in: groupIds } },
    orderBy: { createdAt: "asc" },
    select: {
      groupId: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  });
  for (const row of rows) {
    byGroup.set(row.groupId, [
      ...(byGroup.get(row.groupId) ?? []),
      { id: row.userId, display: row.user.name || row.user.email },
    ]);
  }
  return byGroup;
};

export const groupMemberIds = async (groupId: string): Promise<string[]> =>
  (
    await prisma.scimGroupMember.findMany({
      where: { groupId },
      select: { userId: true },
    })
  ).map((row) => row.userId);

export const orgMemberIds = async (
  orgId: string,
  userIds: string[],
): Promise<string[]> =>
  userIds.length === 0
    ? []
    : (
        await prisma.membership.findMany({
          where: { organizationId: orgId, userId: { in: userIds } },
          select: { userId: true },
        })
      ).map((row) => row.userId);

export const createGroup = (
  orgId: string,
  data: { displayName: string; externalId: string | null },
  memberIds: string[],
  audit: Omit<AuditEntry, "orgId" | "targetId">,
) =>
  prisma.$transaction(async (tx) => {
    const group = await tx.scimGroup.create({
      data: { organizationId: orgId, ...data },
      select: GROUP_SELECT,
    });
    if (memberIds.length > 0) {
      await tx.scimGroupMember.createMany({
        data: memberIds.map((userId) => ({ groupId: group.id, userId })),
        skipDuplicates: true,
      });
    }
    await writeAudit(tx, { ...audit, orgId, targetId: group.id });
    return group;
  });

export interface GroupChange {
  displayName?: string;
  externalId?: string | null;
  add: string[];
  remove: string[];
  replaceMembers: string[] | null;
}

export const applyGroupChange = (
  groupId: string,
  change: GroupChange,
  audit: AuditEntry,
) =>
  prisma.$transaction(async (tx) => {
    const data = {
      ...(change.displayName !== undefined
        ? { displayName: change.displayName }
        : {}),
      ...(change.externalId !== undefined
        ? { externalId: change.externalId }
        : {}),
    };
    const group = await tx.scimGroup.update({
      where: { id: groupId },
      data,
      select: GROUP_SELECT,
    });
    if (change.replaceMembers !== null) {
      await tx.scimGroupMember.deleteMany({
        where: { groupId, userId: { notIn: change.replaceMembers } },
      });
    }
    if (change.remove.length > 0) {
      await tx.scimGroupMember.deleteMany({
        where: { groupId, userId: { in: change.remove } },
      });
    }
    const add = [...(change.replaceMembers ?? []), ...change.add];
    if (add.length > 0) {
      await tx.scimGroupMember.createMany({
        data: add.map((userId) => ({ groupId, userId })),
        skipDuplicates: true,
      });
    }
    await writeAudit(tx, audit);
    return group;
  });

export const deleteGroup = (groupId: string, audit: AuditEntry) =>
  prisma.$transaction(async (tx) => {
    await tx.scimGroup.delete({ where: { id: groupId } });
    await writeAudit(tx, audit);
  });

export const recordAudit = (entry: AuditEntry) => writeAudit(prisma, entry);

export const findIdentity = (userId: string) =>
  prisma.user.findFirst({
    where: { id: userId },
    select: { email: true, clerkUserId: true },
  });
