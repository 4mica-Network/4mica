import {
  batchDeleteSupportRequestsHandler,
  createSupportMessageHandler,
  createSupportRequestHandler,
  deleteSupportRequestHandler,
  getSupportRequestHandler,
  getSupportStatsHandler,
  listSupportRequestsHandler,
  updateSupportRequestHandler,
} from "@controllers/support/index";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
} from "@controllers/support/schema";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  batchDeleteResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
  supportMessageResponseSchema,
  supportRequestDetailResponseSchema,
  supportRequestListResponseSchema,
  supportRequestResponseSchema,
  supportStatsResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const listQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    q: { type: "string", maxLength: 100 },
    status: { type: "string", enum: SUPPORT_STATUSES },
    category: { type: "string", enum: SUPPORT_CATEGORIES },
    sort: {
      type: "string",
      enum: ["lastActivityAt", "-lastActivityAt", "createdAt", "-createdAt"],
    },
  },
} as const;

export const supportRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/support-requests",
    {
      ...base,
      schema: {
        tags: ["support"],
        summary: "List the account's support requests",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: supportRequestListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listSupportRequestsHandler,
  );

  app.get(
    "/me/support-requests/stats",
    {
      ...base,
      schema: {
        tags: ["support"],
        summary: "Counts and response time across the account's requests",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: supportStatsResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    getSupportStatsHandler,
  );

  app.get(
    "/me/support-requests/:id",
    {
      ...base,
      schema: {
        tags: ["support"],
        summary: "Fetch one support request with its conversation",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: supportRequestDetailResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getSupportRequestHandler,
  );

  app.post(
    "/me/support-requests",
    {
      ...strict,
      schema: {
        tags: ["support"],
        summary: "Open a support request",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: supportRequestResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    createSupportRequestHandler,
  );

  app.patch(
    "/me/support-requests/:id",
    {
      ...base,
      schema: {
        tags: ["support"],
        summary: "Edit a request, close it, or reopen it",
        description:
          "A customer can only move a request to CLOSED, or back to OPEN from RESOLVED or CLOSED. The other statuses are set by the support team.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: supportRequestResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateSupportRequestHandler,
  );

  app.post(
    "/me/support-requests/:id/messages",
    {
      ...strict,
      schema: {
        tags: ["support"],
        summary: "Reply on a support request",
        description:
          "Replying to a request that is waiting on you or resolved moves it back to OPEN.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          201: supportMessageResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createSupportMessageHandler,
  );

  app.delete(
    "/me/support-requests/:id",
    {
      ...base,
      schema: {
        tags: ["support"],
        summary: "Delete a support request",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    deleteSupportRequestHandler,
  );

  app.post(
    "/me/support-requests/batch-delete",
    {
      ...base,
      schema: {
        tags: ["support"],
        summary: "Delete up to 100 support requests at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    batchDeleteSupportRequestsHandler,
  );

  done();
};
