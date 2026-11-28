import {
  type CliScope,
  DEFAULT_DEVICE_SCOPES,
  DEFAULT_TOKEN_SCOPES,
  isCliScope,
  withRequiredScope,
} from "@auth/cli-token";
import { findMembership } from "@auth/repository";
import { enforceAccessPolicy, factorAges } from "@auth/security";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { formatUserCode, normalizeUserCode } from "@utils/secrets";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import { config } from "@/config/index";
import {
  claimDevicePoll,
  createCliToken,
  createDeviceRequest,
  DEVICE_SESSION_TTL_MS,
  decideDeviceRequest,
  findAccountSummary,
  findDeviceRequestByCode,
  findOrganizationByReference,
  findOrganizationSummary,
  findPendingDeviceRequest,
  listCliSessions,
  listOrganizationCliSessions,
  redeemDeviceRequest,
  revokeCliSession,
  revokeOrganizationCliSession,
} from "./repository";
import {
  ApproveDeviceSchema,
  CreateCliTokenSchema,
  CreateDeviceCodeSchema,
  DEVICE_GRANT_TYPE,
  DeviceTokenSchema,
  UserCodeSchema,
} from "./schema";

const POLL_TOLERANCE_MS = 1000;

const verificationUri = () =>
  `${config.appUrl.replace(/\/+$/, "")}/cli/authorize`;

const grantError = (reply: FastifyReply, error: string, message: string) =>
  reply.code(400).send({ error, message });

const unknownCode = (reply: FastifyReply) =>
  reply.code(404).send({
    error: "not_found",
    message:
      "That code is not waiting for approval. It may have expired; run `4mica auth login` again.",
  });

export const createDeviceCodeHandler: RouteHandler = async (request, reply) => {
  const parsed = parseBody(CreateDeviceCodeSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const requested = parsed.data.scope?.split(/\s+/).filter(Boolean) ?? [];
  const unknown = requested.filter((scope) => !isCliScope(scope));
  if (unknown.length > 0) {
    return grantError(
      reply,
      "invalid_scope",
      `Unknown scope: ${unknown.join(", ")}.`,
    );
  }

  const organization = parsed.data.organization
    ? await findOrganizationByReference(parsed.data.organization)
    : null;
  if (parsed.data.organization && !organization) {
    return grantError(
      reply,
      "invalid_request",
      `No organization is called ${parsed.data.organization}.`,
    );
  }

  const created = await createDeviceRequest({
    clientName: parsed.data.client_name,
    requestIp: request.ip,
    organizationId: organization?.id ?? null,
    scopes: withRequiredScope(
      requested.length > 0 ? (requested as CliScope[]) : DEFAULT_DEVICE_SCOPES,
    ),
  });
  const userCode = formatUserCode(created.userCode);
  const uri = verificationUri();

  return reply.send({
    device_code: created.deviceCode,
    user_code: userCode,
    verification_uri: uri,
    verification_uri_complete: `${uri}?code=${userCode}`,
    expires_in: Math.floor((created.expiresAt.getTime() - Date.now()) / 1000),
    interval: created.intervalSecs,
  });
};

export const deviceTokenHandler: RouteHandler = async (request, reply) => {
  const parsed = parseBody(DeviceTokenSchema, request.body);
  if (!parsed.success) {
    return grantError(
      reply,
      "invalid_request",
      "grant_type and device_code are required.",
    );
  }

  if (parsed.data.grant_type !== DEVICE_GRANT_TYPE) {
    return grantError(
      reply,
      "unsupported_grant_type",
      `Only ${DEVICE_GRANT_TYPE} is supported.`,
    );
  }

  const found = await findDeviceRequestByCode(parsed.data.device_code);

  if (!found || found.consumedAt !== null) {
    return grantError(
      reply,
      "invalid_grant",
      "That device code is unknown or has already been used.",
    );
  }

  if (found.expiresAt.getTime() <= Date.now()) {
    return grantError(
      reply,
      "expired_token",
      "The sign-in request expired before it was approved.",
    );
  }

  if (found.status === "DENIED") {
    return grantError(
      reply,
      "access_denied",
      "The sign-in request was denied in the dashboard.",
    );
  }

  const onTime = await claimDevicePoll(
    found.id,
    found.intervalSecs * 1000 - POLL_TOLERANCE_MS,
  );

  if (!onTime) {
    return grantError(
      reply,
      "slow_down",
      `Poll no more than once every ${found.intervalSecs} seconds.`,
    );
  }

  if (found.status === "PENDING" || !found.userId) {
    return grantError(
      reply,
      "authorization_pending",
      "The sign-in request has not been approved yet.",
    );
  }

  if (found.user?.banned || found.user?.locked || found.user?.deletedAt) {
    return grantError(
      reply,
      "access_denied",
      "This account cannot sign in from the CLI.",
    );
  }

  const redeemed = await redeemDeviceRequest({
    id: found.id,
    userId: found.userId,
    clientName: found.clientName,
    scopes: found.scopes,
    organizationId: found.organizationId,
    mfaVerified: found.mfaVerified,
  });

  if (!redeemed) {
    return found.expiresAt.getTime() <= Date.now()
      ? grantError(
          reply,
          "expired_token",
          "The sign-in request expired before it was approved.",
        )
      : grantError(
          reply,
          "invalid_grant",
          "That device code is unknown or has already been used.",
        );
  }

  appLogger.info("CLI session created", {
    userId: found.userId,
    sessionId: redeemed.session.id,
    kind: "DEVICE",
  });

  return reply.send({
    access_token: redeemed.plaintext,
    token_type: "Bearer",
    expires_in: Math.floor(DEVICE_SESSION_TTL_MS / 1000),
    scope: redeemed.session.scopes.join(" "),
  });
};

const parseUserCode = (input: unknown): string | null => {
  const parsed = parseBody(UserCodeSchema, input);
  return parsed.success ? normalizeUserCode(parsed.data.userCode) : null;
};

export const getDeviceRequestHandler: RouteHandler = async (request, reply) => {
  if (!requireUserId(request, reply)) {
    return reply;
  }

  const userCode = parseUserCode(request.query);
  const pending = userCode ? await findPendingDeviceRequest(userCode) : null;

  if (!pending) {
    return unknownCode(reply);
  }

  const { organizationId, ...rest } = pending;

  return reply.send({
    ...rest,
    userCode: formatUserCode(pending.userCode),
    organization: organizationId
      ? await findOrganizationSummary(organizationId)
      : null,
  });
};

const mayIssue = async (
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  organizationId: string | null,
): Promise<boolean> => {
  if (organizationId === null) {
    return true;
  }
  const tenant = await findMembership(userId, organizationId);
  if (!tenant) {
    notFound(reply, "organization");
    return false;
  }
  return enforceAccessPolicy(request, reply, tenant);
};

const issuedWithMfa = (request: FastifyRequest): boolean =>
  (factorAges(request)?.secondFactorMinutes ?? -1) >= 0;

export const approveDeviceRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const userCode = parseUserCode(request.body);
  if (!userCode) {
    return unknownCode(reply);
  }

  const parsed = parseBody(ApproveDeviceSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const pending = await findPendingDeviceRequest(userCode);
  if (!pending) {
    return unknownCode(reply);
  }

  const chosen = parsed.data.organizationId?.toLowerCase() ?? null;
  if (
    pending.organizationId !== null &&
    chosen !== null &&
    chosen !== pending.organizationId
  ) {
    return reply.code(400).send({
      error: "organization_mismatch",
      message: "This sign-in asked for a different organization.",
    });
  }

  const organizationId = pending.organizationId ?? chosen;
  if (!(await mayIssue(request, reply, userId, organizationId))) {
    return reply;
  }

  if (
    !(await decideDeviceRequest(userId, userCode, "APPROVED", {
      organizationId,
      mfaVerified: issuedWithMfa(request),
    }))
  ) {
    return unknownCode(reply);
  }

  appLogger.info("CLI sign-in request decided", {
    userId,
    status: "APPROVED",
    organizationId,
  });

  return reply.code(204).send();
};

export const denyDeviceRequestHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const userCode = parseUserCode(request.body);
  if (!userCode || !(await decideDeviceRequest(userId, userCode, "DENIED"))) {
    return unknownCode(reply);
  }

  appLogger.info("CLI sign-in request decided", { userId, status: "DENIED" });

  return reply.code(204).send();
};

