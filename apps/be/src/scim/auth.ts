import { bearerToken } from "@auth/api-key";
import { appLogger } from "@logger/index";
import { hashSecret, SCIM_TOKEN_PREFIX } from "@utils/secrets";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sendScimError } from "./errors";
import { findScimTokenByHash, touchScimToken } from "./repository";

export interface ScimContext {
  tokenId: string;
  orgId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    scim: ScimContext | null;
  }
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const rejected = (
  request: FastifyRequest,
  reply: FastifyReply,
  reason: string,
) => {
  appLogger.warn("SCIM token rejected", {
    reason,
    ip: request.ip,
    method: request.method,
    route: request.routeOptions.url ?? null,
  });
  return sendScimError(
    reply,
    401,
    "A valid SCIM token is required. Send it as `Authorization: Bearer`.",
  );
};

export const authenticateScimToken = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  request.scim = null;

  const token = bearerToken(request);
  if (!token) {
    await rejected(request, reply, "missing");
    return;
  }
  if (!token.startsWith(SCIM_TOKEN_PREFIX)) {
    await rejected(request, reply, "not_a_scim_token");
    return;
  }

  const record = await findScimTokenByHash(hashSecret(token));
  const reason = !record
    ? "unknown"
    : record.revokedAt !== null
      ? "revoked"
      : record.organization.deletedAt !== null
        ? "organization_deleted"
        : record.organization.personal
          ? "personal_organization"
          : null;

  if (!record || reason) {
    await rejected(request, reply, reason ?? "unknown");
    return;
  }

  request.scim = { tokenId: record.id, orgId: record.organizationId };

  if (
    !record.lastUsedAt ||
    Date.now() - record.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS
  ) {
    void touchScimToken(record.id).catch(() => {});
  }
};
