import { prisma } from "@4mica/db";
import { API_KEY_SELECT } from "@controllers/developer/repository";
import type { ResourceKind } from "@controllers/trust/repository";
import { generateApiKey } from "@utils/secrets";
import type { CreateResourceKeyInput } from "./schema";

const target = (kind: ResourceKind, id: string) =>
  kind === "listing" ? { listingId: id } : { agentId: id };

export const listResourceKeys = (kind: ResourceKind, id: string) =>
  prisma.apiKey.findMany({
    where: target(kind, id),
    orderBy: { createdAt: "desc" },
    select: API_KEY_SELECT,
  });

export const createResourceKey = async (
  ownerId: string,
  kind: ResourceKind,
  id: string,
  data: CreateResourceKeyInput,
) => {
  const secret = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      ownerId,
      ...target(kind, id),
      name: data.name,
      prefix: secret.prefix,
      last4: secret.last4,
      hashedKey: secret.hash,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
    select: API_KEY_SELECT,
  });

  return { apiKey, plaintext: secret.plaintext };
};

export const revokeResourceKey = async (
  kind: ResourceKind,
  id: string,
  keyId: string,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id: keyId, ...target(kind, id), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    return null;
  }

  return prisma.apiKey.findUnique({
    where: { id: keyId },
    select: API_KEY_SELECT,
  });
};

export const deleteResourceKey = async (
  kind: ResourceKind,
  id: string,
  keyId: string,
) => {
  const { count } = await prisma.apiKey.deleteMany({
    where: { id: keyId, ...target(kind, id) },
  });
  return count > 0;
};
