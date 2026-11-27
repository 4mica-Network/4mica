import { type Prisma, prisma } from "@4mica/db";
import {
  API_KEY_SELECT,
  findApiKey,
  toApiKey,
} from "@controllers/developer/repository";
import type { UpdateApiKeyInput } from "@controllers/developer/schema";
import { type ResourceScope, scopeData, scopeWhere } from "@utils/scope";
import { generateApiKey } from "@utils/secrets";
import type {
  CreateServiceAccountInput,
  CreateServiceAccountKeyInput,
  UpdateServiceAccountInput,
} from "./schema";

const HOUR_MS = 60 * 60 * 1000;

const serviceAccountSelect = (scope: ResourceScope) =>
  ({
    id: true,
    name: true,
    description: true,
    suspendedAt: true,
    createdAt: true,
    createdBy: { select: { id: true, name: true } },
    _count: {
      select: {
        apiKeys: {
          where: { environmentId: scope.environmentId, revokedAt: null },
        },
      },
    },
  }) satisfies Prisma.ServiceAccountSelect;

type RawServiceAccount = Prisma.ServiceAccountGetPayload<{
  select: ReturnType<typeof serviceAccountSelect>;
}>;

const toServiceAccount = ({ _count, ...rest }: RawServiceAccount) => ({
  ...rest,
  keyCount: _count.apiKeys,
});

const ownedWhere = (scope: ResourceScope, id: string) => ({
  id,
  organizationId: scope.orgId,
  projectId: scope.projectId,
  deletedAt: null,
});

export const listServiceAccounts = async (scope: ResourceScope) => {
  const rows = await prisma.serviceAccount.findMany({
    where: {
      organizationId: scope.orgId,
      projectId: scope.projectId,
      deletedAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: serviceAccountSelect(scope),
  });
  return rows.map(toServiceAccount);
};

export const getServiceAccount = async (scope: ResourceScope, id: string) => {
  const row = await prisma.serviceAccount.findFirst({
    where: ownedWhere(scope, id),
    select: serviceAccountSelect(scope),
  });
  return row ? toServiceAccount(row) : null;
};

export const createServiceAccount = async (
  scope: ResourceScope,
  userId: string,
  data: CreateServiceAccountInput,
) => {
  const row = await prisma.serviceAccount.create({
    data: {
      organizationId: scope.orgId,
      projectId: scope.projectId,
      createdById: userId,
      name: data.name,
      description: data.description ?? null,
    },
    select: serviceAccountSelect(scope),
  });
  return toServiceAccount(row);
};

export const updateServiceAccount = async (
  scope: ResourceScope,
  id: string,
  data: UpdateServiceAccountInput | { suspendedAt: Date | null },
) => {
  const { count } = await prisma.serviceAccount.updateMany({
    where: ownedWhere(scope, id),
    data,
  });
  return count > 0 ? getServiceAccount(scope, id) : null;
};

export const deleteServiceAccount = async (
  scope: ResourceScope,
  id: string,
): Promise<boolean> => {
  const row = await prisma.serviceAccount.findFirst({
    where: ownedWhere(scope, id),
    select: { id: true },
  });
  if (!row) {
    return false;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.serviceAccount.update({
      where: { id: row.id },
      data: { deletedAt: now },
    }),
    prisma.apiKey.updateMany({
      where: { serviceAccountId: row.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  return true;
};

const keyWhere = (scope: ResourceScope, serviceAccountId: string) => ({
  ...scopeWhere(scope),
  serviceAccountId,
});

export const listServiceAccountKeys = async (
  scope: ResourceScope,
  serviceAccountId: string,
) => {
  const rows = await prisma.apiKey.findMany({
    where: keyWhere(scope, serviceAccountId),
    orderBy: { createdAt: "desc" },
    select: API_KEY_SELECT,
  });
  return rows.map(toApiKey);
};

export const createServiceAccountKey = async (
  scope: ResourceScope,
  userId: string,
  serviceAccountId: string,
  data: Pick<CreateServiceAccountKeyInput, "name" | "scopes"> & {
    expiresAt: Date | null;
    ipAllowlist: string[];
  },
) => {
  const secret = generateApiKey(scope.environment);
  const row = await prisma.apiKey.create({
    data: {
      ...scopeData(scope),
      serviceAccountId,
      createdById: userId,
      name: data.name,
      scopes: data.scopes,
      prefix: secret.prefix,
      last4: secret.last4,
      hashedKey: secret.hash,
      expiresAt: data.expiresAt,
      ipAllowlist: data.ipAllowlist,
    },
    select: API_KEY_SELECT,
  });
  return { ...toApiKey(row), secret: secret.plaintext };
};

export const updateServiceAccountKey = async (
  scope: ResourceScope,
  serviceAccountId: string,
  keyId: string,
  data: UpdateApiKeyInput,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id: keyId, ...keyWhere(scope, serviceAccountId) },
    data,
  });
  return count > 0 ? findApiKey(keyId) : null;
};

export const revokeServiceAccountKey = async (
  scope: ResourceScope,
  serviceAccountId: string,
  keyId: string,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id: keyId, ...keyWhere(scope, serviceAccountId), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0 ? findApiKey(keyId) : null;
};

export const rotateServiceAccountKey = async (
  scope: ResourceScope,
  userId: string,
  serviceAccountId: string,
  keyId: string,
  expireOldInHours: number,
) => {
  const old = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      ...keyWhere(scope, serviceAccountId),
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      name: true,
      scopes: true,
      expiresAt: true,
      ipAllowlist: true,
    },
  });
  if (!old) {
    return null;
  }

  const now = Date.now();
  const graceEnds = new Date(now + expireOldInHours * HOUR_MS);
  const oldUpdate =
    expireOldInHours === 0
      ? { revokedAt: new Date(now) }
      : {
          expiresAt:
            old.expiresAt && old.expiresAt.getTime() < graceEnds.getTime()
              ? old.expiresAt
              : graceEnds,
        };

  const { count } = await prisma.apiKey.updateMany({
    where: { id: old.id, revokedAt: null },
    data: oldUpdate,
  });
  if (count === 0) {
    return null;
  }

  return createServiceAccountKey(scope, userId, serviceAccountId, {
    name: old.name,
    scopes: old.scopes,
    expiresAt: old.expiresAt,
    ipAllowlist: old.ipAllowlist,
  });
};
