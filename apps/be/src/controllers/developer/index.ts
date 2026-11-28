import { requireProductionKeyApproval } from "@controllers/approvals/key-gate";
import {
  invalidBody,
  notFound,
  parseBody,
  requireProject,
  requireUserId,
  withProjectAudit,
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
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }
  return reply.send(await listApiKeys(scope));
};

export const createApiKeyHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const gate = await requireProductionKeyApproval(
    request,
    reply,
    scope,
    { kind: "account", ...parsed.data },
    `Create API key "${parsed.data.name}"`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const { apiKey, plaintext } = await withProjectAudit(
    request,
    scope,
    (tx) => createApiKey(scope, scope.userId, parsed.data, tx),
    (created) => ({
      action: "api_key.created",
      targetType: "api_key",
      targetId: created.apiKey.id,
      ...(gate.approvalId ? { metadata: { approvalId: gate.approvalId } } : {}),
    }),
  );
  appLogger.info("API key created", {
    userId: scope.userId,
    apiKeyId: apiKey.id,
  });

  return reply.code(201).send({ apiKey, plaintext });
};

export const updateApiKeyHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await withProjectAudit(
    request,
    scope,
    (tx) => updateApiKey(scope, id, parsed.data, tx),
    (row) =>
      row && {
        action: "api_key.updated",
        targetType: "api_key",
        targetId: id,
        metadata: parsed.data,
      },
  );

  if (!updated) {
    return notFound(reply, "API key");
  }

  return reply.send(updated);
};

export const revokeApiKeyHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const revoked = await withProjectAudit(
    request,
    scope,
    (tx) => revokeApiKey(scope, id, tx),
    (row) =>
      row && { action: "api_key.revoked", targetType: "api_key", targetId: id },
  );

  if (revoked) {
    appLogger.info("API key revoked", { userId: scope.userId, apiKeyId: id });
    return reply.send(revoked);
  }

  return notFound(reply, "active API key");
};

export const deleteApiKeyHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await withProjectAudit(
    request,
    scope,
    (tx) => deleteApiKey(scope, id, tx),
    (found) =>
      found
        ? { action: "api_key.deleted", targetType: "api_key", targetId: id }
        : null,
  );

  if (!deleted) {
    return notFound(reply, "API key");
  }

  return reply.code(204).send();
};

export const listWebhooksHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }
  return reply.send(await listWebhooks(scope));
};

export const createWebhookHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateWebhookSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { webhook, plaintext } = await withProjectAudit(
    request,
    scope,
    (tx) => createWebhook(scope, scope.userId, parsed.data, tx),
    (created) => ({
      action: "webhook.created",
      targetType: "webhook",
      targetId: created.webhook.id,
    }),
  );
  appLogger.info("Webhook created", {
    userId: scope.userId,
    webhookId: webhook.id,
  });

  return reply.code(201).send({ webhook, plaintext });
};

export const updateWebhookHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateWebhookSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const updated = await withProjectAudit(
    request,
    scope,
    (tx) => updateWebhook(scope, id, parsed.data, tx),
    (row) =>
      row && { action: "webhook.updated", targetType: "webhook", targetId: id },
  );

  if (!updated) {
    return notFound(reply, "webhook");
  }

  return reply.send(updated);
};

export const rotateWebhookSecretHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const rotated = await withProjectAudit(
    request,
    scope,
    (tx) => rotateWebhookSecret(scope, id, tx),
    (row) =>
      row && {
        action: "webhook.secret_rotated",
        targetType: "webhook",
        targetId: id,
      },
  );

  if (!rotated) {
    return notFound(reply, "webhook");
  }

  appLogger.info("Webhook secret rotated", {
    userId: scope.userId,
    webhookId: id,
  });
  return reply.send(rotated);
};

export const deleteWebhookHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await withProjectAudit(
    request,
    scope,
    (tx) => deleteWebhook(scope, id, tx),
    (found) =>
      found
        ? { action: "webhook.deleted", targetType: "webhook", targetId: id }
        : null,
  );

  if (!deleted) {
    return notFound(reply, "webhook");
  }

  return reply.code(204).send();
};
