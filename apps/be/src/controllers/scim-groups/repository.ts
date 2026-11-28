import { type OrgRole, prisma } from "@4mica/db";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";

const MAPPING_SELECT = {
  id: true,
  displayName: true,
  externalId: true,
  role: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  customRole: { select: { id: true, name: true, deletedAt: true } },
  _count: { select: { members: true } },
} as const;

type MappingRow = {
  id: string;
  displayName: string;
  externalId: string | null;
  role: OrgRole | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  customRole: { id: string; name: string; deletedAt: Date | null } | null;
  _count: { members: number };
};

export const toScimGroupMapping = ({
  customRole,
  _count,
  ...row
}: MappingRow) => ({
  ...row,
  customRole:
    customRole && customRole.deletedAt === null
      ? { id: customRole.id, name: customRole.name }
      : null,
  memberCount: _count.members,
});

export const listScimGroupMappings = async (orgId: string) =>
  (
    await prisma.scimGroup.findMany({
      where: { organizationId: orgId },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: MAPPING_SELECT,
    })
  ).map(toScimGroupMapping);

export const findScimGroupMapping = (orgId: string, id: string) =>
  prisma.scimGroup.findFirst({
    where: { id, organizationId: orgId },
    select: MAPPING_SELECT,
  });

export const findActiveCustomRole = (orgId: string, id: string) =>
  prisma.customRole.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: { id: true, permissions: true },
  });

export const scimGroupMemberIds = async (groupId: string) =>
  (
    await prisma.scimGroupMember.findMany({
      where: { groupId },
      select: { userId: true },
    })
  ).map((row) => row.userId);

export const updateScimGroupMapping = (
  groupId: string,
  data: { role: OrgRole | null; customRoleId: string | null; priority: number },
  audit: AuditEntry,
) =>
  prisma.$transaction(async (tx) => {
    const row = await tx.scimGroup.update({
      where: { id: groupId },
      data,
      select: MAPPING_SELECT,
    });
    await writeAudit(tx, audit);
    return toScimGroupMapping(row);
  });
