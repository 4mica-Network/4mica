import type { OrgRole } from "@4mica/db";
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
import { appLogger } from "@logger/index";
import { getClerkUser } from "@services/clerk-users";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import {
  type ClerkSamlConnection,
  classifyClerkError,
  createSamlConnection,
  deleteSamlConnection,
  getSamlConnection,
  PROVIDER_SLUGS,
  sendClerkFailure,
  serviceProviderOf,
  updateSamlConnection,
} from "./clerk";
import { unmetRequirement } from "./enforcement";
import {
  type ConnectionRow,
  connectionForDomain,
  createConnection,
  deleteConnection,
  findConnection,
  findVerifiedDomain,
  listConnections,
  updateConnection,
} from "./repository";
import {
  CreateSsoConnectionSchema,
  type UpdateSsoConnectionInput,
  UpdateSsoConnectionSchema,
} from "./schema";

const toConnection = (
  row: ConnectionRow,
  clerkConnection: ClerkSamlConnection | null,
) => ({
  id: row.id,
  domainId: row.domainId,
  domain: row.domain.domain,
  provider: row.provider,
  name: row.name,
  active: row.active,
  enforced: row.enforced,
  jitProvisioning: row.jitProvisioning,
  defaultRole: row.defaultRole,
  idpEntityId: row.idpEntityId,
  idpSsoUrl: row.idpSsoUrl,
  idpMetadataUrl: row.idpMetadataUrl,
  serviceProvider: serviceProviderOf(clerkConnection),
  createdAt: row.createdAt,
});

const params = (request: FastifyRequest) => request.params as { id: string };

const fetchClerkConnection = async (row: ConnectionRow) => {
  if (!row.clerkConnectionId) {
    return null;
  }
  try {
    return await getSamlConnection(row.clerkConnectionId);
  } catch (error) {
    appLogger.warn("Could not load SAML connection from Clerk", {
      ssoConnectionId: row.id,
      error,
    });
    return null;
  }
};

const teamTenant = async (
  request: FastifyRequest,
  reply: FastifyReply,
  reauth: boolean,
): Promise<Tenant | null> => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return null;
  }
  if (tenant.personal) {
    reply.code(400).send({
      error: "personal_organization",
      message: "Personal organizations cannot use single sign-on. Use a team.",
    });
    return null;
  }
  if (reauth && !(await requireRecentAuth(request, reply, tenant))) {
    return null;
  }
  return tenant;
};

const gateDefaultRole = async (
  request: FastifyRequest,
  reply: FastifyReply,
  tenant: Tenant,
  role: OrgRole,
  target: string,
  domain: string,
) => {
  if (!GOVERNED_ROLES.includes(role)) {
    return true;
  }
  const gate = await requireApproval(
    request,
    reply,
    tenant,
    "member.role_grant",
    { kind: "sso_default_role", target, role },
    `Let single sign-on users from ${domain} join as ${role.toLowerCase()}`,
  );
  return gate.proceed;
};

export const listSsoConnectionsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }
  if (tenant.personal) {
    return reply.send({ items: [] });
  }
  const rows = await listConnections(tenant.orgId);
  const items = await Promise.all(
    rows.map(async (row) => toConnection(row, await fetchClerkConnection(row))),
  );
  return reply.send({ items });
};

export const createSsoConnectionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await teamTenant(request, reply, true);
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateSsoConnectionSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  const input = parsed.data;

  const domain = await findVerifiedDomain(tenant.orgId, input.domainId);
  if (!domain) {
    return notFound(reply, "domain");
  }
  if (domain.verifiedAt === null) {
    return reply.code(409).send({
      error: "domain_unverified",
      message: "Verify the domain before connecting single sign-on to it.",
    });
  }
  if (await connectionForDomain(tenant.orgId, domain.id)) {
    return reply.code(409).send({
      error: "sso_exists",
      message: "This domain already has a single sign-on connection.",
    });
  }

  if (
    input.jitProvisioning &&
    !(await gateDefaultRole(
      request,
      reply,
      tenant,
      input.defaultRole,
      domain.id,
      domain.domain,
    ))
  ) {
    return reply;
  }

  const idp = input.idpMetadataUrl
    ? { idpMetadataUrl: input.idpMetadataUrl }
    : {
        idpEntityId: input.idpEntityId,
        idpSsoUrl: input.idpSsoUrl,
        idpCertificate: input.idpCertificate,
      };

  let clerkConnection: ClerkSamlConnection;
  try {
    clerkConnection = await createSamlConnection({
      name: input.name,
      provider: PROVIDER_SLUGS[input.provider],
      domain: domain.domain,
      ...idp,
    });
  } catch (error) {
    appLogger.warn("Clerk refused a SAML connection", {
      orgId: tenant.orgId,
      error,
    });
    return sendClerkFailure(reply, classifyClerkError(error));
  }

  let row: ConnectionRow;
  try {
    row = await createConnection(tenant.orgId, tenant.userId, {
      domainId: domain.id,
      provider: input.provider,
      name: input.name,
      clerkConnectionId: clerkConnection.id,
      idpEntityId: input.idpMetadataUrl ? null : (input.idpEntityId ?? null),
      idpSsoUrl: input.idpMetadataUrl ? null : (input.idpSsoUrl ?? null),
      idpMetadataUrl: input.idpMetadataUrl ?? null,
      active: clerkConnection.active,
      jitProvisioning: input.jitProvisioning,
      defaultRole: input.defaultRole,
    });
  } catch (error) {
    await deleteSamlConnection(clerkConnection.id).catch((cleanup: unknown) =>
      appLogger.error("Could not roll back a SAML connection", {
        clerkConnectionId: clerkConnection.id,
        error: cleanup,
      }),
    );
    throw error;
  }

  await audit(request, tenant, {
    action: "sso.created",
    targetType: "sso_connection",
    targetId: row.id,
    metadata: {
      domain: domain.domain,
      provider: input.provider,
      defaultRole: input.defaultRole,
      jitProvisioning: input.jitProvisioning,
    },
  });
  return reply.code(201).send(toConnection(row, clerkConnection));
};

