import { appLogger } from "@logger/index";
import { hashSecret } from "@utils/secrets";
import type { FastifyReply, FastifyRequest } from "fastify";
import { findApiKeyByHash, touchApiKey } from "./repository";

export interface ApiKeyContext {
  id: string;
  ownerId: string;
  listingId: string | null;
  agentId: string | null;
}

export interface ResourceKeyContext {
  ownerId: string;
  kind: "listing" | "agent";
  id: string;
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

  const record = await findApiKeyByHash(hashSecret(token));

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
          : record.listing?.deletedAt || record.agent?.deletedAt
            ? "resource_deleted"
            : null;

  if (!record || reason) {
    rejected(request, reply, reason ?? "unknown", token);
    return;
  }

  request.apiKey = {
    id: record.id,
    ownerId: record.ownerId,
    listingId: record.listingId,
    agentId: record.agentId,
  };

  void touchApiKey(record.id).catch(() => {});
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

export const requireResourceKey = (
  request: FastifyRequest,
  reply: FastifyReply,
): ResourceKeyContext | null => {
  if (!request.apiKey) {
    unauthorized(reply);
    return null;
  }

  const { ownerId, listingId, agentId } = request.apiKey;

  if (listingId) {
    return { ownerId, kind: "listing", id: listingId };
  }
  if (agentId) {
    return { ownerId, kind: "agent", id: agentId };
  }

  reply.code(403).send({
    error: "key_not_scoped",
    message: "This key is not tied to an API or agent.",
  });
  return null;
};
