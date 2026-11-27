import { type OrgRole, type Prisma, prisma } from "@4mica/db";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";
import { defaultProjectCreate } from "@utils/default-project";

type Tx = Prisma.TransactionClient;

const ORG_SELECT = {
  id: true,
  handle: true,
  name: true,
  avatarUrl: true,
  personal: true,
  createdAt: true,
  _count: { select: { memberships: true } },
} as const;

type OrgRow = Prisma.OrganizationGetPayload<{ select: typeof ORG_SELECT }>;

export interface OrganizationRow {
  id: string;
  handle: string | null;
  name: string;
  avatarUrl: string | null;
  personal: boolean;
  createdAt: Date;
  memberCount: number;
  role: OrgRole;
}

const toOrganization = (row: OrgRow, role: OrgRole): OrganizationRow => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  avatarUrl: row.avatarUrl,
  personal: row.personal,
  createdAt: row.createdAt,
  memberCount: row._count.memberships,
  role,
});

export const listOrganizationsFor = async (userId: string) => {
  const [memberships, user] = await prisma.$transaction([
    prisma.membership.findMany({
      where: { userId, organization: { deletedAt: null } },
      orderBy: [{ organization: { personal: "desc" } }, { createdAt: "asc" }],
      select: { role: true, organization: { select: ORG_SELECT } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultOrganizationId: true },
    }),
  ]);

  return {
    items: memberships.map((m) => toOrganization(m.organization, m.role)),
    defaultOrganizationId: user?.defaultOrganizationId ?? null,
  };
};

export const getOrganization = async (
  orgId: string,
  userId: string,
): Promise<OrganizationRow | null> => {
  const membership = await prisma.membership.findFirst({
    where: { userId, organization: { id: orgId, deletedAt: null } },
    select: { role: true, organization: { select: ORG_SELECT } },
  });

  return membership
    ? toOrganization(membership.organization, membership.role)
    : null;
};

export const handleTaken = async (
  handle: string,
  exceptOrgId?: string,
): Promise<boolean> => {
  const [org, user] = await prisma.$transaction([
    prisma.organization.findFirst({
      where: {
        handle,
        ...(exceptOrgId ? { id: { not: exceptOrgId } } : {}),
      },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: {
        username: handle,
        ...(exceptOrgId
          ? {
              memberships: {
                none: {
                  organizationId: exceptOrgId,
                  organization: { personal: true },
                },
              },
            }
          : {}),
      },
      select: { id: true },
    }),
  ]);

  return org !== null || user !== null;
};

type AuditFields = Omit<AuditEntry, "orgId" | "action">;

export const createOrganization = (
  userId: string,
  data: { name: string; handle: string },
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: data.name,
        handle: data.handle,
        memberships: { create: { userId, role: "OWNER" } },
        projects: { create: defaultProjectCreate() },
      },
      select: ORG_SELECT,
    });

    await writeAudit(tx, {
      ...meta,
      orgId: org.id,
      action: "org.created",
      targetType: "organization",
      targetId: org.id,
      metadata: { name: data.name, handle: data.handle },
    });

    return toOrganization(org, "OWNER");
  });

export const updateOrganization = (
  orgId: string,
  data: { name?: string; handle?: string },
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: orgId }, data });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "org.updated",
      targetType: "organization",
      targetId: orgId,
      metadata: data,
    });
  });

export const softDeleteOrganization = (orgId: string, meta: AuditFields) =>
  prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.organization.update({
      where: { id: orgId },
      data: { deletedAt: now, handle: null },
    });
    await tx.invitation.updateMany({
      where: { organizationId: orgId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.user.updateMany({
      where: { defaultOrganizationId: orgId },
      data: { defaultOrganizationId: null },
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "org.deleted",
      targetType: "organization",
      targetId: orgId,
    });
  });

const MEMBER_SELECT = {
  role: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      avatarUrl: true,
    },
  },
} as const;

type MemberRow = Prisma.MembershipGetPayload<{ select: typeof MEMBER_SELECT }>;

export const toMember = (row: MemberRow) => ({
  userId: row.user.id,
  name: row.user.name,
  username: row.user.username,
  email: row.user.email,
  avatarUrl: row.user.avatarUrl,
  role: row.role,
  joinedAt: row.createdAt,
});