export const listCliSessionsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  return reply.send(await listCliSessions(userId));
};

export const createCliTokenHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateCliTokenSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const organizationId = parsed.data.organizationId?.toLowerCase() ?? null;
  if (!(await mayIssue(request, reply, userId, organizationId))) {
    return reply;
  }

  const { session, plaintext } = await createCliToken(userId, {
    name: parsed.data.name,
    scopes: withRequiredScope(parsed.data.scopes ?? DEFAULT_TOKEN_SCOPES),
    expiresInDays: parsed.data.expiresInDays,
    organizationId,
    mfaVerified: issuedWithMfa(request),
  });
  appLogger.info("CLI session created", {
    userId,
    sessionId: session.id,
    kind: "TOKEN",
  });

  return reply.code(201).send({ session, plaintext });
};

export const revokeCliSessionHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  if (!(await revokeCliSession(userId, id))) {
    return notFound(reply, "CLI session");
  }

  appLogger.info("CLI session revoked", { userId, sessionId: id });

  return reply.code(204).send();
};

export const getCurrentCliSessionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  const session = request.cliSession;
  if (!userId || !session) {
    return reply;
  }

  const [user, organization] = await Promise.all([
    findAccountSummary(userId),
    session.organizationId
      ? findOrganizationSummary(session.organizationId)
      : null,
  ]);
  if (!user) {
    return notFound(reply, "account");
  }

  return reply.send({ user, session, organization });
};

export const revokeCurrentCliSessionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  const session = request.cliSession;
  if (!userId || !session) {
    return reply;
  }

  await revokeCliSession(userId, session.id);
  appLogger.info("CLI session revoked", {
    userId,
    sessionId: session.id,
    by: "cli",
  });

  return reply.code(204).send();
};

export const listOrganizationCliSessionsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  return reply.send({ items: await listOrganizationCliSessions(tenant.orgId) });
};

export const revokeOrganizationCliSessionHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "members.manage");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const revoked = await revokeOrganizationCliSession(tenant.orgId, id);
  if (!revoked) {
    return notFound(reply, "CLI session");
  }

  await audit(request, tenant, {
    action: "cli_session.revoked",
    targetType: "cli_session",
    targetId: id,
    metadata: { userId: revoked.userId },
  });
  appLogger.info("CLI session revoked", {
    userId: tenant.userId,
    sessionId: id,
    by: "organization",
  });

  return reply.code(204).send();
};
