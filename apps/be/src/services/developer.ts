import { prisma } from "@4mica/db";
import type {
  CreateApiKeyInput,
  CreateWebhookInput,
  UpdateApiKeyInput,
  UpdateWebhookInput,
} from "../schemas/developer";
import { generateApiKey, generateWebhookSecret } from "./secrets";

/** hashedKey is deliberately absent so a key can never leak through the API. */
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

export const listApiKeys = (ownerId: string) =>
  prisma.apiKey.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: API_KEY_SELECT,
  });

export const createApiKey = async (
  ownerId: string,
  data: CreateApiKeyInput,
) => {
  const secret = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      ownerId,
      name: data.name,
      prefix: secret.prefix,
      last4: secret.last4,
      hashedKey: secret.hash,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
    select: API_KEY_SELECT,
  });

  // The only time the plaintext exists outside the caller's request.
  return { apiKey, plaintext: secret.plaintext };
};

export const updateApiKey = async (
  ownerId: string,
  id: string,
  data: UpdateApiKeyInput,
) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, ownerId },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.apiKey.findUnique({ where: { id }, select: API_KEY_SELECT });
};

export const revokeApiKey = async (ownerId: string, id: string) => {
  const { count } = await prisma.apiKey.updateMany({
    where: { id, ownerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    return null;
  }

  return prisma.apiKey.findUnique({ where: { id }, select: API_KEY_SELECT });
};

export const deleteApiKey = async (ownerId: string, id: string) => {
  const { count } = await prisma.apiKey.deleteMany({ where: { id, ownerId } });
  return count > 0;
};

export const listWebhooks = (ownerId: string) =>
  prisma.webhook.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: WEBHOOK_SELECT,
  });

export const createWebhook = async (
  ownerId: string,
  data: CreateWebhookInput,
) => {
  const secret = generateWebhookSecret();

  const webhook = await prisma.webhook.create({
    data: {
      ownerId,
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
  ownerId: string,
  id: string,
  data: UpdateWebhookInput,
) => {
  const { count } = await prisma.webhook.updateMany({
    where: { id, ownerId },
    data,
  });

  if (count === 0) {
    return null;
  }

  return prisma.webhook.findUnique({ where: { id }, select: WEBHOOK_SELECT });
};

export const rotateWebhookSecret = async (ownerId: string, id: string) => {
  const secret = generateWebhookSecret();

  const { count } = await prisma.webhook.updateMany({
    where: { id, ownerId },
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

export const deleteWebhook = async (ownerId: string, id: string) => {
  const { count } = await prisma.webhook.deleteMany({ where: { id, ownerId } });
  return count > 0;
};
