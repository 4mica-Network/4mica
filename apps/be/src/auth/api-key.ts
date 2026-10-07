import { prisma } from "@4mica/db";
import { appLogger } from "@logger/index";
import { hashSecret } from "@services/secrets";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface ApiKeyContext {
  id: string;
  ownerId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    apiKey: ApiKeyContext | null;
  }
}

const unauthorized = (reply: FastifyReply) =>
  reply.code(401).send({
    error: "unauthorized",
    message: "A valid API key is required. Send it as `Authorization: Bearer`.",
  });

/**
 * Enough of a presented key to tell keys apart in a log — the same prefix the
 * dashboard shows — and never enough to use one.
 */
const loggablePrefix = (token: string): string => token.slice(0, 13);

const rejected = (
  request: FastifyRequest,
  reply: FastifyReply,
  reason: string,
  token: string | null,
) => {
  appLogger.warn("API key rejected", {
    reason,
    keyPrefix: token ? loggablePrefix(token) : null,
    ip: request.ip,
    method: request.method,
    route: request.routeOptions.url ?? null,
  });
  unauthorized(reply);
};

const bearerToken = (request: FastifyRequest): string | null => {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    return null;
  }

  const value = header.trim();
  const token =
    value.slice(0, 7).toLowerCase() === "bearer "
      ? value.slice(7).trim()
      : null;

  return token && token.length > 0 ? token : null;
};

export const authenticateApiKey = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  request.apiKey = null;

  const token = bearerToken(request);
  if (!token) {
    rejected(request, reply, "missing", null);
    return;
  }

  const record = await prisma.apiKey.findUnique({
    where: { hashedKey: hashSecret(token) },
    select: {
      id: true,
      ownerId: true,
      revokedAt: true,
      expiresAt: true,
      owner: { select: { banned: true, locked: true, deletedAt: true } },
    },
  });

  const reason = !record
    ? "unknown"
    : record.revokedAt !== null
      ? "revoked"
      : record.expiresAt !== null && record.expiresAt.getTime() <= Date.now()
        ? "expired"
        : record.owner.banned ||
            record.owner.locked ||
            record.owner.deletedAt !== null
          ? "owner_disabled"
          : null;

  if (!record || reason) {
    rejected(request, reply, reason ?? "unknown", token);
    return;
  }

  request.apiKey = { id: record.id, ownerId: record.ownerId };

  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
};

export const requireApiKeyOwner = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  if (!request.apiKey) {
    unauthorized(reply);
    return null;
  }

  return request.apiKey.ownerId;
};
