import { requireRecentAuth } from "@auth/security";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  withAudit,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { generateScimToken } from "@utils/secrets";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  createScimToken,
  findScimToken,
  listScimTokens,
  revokeScimToken,
} from "./repository";
import { CreateScimTokenSchema } from "./schema";

const personalOrganization = (reply: FastifyReply) =>
  reply.code(400).send({
    error: "personal_organization",
    message: "SCIM provisioning is only available to team organizations.",
  });

export const listScimTokensHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }
  return reply.send({ items: await listScimTokens(tenant.orgId) });
};

export const createScimTokenHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }
  if (tenant.personal) {
    return personalOrganization(reply);
  }
  if (!(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  const parsed = parseBody(CreateScimTokenSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const secret = generateScimToken();
  const token = await withAudit(
    request,
    tenant,
    (tx) =>
      createScimToken(
        tenant.orgId,
        tenant.userId,
        parsed.data.name,
        secret,
        tx,
      ),
    (created) => ({
      action: "scim_token.created",
      targetType: "scim_token",
      targetId: created.id,
      metadata: { name: created.name, prefix: created.prefix },
    }),
  );
  appLogger.info("SCIM token created", {
    orgId: tenant.orgId,
    tokenId: token.id,
  });

  return reply.code(201).send({ ...token, secret: secret.plaintext });
};

export const revokeScimTokenHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const current = await findScimToken(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "SCIM token");
  }
  if (current.revokedAt) {
    return reply.send(current);
  }

  const revoked = await withAudit(
    request,
    tenant,
    (tx) => revokeScimToken(id, tx),
    (row) => ({
      action: "scim_token.revoked",
      targetType: "scim_token",
      targetId: id,
      metadata: { name: row.name, prefix: row.prefix },
    }),
  );
  appLogger.info("SCIM token revoked", { orgId: tenant.orgId, tokenId: id });

  return reply.send(revoked);
};
