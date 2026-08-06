import type {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { appLogger } from "../logger/index";
import {
  CreateApiKeySchema,
  CreateWebhookSchema,
  UpdateApiKeySchema,
  UpdateWebhookSchema,
} from "../schemas/developer";
import { parseBody } from "../schemas/profile";
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
} from "../services/developer";
import { WEBHOOK_EVENTS } from "../services/webhook-events";
import {
  apiKeyResponseSchema,
  createdApiKeyResponseSchema,
  createdWebhookResponseSchema,
  errorResponseSchema,
  webhookEventsResponseSchema,
  webhookResponseSchema,
} from "./schema-fragments";

const requireUserId = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  if (!request.user) {
    reply.code(401).send({
      error: "unauthorized",
      message: "No user context is attached to this request.",
    });
    return null;
  }

  if (request.user.disabled) {
    reply.code(403).send({
      error: "account_disabled",
      message: "This account cannot be modified.",
    });
    return null;
  }

  return request.user.id;
};

const notFound = (reply: FastifyReply, what: string) =>
  reply.code(404).send({
    error: "not_found",
    message: `That ${what} does not exist.`,
  });

const guards = (app: Parameters<FastifyPluginCallback>[0]) => ({
  onRequest: [app.authenticate],
  preHandler: [app.getUserData],
});

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

export const developerRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/webhook-events",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Events a webhook can subscribe to",
        security: [{ bearerAuth: [] }],
        response: {
          200: webhookEventsResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!requireUserId(request, reply)) {
        return reply;
      }
      return reply.send(WEBHOOK_EVENTS);
    },
  );

  app.get(
    "/me/api-keys",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "List the account's API keys",
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: "array", items: apiKeyResponseSchema },
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }
      return reply.send(await listApiKeys(userId));
    },
  );

  app.post(
    "/me/api-keys",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Create an API key. The plaintext is returned only here.",
        security: [{ bearerAuth: [] }],
        response: {
          201: createdApiKeyResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const parsed = parseBody(CreateApiKeySchema, request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: parsed.issues,
        });
      }

      const { apiKey, plaintext } = await createApiKey(userId, parsed.data);
      appLogger.info("API key created", { userId, apiKeyId: apiKey.id });

      return reply.code(201).send({ apiKey, plaintext });
    },
  );

  app.patch(
    "/me/api-keys/:id",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Rename an API key",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: apiKeyResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const parsed = parseBody(UpdateApiKeySchema, request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: parsed.issues,
        });
      }

      const { id } = request.params as { id: string };
      const updated = await updateApiKey(userId, id, parsed.data);

      return updated ? reply.send(updated) : notFound(reply, "API key");
    },
  );

  app.post(
    "/me/api-keys/:id/revoke",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Revoke an API key without deleting its audit trail",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: apiKeyResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
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
    },
  );

  app.delete(
    "/me/api-keys/:id",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Delete an API key",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const { id } = request.params as { id: string };
      const deleted = await deleteApiKey(userId, id);

      return deleted ? reply.code(204).send() : notFound(reply, "API key");
    },
  );

  app.get(
    "/me/webhooks",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "List the account's webhook endpoints",
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: "array", items: webhookResponseSchema },
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }
      return reply.send(await listWebhooks(userId));
    },
  );

  app.post(
    "/me/webhooks",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Create a webhook. The signing secret is returned only here.",
        security: [{ bearerAuth: [] }],
        response: {
          201: createdWebhookResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const parsed = parseBody(CreateWebhookSchema, request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: parsed.issues,
        });
      }

      const { webhook, plaintext } = await createWebhook(userId, parsed.data);
      appLogger.info("Webhook created", { userId, webhookId: webhook.id });

      return reply.code(201).send({ webhook, plaintext });
    },
  );

  app.patch(
    "/me/webhooks/:id",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Update a webhook's url, events or status",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: webhookResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const parsed = parseBody(UpdateWebhookSchema, request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: parsed.issues,
        });
      }

      const { id } = request.params as { id: string };
      const updated = await updateWebhook(userId, id, parsed.data);

      return updated ? reply.send(updated) : notFound(reply, "webhook");
    },
  );

  app.post(
    "/me/webhooks/:id/rotate-secret",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Issue a new signing secret for a webhook",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: createdWebhookResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
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
    },
  );

  app.delete(
    "/me/webhooks/:id",
    {
      ...guards(app),
      schema: {
        tags: ["developer"],
        summary: "Delete a webhook endpoint",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const { id } = request.params as { id: string };
      const deleted = await deleteWebhook(userId, id);

      return deleted ? reply.code(204).send() : notFound(reply, "webhook");
    },
  );

  done();
};
