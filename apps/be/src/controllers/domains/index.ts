import { randomBytes } from "node:crypto";
import { requireRecentAuth } from "@auth/security";
import type { Tenant } from "@auth/tenant";
import { requireApproval } from "@controllers/approvals/gate";
import { GOVERNED_ROLES } from "@controllers/organizations/schema";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import {
  classifyClerkError,
  deleteSamlConnection,
  sendClerkFailure,
} from "@controllers/sso/clerk";
import { appLogger } from "@logger/index";
import { isUniqueViolation } from "@utils/prisma-errors";
import type { FastifyReply, RouteHandler } from "fastify";
import { lookupTxt } from "./dns";
import {
  connectionsOfDomain,
  createDomain,
  deleteDomain,
  findDomain,
  listDomains,
  recordCheck,
  toDomain,
  updateDomain,
  verificationRecord,
  verifiedElsewhere,
} from "./repository";
import { CreateDomainSchema, UpdateDomainSchema } from "./schema";

const personalOrganization = (reply: FastifyReply) =>
  reply.code(400).send({
    error: "personal_organization",
    message: "Personal organizations cannot claim domains. Use a team.",
  });

const domainTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "domain_taken",
    message: "Another organization has already verified this domain.",
  });

const params = (request: Parameters<RouteHandler>[0]) =>
  request.params as { id: string };

const teamTenant = async (
  request: Parameters<RouteHandler>[0],
  reply: FastifyReply,
  permission: "security.manage" | "members.manage",
): Promise<Tenant | null> => {
  const tenant = await requireTenant(request, reply, permission);
  if (!tenant) {
    return null;
  }
  if (tenant.personal) {
    personalOrganization(reply);
    return null;
  }
  return tenant;
};

export const listDomainsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }
  return reply.send({
    items: tenant.personal ? [] : await listDomains(tenant.orgId),
  });
};

export const createDomainHandler: RouteHandler = async (request, reply) => {
  const tenant = await teamTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateDomainSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  const { domain } = parsed.data;

  if (await verifiedElsewhere(tenant.orgId, domain)) {
    return domainTaken(reply);
  }

  try {
    const row = await createDomain(
      tenant.orgId,
      tenant.userId,
      domain,
      randomBytes(24).toString("hex"),
    );
    await audit(request, tenant, {
      action: "domain.added",
      targetType: "domain",
      targetId: row.id,
      metadata: { domain },
    });
    return reply.code(201).send(toDomain(row));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return reply.code(409).send({
        error: "domain_exists",
        message: "This organization has already added that domain.",
      });
    }
    throw error;
  }
};

export const verifyDomainHandler: RouteHandler = async (request, reply) => {
  const tenant = await teamTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  const current = await findDomain(tenant.orgId, params(request).id);
  if (!current) {
    return notFound(reply, "domain");
  }
  if (current.verifiedAt !== null) {
    return reply.send(toDomain(current));
  }

  const record = verificationRecord(current);
  const lookup = await lookupTxt(record.name);
  const found = lookup.ok ? lookup.values : [];
  const matched = found.some((value) => value.trim() === record.value);

  if (matched && (await verifiedElsewhere(tenant.orgId, current.domain))) {
    await recordCheck(current.id, false);
    return domainTaken(reply);
  }

  const row = await recordCheck(current.id, matched);
  if (!matched) {
    appLogger.info("Domain verification failed", {
      orgId: tenant.orgId,
      domainId: current.id,
      reason: lookup.ok ? "record_missing" : lookup.reason,
    });
    return reply.code(422).send({
      error: "domain_unverified",
      message: lookup.ok
        ? `No TXT record at ${record.name} has the value ${record.value}. DNS changes can take a while to propagate.`
        : `The TXT record at ${record.name} could not be looked up (${lookup.reason}). Retry shortly.`,
      expected: record,
      found,
    });
  }

  await audit(request, tenant, {
    action: "domain.verified",
    targetType: "domain",
    targetId: row.id,
    metadata: { domain: row.domain },
  });
  return reply.send(toDomain(row));
};

export const updateDomainHandler: RouteHandler = async (request, reply) => {
  const tenant = await teamTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateDomainSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = params(request);
  const current = await findDomain(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "domain");
  }

  const autoJoin = parsed.data.autoJoin ?? current.autoJoin;
  const autoJoinRole = parsed.data.autoJoinRole ?? current.autoJoinRole;

  if (autoJoin && current.verifiedAt === null) {
    return reply.code(409).send({
      error: "domain_unverified",
      message: "Verify the domain before letting its users join automatically.",
    });
  }

  if (
    autoJoin &&
    GOVERNED_ROLES.includes(autoJoinRole) &&
    (autoJoinRole !== current.autoJoinRole || !current.autoJoin)
  ) {
    const gate = await requireApproval(
      request,
      reply,
      tenant,
      "member.role_grant",
      { kind: "domain_auto_join", domainId: id, role: autoJoinRole },
      `Let everyone at ${current.domain} join as ${autoJoinRole.toLowerCase()}`,
    );
    if (!gate.proceed) {
      return reply;
    }
  }

  const row = await updateDomain(id, parsed.data);
  await audit(request, tenant, {
    action: "domain.updated",
    targetType: "domain",
    targetId: id,
    metadata: { autoJoin: row.autoJoin, autoJoinRole: row.autoJoinRole },
  });
  return reply.send(toDomain(row));
};

export const deleteDomainHandler: RouteHandler = async (request, reply) => {
  const tenant = await teamTenant(request, reply, "security.manage");
  if (!tenant || !(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  const { id } = params(request);
  const current = await findDomain(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "domain");
  }

  const connections = await connectionsOfDomain(tenant.orgId, id);
  for (const connection of connections) {
    if (!connection.clerkConnectionId) {
      continue;
    }
    try {
      await deleteSamlConnection(connection.clerkConnectionId);
    } catch (error) {
      appLogger.error("Could not remove SAML connection for a domain", {
        orgId: tenant.orgId,
        domainId: id,
        ssoConnectionId: connection.id,
        error,
      });
      return sendClerkFailure(reply, classifyClerkError(error));
    }
  }

  await deleteDomain(tenant.orgId, id);
  await audit(request, tenant, {
    action: "domain.removed",
    targetType: "domain",
    targetId: id,
    metadata: {
      domain: current.domain,
      ssoConnectionIds: connections.map((c) => c.id),
    },
  });
  return reply.code(204).send();
};
