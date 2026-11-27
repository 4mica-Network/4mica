import { appLogger } from "@logger/index";
import { CLI_TOKEN_PREFIX, hashSecret } from "@utils/secrets";
import type { FastifyReply, FastifyRequest } from "fastify";
import { bearerToken } from "./api-key";
import { findCliSessionByHash, touchCliSession } from "./repository";

export const CLI_SCOPES = [
  "account:read",
  "wallets:read",
  "wallets:link",
  "wallets:unlink",
] as const;

export type CliScope = (typeof CLI_SCOPES)[number];

export const REQUIRED_SCOPE: CliScope = "account:read";

export const DEFAULT_DEVICE_SCOPES: readonly CliScope[] = [
  "account:read",
  "wallets:read",
  "wallets:link",
];

export const DEFAULT_TOKEN_SCOPES: readonly CliScope[] = [
  "account:read",
  "wallets:read",
];

export const isCliScope = (value: string): value is CliScope =>
  (CLI_SCOPES as readonly string[]).includes(value);

export const withRequiredScope = (scopes: readonly CliScope[]): CliScope[] =>
  CLI_SCOPES.filter(
    (scope) => scope === REQUIRED_SCOPE || scopes.includes(scope),
  );

export interface CliSessionContext {
  id: string;
  kind: "DEVICE" | "TOKEN";
  name: string;
  scopes: string[];
  organizationId: string | null;
  createdAt: Date;
  expiresAt: Date;
}

declare module "fastify" {
  interface FastifyRequest {
    cliSession: CliSessionContext | null;
  }
}

const unauthorized = (reply: FastifyReply) =>
  reply.code(401).send({
    error: "unauthorized",
    message:
      "A valid CLI token is required. Sign in again with `4mica auth login`.",
  });

export const hasCliToken = (request: FastifyRequest): boolean =>
  bearerToken(request)?.startsWith(CLI_TOKEN_PREFIX) ?? false;

const rejected = (
  request: FastifyRequest,
  reply: FastifyReply,
  reason: string,
  sessionId: string | null,
) => {
  appLogger.warn("CLI token rejected", {
    reason,
    sessionId,
    ip: request.ip,
    method: request.method,
    route: request.routeOptions.url ?? null,
  });
  return unauthorized(reply);
};

export const authenticateCliToken =
  (scope: CliScope | null) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    request.cliSession = null;

    const token = bearerToken(request);
    if (!token?.startsWith(CLI_TOKEN_PREFIX)) {
      await unauthorized(reply);
      return;
    }

    const record = await findCliSessionByHash(hashSecret(token));

    const reason = !record
      ? "unknown"
      : record.revokedAt !== null
        ? "revoked"
        : record.expiresAt.getTime() <= Date.now()
          ? "expired"
          : record.user.banned ||
              record.user.locked ||
              record.user.deletedAt !== null
            ? "owner_disabled"
            : null;

    if (!record || reason) {
      await rejected(request, reply, reason ?? "unknown", record?.id ?? null);
      return;
    }

    if (scope !== null && !record.scopes.includes(scope)) {
      appLogger.warn("CLI token lacks scope", {
        sessionId: record.id,
        scope,
        route: request.routeOptions.url ?? null,
      });
      await reply.code(403).send({
        error: "insufficient_scope",
        message: `This CLI session is not allowed to do that (needs ${scope}).`,
      });
      return;
    }

    request.cliSession = {
      id: record.id,
      kind: record.kind,
      name: record.name,
      scopes: record.scopes,
      organizationId: record.organizationId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    };
    request.user = {
      id: record.user.id,
      clerkUserId: record.user.clerkUserId,
      email: record.user.email,
      name: record.user.name,
      avatarUrl: record.user.avatarUrl,
      disabled: false,
    };

    void touchCliSession(record.id, record.lastUsedAt).catch(() => {});
  };

export const boundOrganizationId = (request: FastifyRequest): string | null =>
  request.cliSession?.organizationId ?? null;

export const onlyBoundOrganization = async (
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: unknown,
): Promise<unknown> => {
  const bound = boundOrganizationId(request);
  if (bound === null || payload === null || typeof payload !== "object") {
    return payload;
  }

  const { items } = payload as { items?: unknown };
  if (!Array.isArray(items)) {
    return payload;
  }

  const kept = items.filter(
    (item: { id?: unknown } | null) => item?.id === bound,
  );
  return {
    ...payload,
    items: kept,
    defaultId: kept.length > 0 ? bound : null,
  };
};
