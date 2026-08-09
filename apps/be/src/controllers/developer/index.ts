import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { WEBHOOK_EVENTS } from "@services/webhook-events";
import type { RouteHandler } from "fastify";
import {
  createApiKey,
  createWebhook,
  deleteApiKey,
  deleteWebhook,
  listApiKeys,
  listWebhooks,
  revokeApiKey,
  rotateWebhookSecret,
  updateApiKey,
  updateWebhook,
} from "./repository";
import {
  CreateApiKeySchema,
  CreateWebhookSchema,
  UpdateApiKeySchema,
  UpdateWebhookSchema,
} from "./schema";

export const listWebhookEventsHandler: RouteHandler = async (
  request,
  reply,
) => {
  if (!requireUserId(request, reply)) {
    return reply;
  }
  return reply.send(WEBHOOK_EVENTS);
};

export const listApiKeysHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }
  return reply.send(await listApiKeys(userId));
};

export const createApiKeyHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { apiKey, plaintext } = await createApiKey(userId, parsed.data);
  appLogger.info("API key created", { userId, apiKeyId: apiKey.id });

  return reply.code(201).send({ apiKey, plaintext });
};

export const updateApiKeyHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await updateApiKey(userId, id, parsed.data);

  return updated ? reply.send(updated) : notFound(reply, "API key");
};

export const revokeApiKeyHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const revoked = await revokeApiKey(userId, id);

  if (revoked) {
    appLogger.info("API key revoked", { userId, apiKeyId: id });
    return reply.send(revoked);
  }

  return notFound(reply, "active API key");
};

export const deleteApiKeyHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteApiKey(userId, id);

  return deleted ? reply.code(204).send() : notFound(reply, "API key");
};

export const listWebhooksHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }
  return reply.send(await listWebhooks(userId));
};

export const createWebhookHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateWebhookSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { webhook, plaintext } = await createWebhook(userId, parsed.data);
  appLogger.info("Webhook created", { userId, webhookId: webhook.id });

  return reply.code(201).send({ webhook, plaintext });
};

export const updateWebhookHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateWebhookSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await updateWebhook(userId, id, parsed.data);

  return updated ? reply.send(updated) : notFound(reply, "webhook");
};

export const rotateWebhookSecretHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const rotated = await rotateWebhookSecret(userId, id);

  if (!rotated) {
    return notFound(reply, "webhook");
  }

  appLogger.info("Webhook secret rotated", { userId, webhookId: id });
  return reply.send(rotated);
};

export const deleteWebhookHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteWebhook(userId, id);

  return deleted ? reply.code(204).send() : notFound(reply, "webhook");
};
