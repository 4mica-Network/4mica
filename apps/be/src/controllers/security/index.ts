import { can } from "@auth/permissions";
import { requireRecentAuth } from "@auth/security";
import {
  audit,
  invalidBody,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { ipAllowed } from "@utils/ip-allowlist";
import type { RouteHandler } from "fastify";
import { findSecuritySettings, saveSecuritySettings } from "./repository";
import { UpdateSecuritySettingsSchema } from "./schema";

export const getSecuritySettingsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }

  if (!can(tenant, "members.manage") && !can(tenant, "compliance.read")) {
    return reply.code(403).send({
      error: "forbidden",
      message: "Your role in this organization does not allow that.",
      permission: "members.manage",
    });
  }

  return reply.send(await findSecuritySettings(tenant.orgId));
};

export const updateSecuritySettingsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  if (tenant.personal) {
    return reply.code(400).send({
      error: "personal_organization",
      message:
        "A personal workspace has no security policies. Create an organization to set them.",
    });
  }

  if (!(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  const parsed = parseBody(UpdateSecuritySettingsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const current = await findSecuritySettings(tenant.orgId);
  const next = { ...current, ...parsed.data };

  if (next.ipAllowlist.length > 0 && !ipAllowed(request.ip, next.ipAllowlist)) {
    return reply.code(409).send({
      error: "would_lock_out",
      message: `This allowlist does not include your current address (${request.ip}). Add it first so you keep access.`,
      ip: request.ip,
    });
  }

  const saved = await saveSecuritySettings(tenant.orgId, next);
  await audit(request, tenant, {
    action: "security.updated",
    targetType: "organization",
    targetId: tenant.orgId,
    metadata: { ...saved, changed: Object.keys(parsed.data) },
  });

  return reply.send(saved);
};