const clerkChanges = (input: UpdateSsoConnectionInput) => {
  const changes = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.idpMetadataUrl !== undefined
      ? { idpMetadataUrl: input.idpMetadataUrl }
      : {}),
    ...(input.idpEntityId !== undefined
      ? { idpEntityId: input.idpEntityId }
      : {}),
    ...(input.idpSsoUrl !== undefined ? { idpSsoUrl: input.idpSsoUrl } : {}),
    ...(input.idpCertificate !== undefined
      ? { idpCertificate: input.idpCertificate }
      : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  return Object.keys(changes).length > 0 ? changes : null;
};

const wouldLockOut = async (
  request: FastifyRequest,
  row: ConnectionRow,
): Promise<boolean | null> => {
  const clerkUserId = request.user?.clerkUserId;
  if (!clerkUserId) {
    return false;
  }
  try {
    const user = await getClerkUser(clerkUserId);
    return (
      unmetRequirement(user, [
        { clerkConnectionId: row.clerkConnectionId, domain: row.domain },
      ]) !== null
    );
  } catch {
    return null;
  }
};

export const updateSsoConnectionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await teamTenant(request, reply, true);
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateSsoConnectionSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  const input = parsed.data;

  const { id } = params(request);
  const current = await findConnection(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "SSO connection");
  }

  const active = input.active ?? current.active;
  const enforced = input.enforced ?? (active ? current.enforced : false);
  if (enforced && !active) {
    return reply.code(409).send({
      error: "sso_inactive",
      message: "Activate the connection before enforcing it.",
    });
  }

  if (enforced && !current.enforced) {
    const lockOut = await wouldLockOut(request, current);
    if (lockOut === null) {
      return sendClerkFailure(reply, { kind: "upstream" });
    }
    if (lockOut) {
      return reply.code(409).send({
        error: "would_lock_out",
        message: `Sign in with single sign-on for ${current.domain.domain} before enforcing it, or you would lose access.`,
      });
    }
  }

  const jitProvisioning = input.jitProvisioning ?? current.jitProvisioning;
  const defaultRole = input.defaultRole ?? current.defaultRole;
  if (
    jitProvisioning &&
    (defaultRole !== current.defaultRole || !current.jitProvisioning) &&
    !(await gateDefaultRole(
      request,
      reply,
      tenant,
      defaultRole,
      current.id,
      current.domain.domain,
    ))
  ) {
    return reply;
  }

  let clerkConnection: ClerkSamlConnection | null = null;
  const changes = clerkChanges(input);
  if (changes) {
    if (!current.clerkConnectionId) {
      return sendClerkFailure(reply, { kind: "not_found" });
    }
    try {
      clerkConnection = await updateSamlConnection(
        current.clerkConnectionId,
        changes,
      );
    } catch (error) {
      appLogger.warn("Clerk refused a SAML connection update", {
        orgId: tenant.orgId,
        ssoConnectionId: id,
        error,
      });
      return sendClerkFailure(reply, classifyClerkError(error));
    }
    if (input.active === true && !clerkConnection.active) {
      return reply.code(409).send({
        error: "sso_not_activated",
        message:
          "The identity service did not activate the connection. Check the identity provider configuration.",
      });
    }
  }

  const confirmedActive = clerkConnection ? clerkConnection.active : active;
  const row = await updateConnection(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.idpMetadataUrl !== undefined
      ? { idpMetadataUrl: input.idpMetadataUrl }
      : {}),
    ...(input.idpEntityId !== undefined
      ? { idpEntityId: input.idpEntityId }
      : {}),
    ...(input.idpSsoUrl !== undefined ? { idpSsoUrl: input.idpSsoUrl } : {}),
    active: confirmedActive,
    enforced: enforced && confirmedActive,
    jitProvisioning,
    defaultRole,
  });

  await audit(request, tenant, {
    action: "sso.updated",
    targetType: "sso_connection",
    targetId: id,
    metadata: {
      fields: Object.keys(input).filter((key) => key !== "idpCertificate"),
      certificateReplaced: input.idpCertificate !== undefined,
      active: row.active,
      enforced: row.enforced,
    },
  });
  return reply.send(
    toConnection(row, clerkConnection ?? (await fetchClerkConnection(row))),
  );
};

export const deleteSsoConnectionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await teamTenant(request, reply, true);
  if (!tenant) {
    return reply;
  }

  const { id } = params(request);
  const current = await findConnection(tenant.orgId, id);
  if (!current) {
    return notFound(reply, "SSO connection");
  }

  if (current.clerkConnectionId) {
    try {
      await deleteSamlConnection(current.clerkConnectionId);
    } catch (error) {
      appLogger.warn("Clerk refused to delete a SAML connection", {
        orgId: tenant.orgId,
        ssoConnectionId: id,
        error,
      });
      return sendClerkFailure(reply, classifyClerkError(error));
    }
  }

  await deleteConnection(tenant.orgId, id);
  await audit(request, tenant, {
    action: "sso.deleted",
    targetType: "sso_connection",
    targetId: id,
    metadata: { domain: current.domain.domain, provider: current.provider },
  });
  return reply.code(204).send();
};
