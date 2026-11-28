import { requireRecentAuth } from "@auth/security";
import { requireApproval } from "@controllers/approvals/gate";
import { GOVERNED_ROLES } from "@controllers/organizations/schema";
import { holdsGovernedPermission } from "@controllers/roles/grants";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { RouteHandler } from "fastify";
import { syncRoles } from "@/scim/provisioning";
import {
  findActiveCustomRole,
  findScimGroupMapping,
  listScimGroupMappings,
  scimGroupMemberIds,
  updateScimGroupMapping,
} from "./repository";
import { UpdateScimGroupSchema } from "./schema";

export const listScimGroupsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }
  return reply.send({ items: await listScimGroupMappings(tenant.orgId) });
};

export const updateScimGroupHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateScimGroupSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await findScimGroupMapping(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "SCIM group");
  }

  const input = parsed.data;
  const customRole = input.customRoleId
    ? await findActiveCustomRole(tenant.orgId, input.customRoleId)
    : null;
  if (input.customRoleId && !customRole) {
    return notFound(reply, "custom role");
  }

  const liveCustomRoleId =
    current.customRole && current.customRole.deletedAt === null
      ? current.customRole.id
      : null;
  const next = {
    role: input.customRoleId
      ? null
      : input.role !== undefined
        ? input.role
        : current.role,
    customRoleId: input.role
      ? null
      : input.customRoleId !== undefined
        ? input.customRoleId
        : liveCustomRoleId,
    priority: input.priority ?? current.priority,
  };

  const grantsSensitiveRole =
    (next.role !== null &&
      next.role !== current.role &&
      GOVERNED_ROLES.includes(next.role)) ||
    (customRole !== null &&
      next.customRoleId !== liveCustomRoleId &&
      holdsGovernedPermission(customRole.permissions));

  if (grantsSensitiveRole) {
    if (!(await requireRecentAuth(request, reply, tenant))) {
      return reply;
    }
    const gate = await requireApproval(
      request,
      reply,
      { orgId: tenant.orgId, userId: tenant.userId },
      "member.role_grant",
      {
        kind: "scim_group_mapping",
        groupId: id,
        role: next.role,
        customRoleId: next.customRoleId,
        priority: next.priority,
      },
      `Map SCIM group ${current.displayName} to ${next.role ?? "a custom role"}`,
    );
    if (!gate.proceed) {
      return reply;
    }
  }

  const updated = await updateScimGroupMapping(id, next, {
    orgId: tenant.orgId,
    actorUserId: tenant.userId,
    ip: request.ip,
    action: "scim_group.mapping_updated",
    targetType: "scim_group",
    targetId: id,
    metadata: {
      displayName: current.displayName,
      from: {
        role: current.role,
        customRoleId: liveCustomRoleId,
        priority: current.priority,
      },
      to: next,
    },
  });

  await syncRoles(
    {
      orgId: tenant.orgId,
      ip: request.ip,
      actorUserId: tenant.userId,
      metadata: { scimGroupId: id },
    },
    await scimGroupMemberIds(id),
  );
  appLogger.info("SCIM group mapping updated", {
    orgId: tenant.orgId,
    groupId: id,
  });

  return reply.send(updated);
};
