import { prisma } from "@4mica/db";
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
    unauthorized(reply);
    return;
  }

  const record = await prisma.apiKey.findUnique({
    where: { hashedKey: hashSecret(token) },
    select: {
      id: true,
      ownerId: true,
      revokedAt: true,
      expiresAt: true,
      owner: { select: { banned: true, deletedAt: true } },
    },
  });

  if (
    !record ||
    record.revokedAt !== null ||
    (record.expiresAt !== null && record.expiresAt.getTime() <= Date.now()) ||
    record.owner.banned ||
    record.owner.deletedAt !== null
  ) {
    unauthorized(reply);
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
