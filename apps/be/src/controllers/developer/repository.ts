import { type ApiKeyScope, type Prisma, prisma } from "@4mica/db";
import { type ResourceScope, scopeData, scopeWhere } from "@utils/scope";
import { generateApiKey, generateWebhookSecret } from "@utils/secrets";
import {
  type CreateApiKeyInput,
  type CreateWebhookInput,
  DEFAULT_API_KEY_SCOPES,
  type UpdateApiKeyInput,
  type UpdateWebhookInput,
} from "./schema";

export const API_KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  last4: true,
  scopes: true,
  serviceAccountId: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  environment: { select: { kind: true } },
} satisfies Prisma.ApiKeySelect;

type RawApiKey = Prisma.ApiKeyGetPayload<{ select: typeof API_KEY_SELECT }>;

export type ApiKeyRow = Omit<RawApiKey, "environment"> & {
  environment: RawApiKey["environment"]["kind"];
};

export const toApiKey = ({ environment, ...rest }: RawApiKey): ApiKeyRow => ({
  ...rest,
  environment: environment.kind,
});

export const findApiKey = async (id: string): Promise<ApiKeyRow | null> => {
  const row = await prisma.apiKey.findUnique({
    where: { id },
    select: API_KEY_SELECT,
  });
  return row ? toApiKey(row) : null;
};

export const scopesOrAll = (scopes: ApiKeyScope[] | undefined) =>
  scopes ?? [...DEFAULT_API_KEY_SCOPES];

export const WEBHOOK_SELECT = {
  id: true,
  url: true,
  description: true,
  events: true,
  status: true,
  secretPrefix: true,
  lastDeliveryAt: true,
  lastDeliveryStatus: true,
  failureCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ACCOUNT_KEY = {
  listingId: null,
  agentId: null,
  serviceAccountId: null,
} as const;

export const listApiKeys = async (scope: ResourceScope) => {
  const rows = await prisma.apiKey.findMany({
    where: { ...scopeWhere(scope), ...ACCOUNT_KEY },
    orderBy: { createdAt: "desc" },
    select: API_KEY_SELECT,
  });
  return rows.map(toApiKey);
};

export const createApiKey = async (
  scope: ResourceScope,
  userId: string,
  data: CreateApiKeyInput,
) => {
  const secret = generateApiKey(scope.environment);

  const row = await prisma.apiKey.create({
    data: {
      ...scopeData(scope),
      createdById: userId,
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

export const updateApiKey = async (
  scope: ResourceScope,
  id: string,
  data: UpdateApiKeyInput,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, ...scopeWhere(scope), ...ACCOUNT_KEY },
    data,
  });

  return count > 0 ? findApiKey(id) : null;
};

export const revokeApiKey = async (scope: ResourceScope, id: string) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, ...scopeWhere(scope), ...ACCOUNT_KEY, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return count > 0 ? findApiKey(id) : null;
};

export const deleteApiKey = async (scope: ResourceScope, id: string) => {
  const { count } = await prisma.apiKey.deleteMany({
    where: { id, ...scopeWhere(scope), ...ACCOUNT_KEY },
  });
  return count > 0;
};

export const listWebhooks = (scope: ResourceScope) =>
  prisma.webhook.findMany({
    where: scopeWhere(scope),
    orderBy: { createdAt: "desc" },
    select: WEBHOOK_SELECT,
  });

export const createWebhook = async (
  scope: ResourceScope,
  userId: string,
  data: CreateWebhookInput,
) => {
  const secret = generateWebhookSecret();

  const webhook = await prisma.webhook.create({
    data: {
      ...scopeData(scope),
      createdById: userId,
      url: data.url,
      description: data.description ?? null,
      events: data.events,
      secretHash: secret.hash,
      secretPrefix: secret.prefix,
    },
    select: WEBHOOK_SELECT,
  });

  return { webhook, plaintext: secret.plaintext };
};

export const updateWebhook = async (
  scope: ResourceScope,
  id: string,
  data: UpdateWebhookInput,
) => {
  const { count } = await prisma.webhook.updateMany({
    where: { id, ...scopeWhere(scope) },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.webhook.findUnique({ where: { id }, select: WEBHOOK_SELECT });
};

export const rotateWebhookSecret = async (scope: ResourceScope, id: string) => {
  const secret = generateWebhookSecret();

  const { count } = await prisma.webhook.updateMany({
    where: { id, ...scopeWhere(scope) },
    data: { secretHash: secret.hash, secretPrefix: secret.prefix },
  });

  if (count === 0) {
    return null;
  }

  const webhook = await prisma.webhook.findUnique({
    where: { id },
    select: WEBHOOK_SELECT,
  });

  return webhook ? { webhook, plaintext: secret.plaintext } : null;
};

export const deleteWebhook = async (scope: ResourceScope, id: string) => {
  const { count } = await prisma.webhook.deleteMany({
    where: { id, ...scopeWhere(scope) },
  });
  return count > 0;
};
