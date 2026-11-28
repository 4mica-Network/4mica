import { ASSIGNABLE_PERMISSIONS } from "@auth/permissions";
import { requireRecentAuth } from "@auth/security";
import type { Tenant } from "@auth/tenant";
import { requireApproval } from "@controllers/approvals/gate";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { isUniqueViolation } from "@utils/prisma-errors";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import { holdsGovernedPermission } from "./grants";
import {
  createRole,
  deleteRole,
  findRole,
  listRoles,
  updateRole,
} from "./repository";
import { CreateRoleSchema, UpdateRoleSchema } from "./schema";

const SUMMARY_MAX = 280;

const actor = (request: FastifyRequest, userId: string) => ({
  actorUserId: userId,
  ip: request.ip,
});

const nameTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "role_name_taken",
    message: "Another role in this organization already has that name.",
    issues: [{ path: "name", message: "is already taken" }],
  });

const writer = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<Tenant | null> => {
  const tenant = await requireTenant(request, reply, "roles.manage");
  if (!tenant) {
    return null;
  }
  if (tenant.personal) {
    reply.code(400).send({
      error: "personal_organization",
      message:
        "A personal workspace has a single member. Create an organization to use custom roles.",
    });
    return null;
  }
  return (await requireRecentAuth(request, reply, tenant)) ? tenant : null;
};

export const listRolesHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  return reply.send({
    items: await listRoles(tenant.orgId),
    assignablePermissions: ASSIGNABLE_PERMISSIONS,
  });
};

export const createRoleHandler: RouteHandler = async (request, reply) => {
  const tenant = await writer(request, reply);
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateRoleSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  try {
    const role = await createRole(
      tenant.orgId,
      tenant.userId,
      parsed.data,
      actor(request, tenant.userId),
    );
    return reply.code(201).send(role);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return nameTaken(reply);
    }
    throw error;
  }
};

export const updateRoleHandler: RouteHandler = async (request, reply) => {
  const tenant = await writer(request, reply);
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateRoleSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await findRole(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "role");
  }

  const { permissions } = parsed.data;
  const added = (permissions ?? []).filter(
    (permission) => !current.permissions.includes(permission),
  );
  if (current.memberCount > 0 && holdsGovernedPermission(added)) {
    const gate = await requireApproval(
      request,
      reply,
      tenant,
      "member.role_grant",
      { kind: "custom_role_update", customRoleId: id, permissions },
      `Expand the ${current.name} role`.slice(0, SUMMARY_MAX),
    );
    if (!gate.proceed) {
      return reply;
    }
  }

  try {
    const role = await updateRole(
      tenant.orgId,
      id,
      parsed.data,
      actor(request, tenant.userId),
    );
    return role ? reply.send(role) : notFound(reply, "role");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return nameTaken(reply);
    }
    throw error;
  }
};

export const deleteRoleHandler: RouteHandler = async (request, reply) => {
  const tenant = await writer(request, reply);
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteRole(
    tenant.orgId,
    id,
    actor(request, tenant.userId),
  );
  return deleted ? reply.code(204).send() : notFound(reply, "role");
};
