import {
  type EnvironmentKind,
  type OrgRole,
  type Prisma,
  type ProjectRole,
  prisma,
} from "@4mica/db";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";
import { environmentsCreate } from "@utils/default-project";
import type { MovableKind } from "./schema";

const PROJECT_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  isDefault: true,
  restricted: true,
  restrictProduction: true,
  archivedAt: true,
  createdAt: true,
  environments: { select: { id: true, kind: true } },
} as const;

export type ProjectRow = Prisma.ProjectGetPayload<{
  select: typeof PROJECT_SELECT;
}> & { members: { role: ProjectRole }[] };

type AuditFields = Omit<AuditEntry, "orgId" | "action">;

const withMember = (userId: string) => ({
  ...PROJECT_SELECT,
  members: { where: { userId }, select: { role: true } },
});

export const listProjects = (
  orgId: string,
  userId: string,
): Promise<ProjectRow[]> =>
  prisma.project.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: withMember(userId),
  });

export const getProject = (
  orgId: string,
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> =>
  prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId, deletedAt: null },
    select: withMember(userId),
  });

export const projectSlugTaken = async (
  orgId: string,
  slug: string,
  exceptId?: string,
): Promise<boolean> => {
  const row = await prisma.project.findFirst({
    where: {
      organizationId: orgId,
      slug,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
};

export const takenProjectSlugs = async (
  orgId: string,
): Promise<Set<string>> => {
  const rows = await prisma.project.findMany({
    where: { organizationId: orgId },
    select: { slug: true },
  });
  return new Set(rows.map((row) => row.slug));
};

export const createProject = (
  orgId: string,
  userId: string,
  orgRole: OrgRole,
  data: {
    name: string;
    slug: string;
    description: string | null;
    restricted: boolean;
  },
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const elevated = orgRole === "OWNER" || orgRole === "ADMIN";
    const project = await tx.project.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        ...data,
        environments: environmentsCreate(),
        ...(elevated ? {} : { members: { create: { userId, role: "ADMIN" } } }),
      },
      select: withMember(userId),
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "project.created",
      targetType: "project",
      targetId: project.id,
      metadata: { name: data.name, slug: data.slug },
    });
    return project;
  });

export const updateProject = (
  orgId: string,
  projectId: string,
  data: Prisma.ProjectUpdateInput,
  action: string,
  meta: AuditFields,
  metadata?: Prisma.InputJsonValue,
) =>
  prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action,
      targetType: "project",
      targetId: projectId,
      ...(metadata === undefined ? {} : { metadata }),
    });
  });

export const projectHasResources = async (
  projectId: string,
): Promise<boolean> => {
  const [agents, listings, keys, webhooks, customers, serviceAccounts] =
    await prisma.$transaction([
      prisma.agent.count({ where: { projectId, deletedAt: null } }),
      prisma.apiListing.count({ where: { projectId, deletedAt: null } }),
      prisma.apiKey.count({ where: { projectId, revokedAt: null } }),
      prisma.webhook.count({ where: { projectId } }),
      prisma.customer.count({ where: { projectId, deletedAt: null } }),
      prisma.serviceAccount.count({ where: { projectId, deletedAt: null } }),
    ]);
  return agents + listings + keys + webhooks + customers + serviceAccounts > 0;
};

export const softDeleteProject = (
  orgId: string,
  projectId: string,
  slug: string,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        deletedAt: new Date(),
        slug: `${slug}-deleted-${projectId.slice(0, 8)}`.slice(0, 64),
      },
    });
    await tx.projectMembership.deleteMany({ where: { projectId } });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "project.deleted",
      targetType: "project",
      targetId: projectId,
      metadata: { slug },
    });
  });

const PROJECT_MEMBER_SELECT = {
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      avatarUrl: true,
      projectMemberships: { select: { projectId: true, role: true } },
    },
  },
} as const;

