import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { WEBHOOK_EVENTS } from "@utils/webhook-events";
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
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }
  return reply.send(await listApiKeys(tenant.orgId));
};

export const createApiKeyHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { apiKey, plaintext } = await createApiKey(
    tenant.orgId,
    tenant.userId,
    parsed.data,
  );
  await audit(request, tenant, {
    action: "api_key.created",
    targetType: "api_key",
    targetId: apiKey.id,
  });
  appLogger.info("API key created", {
    userId: tenant.userId,
    apiKeyId: apiKey.id,
  });

  return reply.code(201).send({ apiKey, plaintext });
};

export const updateApiKeyHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await updateApiKey(tenant.orgId, id, parsed.data);

  if (!updated) {
    return notFound(reply, "API key");
  }

  await audit(request, tenant, {
    action: "api_key.updated",
    targetType: "api_key",
    targetId: id,
  });
  return reply.send(updated);
};

export const revokeApiKeyHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const revoked = await revokeApiKey(tenant.orgId, id);

  if (revoked) {
    await audit(request, tenant, {
      action: "api_key.revoked",
      targetType: "api_key",
      targetId: id,
    });
    appLogger.info("API key revoked", { userId: tenant.userId, apiKeyId: id });
    return reply.send(revoked);
  }

  return notFound(reply, "active API key");
};

export const deleteApiKeyHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteApiKey(tenant.orgId, id);

  if (!deleted) {
    return notFound(reply, "API key");
  }

  await audit(request, tenant, {
    action: "api_key.deleted",
    targetType: "api_key",
    targetId: id,
  });
  return reply.code(204).send();
};

export const listWebhooksHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }
  return reply.send(await listWebhooks(tenant.orgId));
};

export const createWebhookHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateWebhookSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { webhook, plaintext } = await createWebhook(
    tenant.orgId,
    tenant.userId,
    parsed.data,
  );
  await audit(request, tenant, {
    action: "webhook.created",
    targetType: "webhook",
    targetId: webhook.id,
  });
  appLogger.info("Webhook created", {
    userId: tenant.userId,
    webhookId: webhook.id,
  });

  return reply.code(201).send({ webhook, plaintext });
};

export const updateWebhookHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateWebhookSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await updateWebhook(tenant.orgId, id, parsed.data);

  if (!updated) {
    return notFound(reply, "webhook");
  }

  await audit(request, tenant, {
    action: "webhook.updated",
    targetType: "webhook",
    targetId: id,
  });
  return reply.send(updated);
};

export const rotateWebhookSecretHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const rotated = await rotateWebhookSecret(tenant.orgId, id);

  if (!rotated) {
    return notFound(reply, "webhook");
  }

  await audit(request, tenant, {
    action: "webhook.secret_rotated",
    targetType: "webhook",
    targetId: id,
  });
  appLogger.info("Webhook secret rotated", {
    userId: tenant.userId,
    webhookId: id,
  });
  return reply.send(rotated);
};

export const deleteWebhookHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.write");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteWebhook(tenant.orgId, id);

  if (!deleted) {
    return notFound(reply, "webhook");
  }

  await audit(request, tenant, {
    action: "webhook.deleted",
    targetType: "webhook",
    targetId: id,
  });
  return reply.code(204).send();
};
