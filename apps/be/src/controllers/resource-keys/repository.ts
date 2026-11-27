import { prisma } from "@4mica/db";
import {
  API_KEY_SELECT,
  findApiKey,
  scopesOrAll,
  toApiKey,
} from "@controllers/developer/repository";
import type { ResourceKind } from "@controllers/trust/repository";
import { type ResourceScope, scopeData, scopeWhere } from "@utils/scope";
import { generateApiKey } from "@utils/secrets";
import type { CreateResourceKeyInput } from "./schema";

const target = (kind: ResourceKind, id: string) =>
  kind === "listing" ? { listingId: id } : { agentId: id };

export const listResourceKeys = async (
  scope: ResourceScope,
  kind: ResourceKind,
  id: string,
) => {
  const rows = await prisma.apiKey.findMany({
    where: { ...target(kind, id), ...scopeWhere(scope) },
    orderBy: { createdAt: "desc" },
    select: API_KEY_SELECT,
  });
  return rows.map(toApiKey);
};

export const createResourceKey = async (
  scope: ResourceScope,
  userId: string,
  kind: ResourceKind,
  id: string,
  data: CreateResourceKeyInput,
) => {
  const secret = generateApiKey(scope.environment);

  const row = await prisma.apiKey.create({
    data: {
      ...scopeData(scope),
      createdById: userId,
      ...target(kind, id),
      name: data.name,
      scopes: scopesOrAll(data.scopes),
      prefix: secret.prefix,
      last4: secret.last4,
      hashedKey: secret.hash,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
    select: API_KEY_SELECT,
  });

  return { apiKey: toApiKey(row), plaintext: secret.plaintext };
};

export const revokeResourceKey = async (
  scope: ResourceScope,
  kind: ResourceKind,
  id: string,
  keyId: string,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: {
      id: keyId,
      ...target(kind, id),
      ...scopeWhere(scope),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return count > 0 ? findApiKey(keyId) : null;
};

export const deleteResourceKey = async (
  scope: ResourceScope,
  kind: ResourceKind,
  id: string,
  keyId: string,
) => {
  const { count } = await prisma.apiKey.deleteMany({
    where: { id: keyId, ...target(kind, id), ...scopeWhere(scope) },
  });
  return count > 0;
};
