import type { OrgRole, Prisma, ProjectRole } from "@4mica/db";
import { type ProjectAccess, projectInOrNone } from "@utils/scope";
import { type CustomRoleGrant, can, type Permission } from "./permissions";
import {
  accessibleProjectIds,
  seesEveryProject,
  visibleProjectIds,
} from "./project";
import type { Tenant } from "./tenant";

declare const VISIBLE: unique symbol;

export interface Visibility {
  readonly orgId: string;
  readonly userId: string;
  readonly projects: ProjectAccess;
  readonly [VISIBLE]: true;
}

export interface Viewer {
  orgId: string;
  userId: string;
  role: OrgRole;
  custom: CustomRoleGrant | null;
}

export interface LockedAccess {
  viewer: Viewer;
  visibility: Visibility;
}

const visibility = (
  orgId: string,
  userId: string,
  projects: ProjectAccess,
): Visibility => ({ orgId, userId, projects }) as Visibility;

export const visibilityFor = async (
  tenant: Pick<Tenant, "orgId" | "userId" | "role" | "custom">,
): Promise<Visibility> =>
  visibility(tenant.orgId, tenant.userId, await accessibleProjectIds(tenant));

export const visibleWhere = (scope: Visibility) => ({
  organizationId: scope.orgId,
  ...projectInOrNone(scope.projects),
});

export const lockVisibility = async (
  tx: Prisma.TransactionClient,
  scope: Visibility,
  permission: Permission,
): Promise<LockedAccess | null> => {
  const { orgId, userId } = scope;
  const [member] = await tx.$queryRaw<
    { role: OrgRole; customRoleId: string | null; suspended: boolean }[]
  >`SELECT m.role::text AS role, m.custom_role_id AS "customRoleId", m.suspended_at IS NOT NULL AS suspended FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.organization_id = ${orgId} AND m.user_id = ${userId} AND o.deleted_at IS NULL FOR SHARE OF m`;
  if (!member || member.suspended) {
    return null;
  }

  const [custom] = member.customRoleId
    ? await tx.$queryRaw<
        CustomRoleGrant[]
      >`SELECT id, permissions, project_role::text AS "projectRole" FROM custom_roles WHERE id = ${member.customRoleId} AND deleted_at IS NULL FOR SHARE`
    : [];
  const viewer: Viewer = {
    orgId,
    userId,
    role: member.role,
    custom: custom ?? null,
  };
  if (!can(viewer, permission)) {
    return null;
  }
  if (seesEveryProject(viewer)) {
    return { viewer, visibility: visibility(orgId, userId, null) };
  }

  const projects = await tx.$queryRaw<
    { id: string; restricted: boolean }[]
  >`SELECT id, restricted FROM projects WHERE organization_id = ${orgId} FOR SHARE`;
  const roles = await tx.$queryRaw<
    { projectId: string; role: ProjectRole }[]
  >`SELECT project_id AS "projectId", role::text AS role FROM project_memberships WHERE user_id = ${userId} AND project_id IN (SELECT id FROM projects WHERE organization_id = ${orgId}) FOR SHARE`;
  const roleOf = new Map(roles.map((row) => [row.projectId, row.role]));

  return {
    viewer,
    visibility: visibility(
      orgId,
      userId,
      visibleProjectIds(
        viewer,
        projects.map((project) => ({
          ...project,
          role: roleOf.get(project.id) ?? null,
        })),
      ),
    ),
  };
};
