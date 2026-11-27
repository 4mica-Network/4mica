import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { formatUserCode, normalizeUserCode } from "@utils/secrets";
import type { FastifyReply, RouteHandler } from "fastify";
import { config } from "@/config/index";
import {
  createCliToken,
  createDeviceRequest,
  DEVICE_SESSION_TTL_MS,
  decideDeviceRequest,
  findAccountSummary,
  findDeviceRequestByCode,
  findPendingDeviceRequest,
  listCliSessions,
  recordDevicePoll,
  redeemDeviceRequest,
  revokeCliSession,
} from "./repository";
import {
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

  const created = await createDeviceRequest({
    clientName: parsed.data.client_name,
    requestIp: request.ip,
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

  const sinceLastPoll = found.lastPolledAt
    ? Date.now() - found.lastPolledAt.getTime()
    : Number.POSITIVE_INFINITY;
  await recordDevicePoll(found.id);

  if (sinceLastPoll < found.intervalSecs * 1000 - POLL_TOLERANCE_MS) {
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
  });

  if (!redeemed) {
    return grantError(
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

  return reply.send({
    ...pending,
    userCode: formatUserCode(pending.userCode),
  });
};

const decideHandler =
  (status: "APPROVED" | "DENIED"): RouteHandler =>
  async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }

    const userCode = parseUserCode(request.body);
    if (!userCode || !(await decideDeviceRequest(userId, userCode, status))) {
      return unknownCode(reply);
    }

    appLogger.info("CLI sign-in request decided", { userId, status });

    return reply.code(204).send();
  };

export const approveDeviceRequestHandler = decideHandler("APPROVED");
export const denyDeviceRequestHandler = decideHandler("DENIED");

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

  const { session, plaintext } = await createCliToken(userId, parsed.data.name);
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

  const user = await findAccountSummary(userId);
  if (!user) {
    return notFound(reply, "account");
  }

  return reply.send({ user, session });
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
