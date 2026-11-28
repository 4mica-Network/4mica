import type { AuthIdentity } from "@4mica/auth";
import { type ProjectRole, prisma } from "@4mica/db";
import { defaultProjectCreate } from "@utils/default-project";
import { isUniqueViolation } from "@utils/prisma-errors";
import type { Tenant } from "./tenant";

const USER_FIELDS = {
  id: true,
  clerkUserId: true,
  email: true,
  name: true,
  avatarUrl: true,
  banned: true,
  locked: true,
  deletedAt: true,
} as const;

export type UserRow = {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  banned: boolean;
  locked: boolean;
  deletedAt: Date | null;
};

export interface UpsertOptions {
  withEmail: boolean;
  username: string;
}

const profileGaps = (
  identity: AuthIdentity,
  existing: UserRow | null,
  withEmail: boolean,
) => ({
  ...(withEmail && identity.email !== null && existing?.email === null
    ? { email: identity.email }
    : {}),
  ...(identity.name !== null && existing !== null && !existing.name
    ? { name: identity.name }
    : {}),
  ...(identity.avatarUrl !== null && existing?.avatarUrl === null
    ? { avatarUrl: identity.avatarUrl }
    : {}),
});

export const findUserByClerkId = (clerkUserId: string) =>
  prisma.user.findUnique({
    where: { clerkUserId },
    select: USER_FIELDS,
  });

export const upsertUser = (
  identity: AuthIdentity,
  existing: UserRow | null,
  { withEmail, username }: UpsertOptions,
): Promise<UserRow> =>
  prisma.user.upsert({
    where: { clerkUserId: identity.clerkUserId },
    create: {
      clerkUserId: identity.clerkUserId,
      username,
      ...(withEmail && identity.email !== null
        ? { email: identity.email }
        : {}),
      ...(identity.name !== null ? { name: identity.name } : {}),
      ...(identity.avatarUrl !== null ? { avatarUrl: identity.avatarUrl } : {}),
      memberships: {
        create: {
          role: "OWNER",
          organization: {
            create: {
              personal: true,
              handle: username,
              ...(identity.name !== null ? { name: identity.name } : {}),
              projects: { create: defaultProjectCreate() },
            },
          },
        },
      },
    },
    update: {
      ...profileGaps(identity, existing, withEmail),
      lastSeenAt: new Date(),
      lastLogin: new Date(),
    },
    select: USER_FIELDS,
  });

export const findApiKeyByHash = (hashedKey: string) =>
  prisma.apiKey.findUnique({
    where: { hashedKey },
    select: {
      id: true,
      organizationId: true,
      listingId: true,
      agentId: true,
      revokedAt: true,
      expiresAt: true,
      projectId: true,
      environmentId: true,
      serviceAccountId: true,
      scopes: true,
      ipAllowlist: true,
      organization: {
        select: {
          deletedAt: true,
          securitySettings: {
            select: { ipAllowlist: true, enforceIpAllowlistForApiKeys: true },
          },
        },
      },
      project: { select: { deletedAt: true, archivedAt: true } },
      environment: { select: { kind: true } },
      serviceAccount: { select: { suspendedAt: true, deletedAt: true } },
      listing: { select: { deletedAt: true } },
      agent: { select: { deletedAt: true } },
    },
  });

export const touchApiKey = (id: string) =>
  prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });

const MEMBERSHIP_SELECT = {
  role: true,
  suspendedAt: true,
  customRole: {
    select: { id: true, permissions: true, projectRole: true, deletedAt: true },
  },
  organization: { select: { id: true, personal: true } },
} as const;

const toTenant = (
  userId: string,
  row: {
    role: Tenant["role"];
    suspendedAt?: Date | null;
    customRole?: {
      id: string;
      permissions: string[];
      projectRole: ProjectRole;
      deletedAt: Date | null;
    } | null;
    organization: { id: string; personal: boolean };
  },
): Tenant => ({
  orgId: row.organization.id,
  userId,
  role: row.role,
  personal: row.organization.personal,
  custom:
    row.customRole && row.customRole.deletedAt === null
      ? {
          id: row.customRole.id,
          permissions: row.customRole.permissions,
          projectRole: row.customRole.projectRole,
        }
      : null,
  suspended: Boolean(row.suspendedAt),
});

export const findMembership = async (
  userId: string,
  orgId: string | null,
): Promise<Tenant | null> => {
  const row = await prisma.membership.findFirst({
    where: {
      userId,
      organization:
        orgId === null
          ? {
              deletedAt: null,
              OR: [
                { defaultFor: { some: { id: userId } } },
                { personal: true },
              ],
            }
          : { id: orgId, deletedAt: null },
    },
    orderBy: { organization: { personal: "asc" } },
    select: MEMBERSHIP_SELECT,
  });

  return row ? toTenant(userId, row) : null;
};

export const ensurePersonalOrganization = async (
  userId: string,
): Promise<Tenant | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, name: true },
  });
  if (!user) {
    return null;
  }

  const create = (handle: string | null) =>
    prisma.membership.create({
      data: {
        role: "OWNER",
        user: { connect: { id: userId } },
        organization: {
          create: {
            personal: true,
            handle,
            name: user.name,
            projects: { create: defaultProjectCreate() },
          },
        },
      },
      select: MEMBERSHIP_SELECT,
    });

  try {
    return toTenant(userId, await create(user.username));
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    return toTenant(userId, await create(null));
  }
};

export const findCliSessionByHash = (hashedToken: string) =>
  prisma.cliSession.findUnique({
    where: { hashedToken },
    select: {
      id: true,
      kind: true,
      name: true,
      scopes: true,
      organizationId: true,
      mfaVerified: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
      user: { select: USER_FIELDS },
    },
  });

export const CLI_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export const touchCliSession = async (
  id: string,
  lastUsedAt: Date | null,
): Promise<void> => {
  const now = Date.now();
  if (lastUsedAt && now - lastUsedAt.getTime() < CLI_TOUCH_INTERVAL_MS) {
    return;
  }

  await prisma.cliSession.updateMany({
    where: {
      id,
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lt: new Date(now - CLI_TOUCH_INTERVAL_MS) } },
      ],
    },
    data: { lastUsedAt: new Date(now) },
  });
};

export const findProjectForMember = (
  orgId: string,
  userId: string,
  projectId: string | undefined,
) =>
  prisma.project.findFirst({
    where: {
      organizationId: orgId,
      deletedAt: null,
      ...(projectId ? { id: projectId } : { isDefault: true }),
    },
    select: {
      id: true,
      slug: true,
      isDefault: true,
      restricted: true,
      restrictProduction: true,
      archivedAt: true,
      members: { where: { userId }, select: { role: true } },
      environments: { select: { id: true, kind: true } },
    },
  });
