import { prisma } from "@4mica/db";
import type { GeneratedSecret } from "@utils/secrets";

const TOKEN_SELECT = {
  id: true,
  name: true,
  prefix: true,
  last4: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

export const listScimTokens = (orgId: string) =>
  prisma.scimToken.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: TOKEN_SELECT,
  });

export const createScimToken = (
  orgId: string,
  userId: string,
  name: string,
  secret: GeneratedSecret,
) =>
  prisma.scimToken.create({
    data: {
      organizationId: orgId,
      createdById: userId,
      name,
      prefix: secret.prefix,
      last4: secret.last4,
      hashedToken: secret.hash,
    },
    select: TOKEN_SELECT,
  });

export const findScimToken = (orgId: string, id: string) =>
  prisma.scimToken.findFirst({
    where: { id, organizationId: orgId },
    select: TOKEN_SELECT,
  });

export const revokeScimToken = (id: string) =>
  prisma.scimToken.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: TOKEN_SELECT,
  });
