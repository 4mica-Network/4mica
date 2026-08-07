import type { FastifyPluginCallback } from "fastify";
import {
  createApiKeyHandler,
  createWebhookHandler,
  deleteApiKeyHandler,
  deleteWebhookHandler,
  listApiKeysHandler,
  listWebhookEventsHandler,
  listWebhooksHandler,
  revokeApiKeyHandler,
  rotateWebhookSecretHandler,
  updateApiKeyHandler,
  updateWebhookHandler,
} from "../controllers/developer/index";
import { guards } from "./guards";
import {
  apiKeyResponseSchema,
  createdApiKeyResponseSchema,
  createdWebhookResponseSchema,
  errorResponseSchema,
  webhookEventsResponseSchema,
  webhookResponseSchema,
} from "./schema-fragments";

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
    listWebhookEventsHandler,
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
    listApiKeysHandler,
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
    createApiKeyHandler,
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
    updateApiKeyHandler,
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
    revokeApiKeyHandler,
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
    deleteApiKeyHandler,
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
    listWebhooksHandler,
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
    createWebhookHandler,
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
    updateWebhookHandler,
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
    rotateWebhookSecretHandler,
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
    deleteWebhookHandler,
  );

  done();
};