export type Member = ReturnType<typeof toMember>;

export const listMembers = async (orgId: string): Promise<Member[]> => {
  const rows = await prisma.membership.findMany({
    where: { organizationId: orgId },
    orderBy: [{ createdAt: "asc" }],
    select: MEMBER_SELECT,
  });
  return rows.map(toMember);
};

const lockOwners = async (tx: Tx, orgId: string): Promise<number> => {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "memberships"
    WHERE "organization_id" = ${orgId} AND "role" = 'OWNER'
    FOR UPDATE`;
  return rows.length;
};

const findMember = (tx: Tx, orgId: string, userId: string) =>
  tx.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: MEMBER_SELECT,
  });

export type MembershipChange =
  | { ok: true; member: Member | null }
  | { ok: false; reason: "not_found" | "last_owner" | "owner_only" };

export const changeMemberRole = (
  orgId: string,
  actorRole: OrgRole,
  targetUserId: string,
  role: OrgRole,
  meta: AuditFields,
): Promise<MembershipChange> =>
  prisma.$transaction(async (tx) => {
    const owners = await lockOwners(tx, orgId);
    const current = await findMember(tx, orgId, targetUserId);
    if (!current) {
      return { ok: false, reason: "not_found" };
    }
    if (
      (role === "OWNER" || current.role === "OWNER") &&
      actorRole !== "OWNER"
    ) {
      return { ok: false, reason: "owner_only" };
    }
    if (current.role === "OWNER" && role !== "OWNER" && owners <= 1) {
      return { ok: false, reason: "last_owner" };
    }
    if (current.role === role) {
      return { ok: true, member: toMember(current) };
    }

    const updated = await tx.membership.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: targetUserId },
      },
      data: { role },
      select: MEMBER_SELECT,
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "member.role_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: { from: current.role, to: role },
    });
    return { ok: true, member: toMember(updated) };
  });

export const removeMember = (
  orgId: string,
  actorRole: OrgRole | null,
  targetUserId: string,
  meta: AuditFields & { action: "member.removed" | "member.left" },
): Promise<MembershipChange> =>
  prisma.$transaction(async (tx) => {
    const owners = await lockOwners(tx, orgId);
    const current = await findMember(tx, orgId, targetUserId);
    if (!current) {
      return { ok: false, reason: "not_found" };
    }
    if (
      current.role === "OWNER" &&
      actorRole !== null &&
      actorRole !== "OWNER"
    ) {
      return { ok: false, reason: "owner_only" };
    }
    if (current.role === "OWNER" && owners <= 1) {
      return { ok: false, reason: "last_owner" };
    }

    await tx.membership.delete({
      where: {
        organizationId_userId: { organizationId: orgId, userId: targetUserId },
      },
    });
    await tx.projectMembership.deleteMany({
      where: { userId: targetUserId, project: { organizationId: orgId } },
    });
    await tx.user.updateMany({
      where: { id: targetUserId, defaultOrganizationId: orgId },
      data: { defaultOrganizationId: null },
    });
    const { action, ...rest } = meta;
    await writeAudit(tx, {
      ...rest,
      orgId,
      action,
      targetType: "user",
      targetId: targetUserId,
    });
    return { ok: true, member: null };
  });

export const transferOwnership = (
  orgId: string,
  fromUserId: string,
  toUserId: string,
  meta: AuditFields,
): Promise<MembershipChange> =>
  prisma.$transaction(async (tx) => {
    await lockOwners(tx, orgId);
    const target = await findMember(tx, orgId, toUserId);
    if (!target || toUserId === fromUserId) {
      return { ok: false, reason: "not_found" };
    }

    await tx.membership.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: toUserId },
      },
      data: { role: "OWNER" },
    });
    await tx.membership.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: fromUserId },
      },
      data: { role: "ADMIN" },
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "org.transferred",
      targetType: "user",
      targetId: toUserId,
      metadata: { from: fromUserId, to: toUserId },
    });
    return { ok: true, member: null };
  });

const INVITATION_SELECT = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true } },
} as const;

type InvitationRow = Prisma.InvitationGetPayload<{
  select: typeof INVITATION_SELECT;
}>;

export const toPendingInvitation = (row: InvitationRow, now = new Date()) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  invitedBy: row.invitedBy,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  expired: row.expiresAt.getTime() <= now.getTime(),
});

export type PendingInvitation = ReturnType<typeof toPendingInvitation>;

const OPEN = { acceptedAt: null, declinedAt: null, revokedAt: null } as const;

export const listPendingInvitations = async (orgId: string) => {
  const rows = await prisma.invitation.findMany({
    where: { organizationId: orgId, ...OPEN },
    orderBy: { createdAt: "desc" },
    select: INVITATION_SELECT,
  });
  return rows.map((row) => toPendingInvitation(row));
};

export const existingMemberEmails = async (
  orgId: string,
  emails: string[],
): Promise<Set<string>> => {
  const rows = await prisma.membership.findMany({
    where: {
      organizationId: orgId,
      user: { email: { in: emails, mode: "insensitive" } },
    },
    select: { user: { select: { email: true } } },
  });
  return new Set(
    rows.flatMap((row) =>
      row.user.email ? [row.user.email.toLowerCase()] : [],
    ),
  );
};

export interface NewInvitation {
  email: string;
  tokenHash: string;
}

export const createInvitations = (
  orgId: string,
  invitedById: string,
  role: OrgRole,
  invitations: NewInvitation[],
  expiresAt: Date,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: {
        organizationId: orgId,
        email: { in: invitations.map((i) => i.email) },
        ...OPEN,
      },
      data: { revokedAt: new Date() },
    });

    const created: InvitationRow[] = [];
    for (const invitation of invitations) {
      const row = await tx.invitation.create({
        data: {
          organizationId: orgId,
          invitedById,
          role,
          email: invitation.email,
          tokenHash: invitation.tokenHash,
          expiresAt,
        },
        select: INVITATION_SELECT,
      });
      created.push(row);
      await writeAudit(tx, {
        ...meta,
        orgId,
        action: "member.invited",
        targetType: "invitation",
        targetId: row.id,
        metadata: { email: invitation.email, role },
      });
    }
    return created.map((row) => toPendingInvitation(row));
  });

export const findOpenInvitation = (orgId: string, id: string) =>
  prisma.invitation.findFirst({
    where: { id, organizationId: orgId, ...OPEN },
    select: INVITATION_SELECT,
  });

export const reissueInvitation = async (
  id: string,
  tokenHash: string,
  expiresAt: Date,
) => {
  const row = await prisma.invitation.update({
    where: { id },
    data: { tokenHash, expiresAt },
    select: INVITATION_SELECT,
  });
  return toPendingInvitation(row);
};

export const revokeInvitation = (
  orgId: string,
  id: string,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id, organizationId: orgId, ...OPEN },
      data: { revokedAt: new Date() },
    });
    if (count > 0) {
      await writeAudit(tx, {
        ...meta,
        orgId,
        action: "invitation.revoked",
        targetType: "invitation",
        targetId: id,
      });
    }
    return count > 0;
  });

export const findInvitationByTokenHash = (tokenHash: string) =>
  prisma.invitation.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      declinedAt: true,
      revokedAt: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          handle: true,
          avatarUrl: true,
          deletedAt: true,
        },
      },
      invitedBy: { select: { name: true } },
    },
  });

export type InvitationByToken = NonNullable<
  Awaited<ReturnType<typeof findInvitationByTokenHash>>
>;

export const acceptInvitation = (
  invitation: InvitationByToken,
  userId: string,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, ...OPEN, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (count === 0) {
      return null;
    }

    const existing = await findMember(tx, invitation.organizationId, userId);
    if (!existing) {
      await tx.membership.create({
        data: {
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
        },
      });
      await writeAudit(tx, {
        ...meta,
        orgId: invitation.organizationId,
        action: "member.joined",
        targetType: "user",
        targetId: userId,
        metadata: { invitationId: invitation.id, role: invitation.role },
      });
    }

    const org = await tx.membership.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId,
        },
      },
      select: { role: true, organization: { select: ORG_SELECT } },
    });
    return toOrganization(org.organization, org.role);
  });

export const declineInvitation = async (id: string): Promise<boolean> => {
  const { count } = await prisma.invitation.updateMany({
    where: { id, ...OPEN },
    data: { declinedAt: new Date() },
  });
  return count > 0;
};

export const verifiedEmailOf = (userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
