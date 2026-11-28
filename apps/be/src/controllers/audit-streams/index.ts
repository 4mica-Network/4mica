import { randomUUID } from "node:crypto";
import { requireRecentAuth } from "@auth/security";
import type { Tenant } from "@auth/tenant";
import { config } from "@config/index";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { resolvesPublicly } from "@utils/public-host";
import type { FastifyReply, FastifyRequest, RouteHandler } from "fastify";
import { deliver, secretPrefix, streamSecret, toAuditEvent } from "./delivery";
import {
  countStreams,
  createStream,
  deleteStream,
  findStream,
  listStreams,
  resumeStream,
  rotateStreamSecret,
  type StreamRow,
  startingCursor,
  updateStream,
} from "./repository";
import { CreateStreamSchema, MAX_STREAMS, UpdateStreamSchema } from "./schema";

const signingKey = () => config.auditStreams.signingKey;

const toStream = (row: StreamRow) => {
  const key = signingKey();
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status,
    actionPrefixes: row.actionPrefixes,
    secretPrefix: key
      ? secretPrefix(streamSecret(key, row.id, row.secretVersion))
      : null,
    lastDeliveryAt: row.lastDeliveryAt,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
  };
};

const withSecret = (row: StreamRow, key: string) => ({
  stream: toStream(row),
  secret: streamSecret(key, row.id, row.secretVersion),
});

const actor = (request: FastifyRequest, userId: string) => ({
  actorUserId: userId,
  ip: request.ip,
});

const unavailable = (reply: FastifyReply) =>
  reply.code(503).send({
    error: "streaming_unavailable",
    message:
      "Audit streaming is not configured on this server. Set AUDIT_STREAM_SIGNING_KEY to enable it.",
  });

const privateUrl = (reply: FastifyReply) =>
  invalidBody(reply, [
    { path: "url", message: "must resolve to a public address" },
  ]);

const manager = async (
  request: FastifyRequest,
  reply: FastifyReply,
  reauth: boolean,
): Promise<{ tenant: Tenant; key: string } | null> => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return null;
  }
  const key = signingKey();
  if (!key) {
    unavailable(reply);
    return null;
  }
  if (reauth && !(await requireRecentAuth(request, reply, tenant))) {
    return null;
  }
  return { tenant, key };
};

const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;

export const listStreamsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "audit.read");
  if (!tenant) {
    return reply;
  }

  const rows = await listStreams(tenant.orgId);
  return reply.send({ items: rows.map(toStream) });
};

export const createStreamHandler: RouteHandler = async (request, reply) => {
  const access = await manager(request, reply, true);
  if (!access) {
    return reply;
  }
  const { tenant, key } = access;

  const parsed = parseBody(CreateStreamSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  const { backfillFrom, ...data } = parsed.data;

  if (!(await resolvesPublicly(new URL(data.url).hostname))) {
    return privateUrl(reply);
  }

  if ((await countStreams(tenant.orgId)) >= MAX_STREAMS) {
    return reply.code(409).send({
      error: "stream_limit",
      message: `An organization can have at most ${MAX_STREAMS} audit streams.`,
    });
  }

  const row = await createStream(
    tenant.orgId,
    tenant.userId,
    { ...data, cursorId: await startingCursor(tenant.orgId, backfillFrom) },
    actor(request, tenant.userId),
    backfillFrom,
  );
  return reply.code(201).send(withSecret(row, key));
};

export const updateStreamHandler: RouteHandler = async (request, reply) => {
  const access = await manager(request, reply, true);
  if (!access) {
    return reply;
  }

  const parsed = parseBody(UpdateStreamSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  if (
    parsed.data.url !== undefined &&
    !(await resolvesPublicly(new URL(parsed.data.url).hostname))
  ) {
    return privateUrl(reply);
  }

  const row = await updateStream(
    access.tenant.orgId,
    idOf(request),
    parsed.data,
    actor(request, access.tenant.userId),
  );
  return row ? reply.send(toStream(row)) : notFound(reply, "audit stream");
};

export const deleteStreamHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant || !(await requireRecentAuth(request, reply, tenant))) {
    return reply;
  }

  const deleted = await deleteStream(
    tenant.orgId,
    idOf(request),
    actor(request, tenant.userId),
  );
  return deleted ? reply.code(204).send() : notFound(reply, "audit stream");
};

export const rotateStreamSecretHandler: RouteHandler = async (
  request,
  reply,
) => {
  const access = await manager(request, reply, true);
  if (!access) {
    return reply;
  }

  const row = await rotateStreamSecret(
    access.tenant.orgId,
    idOf(request),
    actor(request, access.tenant.userId),
  );
  return row
    ? reply.send(withSecret(row, access.key))
    : notFound(reply, "audit stream");
};

export const resumeStreamHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "security.manage");
  if (!tenant) {
    return reply;
  }

  const row = await resumeStream(
    tenant.orgId,
    idOf(request),
    actor(request, tenant.userId),
  );
  return row ? reply.send(toStream(row)) : notFound(reply, "audit stream");
};

export const testStreamHandler: RouteHandler = async (request, reply) => {
  const access = await manager(request, reply, false);
  if (!access) {
    return reply;
  }
  const { tenant, key } = access;

  const row = await findStream(tenant.orgId, idOf(request));
  if (!row) {
    return notFound(reply, "audit stream");
  }

  const result = await deliver(
    row,
    streamSecret(key, row.id, row.secretVersion),
    [
      toAuditEvent({
        id: randomUUID(),
        organizationId: tenant.orgId,
        projectId: null,
        actorUserId: tenant.userId,
        actorApiKeyId: null,
        action: "audit_stream.test",
        targetType: "audit_stream",
        targetId: row.id,
        metadata: { test: true },
        ip: request.ip,
        createdAt: new Date(),
      }),
    ],
  );

  await audit(request, tenant, {
    action: "audit_stream.tested",
    targetType: "audit_stream",
    targetId: row.id,
    metadata: { delivered: result.ok, statusCode: result.statusCode },
  });

  return reply.send({
    delivered: result.ok,
    statusCode: result.statusCode,
    error: result.error,
    deliveryId: result.deliveryId,
  });
};
