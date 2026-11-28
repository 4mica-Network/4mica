import { type Prisma, prisma } from "@4mica/db";
import { ASSIGNABLE_PERMISSIONS, type Permission } from "@auth/permissions";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";
import type { CreateRoleInput, UpdateRoleInput } from "./schema";

type AuditFields = Omit<AuditEntry, "orgId" | "action">;

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  permissions: true,
  projectRole: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true } },
} as const satisfies Prisma.CustomRoleSelect;

type RoleRow = Prisma.CustomRoleGetPayload<{ select: typeof ROLE_SELECT }>;

const ASSIGNABLE: ReadonlySet<string> = new Set(ASSIGNABLE_PERMISSIONS);

export const assignablePermissions = (values: readonly string[]) =>
  values.filter((value): value is Permission => ASSIGNABLE.has(value));

export const toRole = (row: RoleRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  permissions: assignablePermissions(row.permissions),
  projectRole: row.projectRole,
  memberCount: row._count.memberships,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export type CustomRole = ReturnType<typeof toRole>;

const live = (orgId: string, id?: string) => ({
  organizationId: orgId,
  deletedAt: null,
  ...(id ? { id } : {}),
});

export const listRoles = async (orgId: string): Promise<CustomRole[]> => {
  const rows = await prisma.customRole.findMany({
    where: live(orgId),
    orderBy: { name: "asc" },
    select: ROLE_SELECT,
  });
  return rows.map(toRole);
};

export const findRole = async (
  orgId: string,
  id: string,
): Promise<CustomRole | null> => {
  const row = await prisma.customRole.findFirst({
    where: live(orgId, id),
    select: ROLE_SELECT,
  });
  return row ? toRole(row) : null;
};

export const createRole = (
  orgId: string,
  userId: string,
  input: CreateRoleInput,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const row = await tx.customRole.create({
      data: { ...input, organizationId: orgId, createdById: userId },
      select: ROLE_SELECT,
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "role.created",
      targetType: "custom_role",
      targetId: row.id,
      metadata: {
        name: row.name,
        permissions: input.permissions,
        projectRole: input.projectRole,
      },
    });
    return toRole(row);
  });

export const updateRole = (
  orgId: string,
  id: string,
  input: UpdateRoleInput,
  meta: AuditFields,
) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.customRole.updateMany({
      where: live(orgId, id),
      data: input,
    });
    if (count === 0) {
      return null;
    }
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "role.updated",
      targetType: "custom_role",
      targetId: id,
      metadata: input,
    });
    const row = await tx.customRole.findFirstOrThrow({
      where: { id },
      select: ROLE_SELECT,
    });
    return toRole(row);
  });

export const deleteRole = (orgId: string, id: string, meta: AuditFields) =>
  prisma.$transaction(async (tx) => {
    const role = await tx.customRole.findFirst({
      where: live(orgId, id),
      select: { id: true, name: true },
    });
    if (!role) {
      return false;
    }
    const members = await tx.membership.updateMany({
      where: { organizationId: orgId, customRoleId: id },
      data: { customRoleId: null, role: "VIEWER" },
    });
    await tx.scimGroup.updateMany({
      where: { organizationId: orgId, customRoleId: id },
      data: { customRoleId: null },
    });
    await tx.customRole.update({
      where: { id },
      data: { deletedAt: new Date(), name: `deleted:${id}` },
    });
    await writeAudit(tx, {
      ...meta,
      orgId,
      action: "role.deleted",
      targetType: "custom_role",
      targetId: id,
      metadata: { name: role.name, members: members.count },
    });
    return true;
  });
