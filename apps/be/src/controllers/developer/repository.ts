import { prisma } from "@4mica/db";
import { generateApiKey, generateWebhookSecret } from "@utils/secrets";
import type {
  CreateApiKeyInput,
  CreateWebhookInput,
  UpdateApiKeyInput,
  UpdateWebhookInput,
} from "./schema";

export const API_KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  last4: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

const ACCOUNT_KEY = { listingId: null, agentId: null } as const;

export const listApiKeys = (orgId: string) =>
  prisma.apiKey.findMany({
    where: { organizationId: orgId, ...ACCOUNT_KEY },
    orderBy: { createdAt: "desc" },
    select: API_KEY_SELECT,
  });

export const createApiKey = async (
  orgId: string,
  userId: string,
  data: CreateApiKeyInput,
) => {
  const secret = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      organizationId: orgId,
      createdById: userId,
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

export const updateApiKey = async (
  orgId: string,
  id: string,
  data: UpdateApiKeyInput,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, organizationId: orgId, ...ACCOUNT_KEY },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.apiKey.findUnique({ where: { id }, select: API_KEY_SELECT });
};

export const revokeApiKey = async (orgId: string, id: string) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, organizationId: orgId, ...ACCOUNT_KEY, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    return null;
  }

  return prisma.apiKey.findUnique({ where: { id }, select: API_KEY_SELECT });
};

export const deleteApiKey = async (orgId: string, id: string) => {
  const { count } = await prisma.apiKey.deleteMany({
    where: { id, organizationId: orgId, ...ACCOUNT_KEY },
  });
  return count > 0;
};

export const listWebhooks = (orgId: string) =>
  prisma.webhook.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: WEBHOOK_SELECT,
  });

export const createWebhook = async (
  orgId: string,
  userId: string,
  data: CreateWebhookInput,
) => {
  const secret = generateWebhookSecret();

  const webhook = await prisma.webhook.create({
    data: {
      organizationId: orgId,
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
  orgId: string,
  id: string,
  data: UpdateWebhookInput,
) => {
  const { count } = await prisma.webhook.updateMany({
    where: { id, organizationId: orgId },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.webhook.findUnique({ where: { id }, select: WEBHOOK_SELECT });
};

export const rotateWebhookSecret = async (orgId: string, id: string) => {
  const secret = generateWebhookSecret();

  const { count } = await prisma.webhook.updateMany({
    where: { id, organizationId: orgId },
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

export const deleteWebhook = async (orgId: string, id: string) => {
  const { count } = await prisma.webhook.deleteMany({
    where: { id, organizationId: orgId },
  });
  return count > 0;
};
