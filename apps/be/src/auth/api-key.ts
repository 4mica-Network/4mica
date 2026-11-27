import type { ApiKeyScope, EnvironmentKind } from "@4mica/db";
import { appLogger } from "@logger/index";
import { hashSecret } from "@utils/secrets";
import type { FastifyReply, FastifyRequest } from "fastify";
import { findApiKeyByHash, touchApiKey } from "./repository";

export interface ApiKeyContext {
  id: string;
  orgId: string;
  projectId: string;
  environmentId: string;
  environment: EnvironmentKind;
  serviceAccountId: string | null;
  scopes: ApiKeyScope[];
  listingId: string | null;
  agentId: string | null;
}

export interface ResourceKeyContext {
  orgId: string;
  projectId: string;
  environment: EnvironmentKind;
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

export const bearerToken = (request: FastifyRequest): string | null => {
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
        : record.organization.deletedAt !== null
          ? "organization_deleted"
          : record.project.deletedAt !== null ||
              record.project.archivedAt !== null
            ? "project_inactive"
            : record.serviceAccount &&
                (record.serviceAccount.suspendedAt !== null ||
                  record.serviceAccount.deletedAt !== null)
              ? "service_account_inactive"
              : record.listing?.deletedAt || record.agent?.deletedAt
                ? "resource_deleted"
                : null;

  if (!record || reason) {
    rejected(request, reply, reason ?? "unknown", token);
    return;
  }

  request.apiKey = {
    id: record.id,
    orgId: record.organizationId,
    projectId: record.projectId,
    environmentId: record.environmentId,
    environment: record.environment.kind,
    serviceAccountId: record.serviceAccountId,
    scopes: record.scopes,
    listingId: record.listingId,
    agentId: record.agentId,
  };

  void touchApiKey(record.id).catch(() => {});
};

export const requireApiKeyOrg = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  if (!request.apiKey) {
    unauthorized(reply);
    return null;
  }

  return request.apiKey.orgId;
};

export const requireResourceKey = (
  request: FastifyRequest,
  reply: FastifyReply,
): ResourceKeyContext | null => {
  if (!request.apiKey) {
    unauthorized(reply);
    return null;
  }

  const { orgId, projectId, environment, listingId, agentId } = request.apiKey;

  if (listingId) {
    return { orgId, projectId, environment, kind: "listing", id: listingId };
  }
  if (agentId) {
    return { orgId, projectId, environment, kind: "agent", id: agentId };
  }

  reply.code(403).send({
    error: "key_not_scoped",
    message: "This key is not tied to an API or agent.",
  });
  return null;
};

export const requireApiKeyScope = (
  request: FastifyRequest,
  reply: FastifyReply,
  scope: ApiKeyScope,
): ApiKeyContext | null => {
  if (!request.apiKey) {
    unauthorized(reply);
    return null;
  }

  if (!request.apiKey.scopes.includes(scope)) {
    appLogger.warn("API key lacks scope", {
      keyId: request.apiKey.id,
      scope,
      route: request.routeOptions.url ?? null,
    });
    reply.code(403).send({
      error: "insufficient_scope",
      message: `This key is not allowed to do that. It needs the ${scope} scope.`,
      scope,
    });
    return null;
  }

  return request.apiKey;
};