export const listOrgMembersWithProjectRole = async (
  orgId: string,
  projectId: string,
) => {
  const rows = await prisma.membership.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
    select: {
      ...PROJECT_MEMBER_SELECT,
      user: {
        select: {
          ...PROJECT_MEMBER_SELECT.user.select,
          projectMemberships: {
            where: { projectId },
            select: { role: true },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    userId: row.user.id,
    name: row.user.name,
    username: row.user.username,
    email: row.user.email,
    avatarUrl: row.user.avatarUrl,
    orgRole: row.role,
    projectRole: row.user.projectMemberships[0]?.role ?? null,
  }));
};

export type ProjectMemberRow = Awaited<
  ReturnType<typeof listOrgMembersWithProjectRole>
>[number];

export const findOrgMember = (orgId: string, userId: string) =>
  prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { role: true },
  });

export const setProjectMember = (
  orgId: string,
  projectId: string,
  userId: string,
  role: ProjectRole,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    await tx.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role },
      update: { role },
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "project.member_set",
      targetType: "user",
      targetId: userId,
      metadata: { projectId, role },
    });
  });

export const removeProjectMember = (
  orgId: string,
  projectId: string,
  userId: string,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.projectMembership.deleteMany({
      where: { projectId, userId },
    });
    if (count > 0) {
      await writeAudit(tx, {
        ...meta,
        orgId,
        action: "project.member_removed",
        targetType: "user",
        targetId: userId,
        metadata: { projectId },
      });
    }
    return count > 0;
  });

export interface MoveSource {
  orgId: string;
  projectId: string;
  environmentId: string;
}

export interface MoveTarget {
  projectId: string;
  environmentId: string;
}

const ownedIds = async (
  tx: Prisma.TransactionClient,
  kind: MovableKind,
  source: MoveSource,
  ids: string[],
): Promise<string[]> => {
  const scoped = {
    id: { in: ids },
    organizationId: source.orgId,
    projectId: source.projectId,
  };
  const envScoped = { ...scoped, environmentId: source.environmentId };
  const select = { id: true } as const;

  switch (kind) {
    case "agent":
      return (
        await tx.agent.findMany({
          where: { ...envScoped, deletedAt: null },
          select,
        })
      ).map((row) => row.id);
    case "api_listing":
      return (
        await tx.apiListing.findMany({
          where: { ...envScoped, deletedAt: null },
          select,
        })
      ).map((row) => row.id);
    case "webhook":
      return (await tx.webhook.findMany({ where: envScoped, select })).map(
        (row) => row.id,
      );
    case "customer":
      return (
        await tx.customer.findMany({
          where: { ...scoped, deletedAt: null },
          select,
        })
      ).map((row) => row.id);
  }
};

export const moveResources = (
  kind: MovableKind,
  source: MoveSource,
  target: MoveTarget,
  ids: string[],
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const moved = await ownedIds(tx, kind, source, ids);
    if (moved.length > 0) {
      const where = { id: { in: moved } };
      const placed = {
        projectId: target.projectId,
        environmentId: target.environmentId,
      };

      switch (kind) {
        case "agent":
          await tx.agent.updateMany({ where, data: placed });
          await tx.apiKey.updateMany({
            where: { agentId: { in: moved } },
            data: placed,
          });
          break;
        case "api_listing":
          await tx.apiListing.updateMany({ where, data: placed });
          await tx.apiKey.updateMany({
            where: { listingId: { in: moved } },
            data: placed,
          });
          break;
        case "webhook":
          await tx.webhook.updateMany({ where, data: placed });
          break;
        case "customer":
          await tx.customer.updateMany({
            where,
            data: { projectId: target.projectId },
          });
          break;
      }

      await writeAudit(tx, {
        ...meta,
        orgId: source.orgId,
        action: "project.resources_moved",
        targetType: kind,
        metadata: {
          ids: moved,
          from: source.projectId,
          to: target.projectId,
        },
      });
    }

    const movedSet = new Set(moved);
    return { moved, notFound: ids.filter((id) => !movedSet.has(id)) };
  });

export const environmentOf = (
  project: { environments: { id: string; kind: EnvironmentKind }[] },
  kind: EnvironmentKind,
) => project.environments.find((env) => env.kind === kind) ?? null;
