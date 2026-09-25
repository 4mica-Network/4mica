import {
  batchDeleteAgentsHandler,
  createAgentHandler,
  deleteAgentHandler,
  getAgentHandler,
  listAgentsHandler,
  publishAgentHandler,
  unpublishAgentHandler,
  updateAgentHandler,
} from "@controllers/agents/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  agentListResponseSchema,
  agentResponseSchema,
  batchDeleteResponseSchema,
  errorResponseSchema,
  limitedResponses,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const listQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    q: { type: "string", maxLength: 100 },
    status: { type: "string", enum: ["PENDING", "ACTIVE", "SUSPENDED"] },
    visibility: { type: "string", enum: ["PRIVATE", "UNLISTED", "PUBLIC"] },
    network: {
      type: "string",
      enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
    },
    sort: {
      type: "string",
      enum: [
        "createdAt",
        "-createdAt",
        "updatedAt",
        "-updatedAt",
        "name",
        "-name",
      ],
    },
  },
} as const;

export const agentRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/agents",
    {
      ...base,
      schema: {
        tags: ["agents"],
        summary: "List the account's agents",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: agentListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listAgentsHandler,
  );

  app.get(
    "/me/agents/:id",
    {
      ...base,
      schema: {
        tags: ["agents"],
        summary: "Fetch one agent",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: agentResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getAgentHandler,
  );

  app.post(
    "/me/agents",
    {
      ...strict,
      schema: {
        tags: ["agents"],
        summary: "Create an agent",
        description:
          "An agent has a payer half (`payerWalletId`, `creditLimit`) and a seller half (`walletId`, price, `endpointUrl`). Both addresses are derived from the wallet ids; neither is accepted from the body. `status` accepts PENDING or ACTIVE — SUSPENDED is a moderation outcome, not a self-service one.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: agentResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createAgentHandler,
  );

  app.patch(
    "/me/agents/:id",
    {
      ...strict,
      schema: {
        tags: ["agents"],
        summary: "Update an agent",
        description:
          "`network` is only movable while both wallets are unlinked. Setting either wallet id to null clears the address derived from it.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: agentResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateAgentHandler,
  );

  app.post(
    "/me/agents/:id/publish",
    {
      ...strict,
      schema: {
        tags: ["agents"],
        summary: "Publish an agent to the public profile",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: agentResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    publishAgentHandler,
  );

  app.post(
    "/me/agents/:id/unpublish",
    {
      ...strict,
      schema: {
        tags: ["agents"],
        summary: "Hide an agent from the public profile",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: agentResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    unpublishAgentHandler,
  );

  app.delete(
    "/me/agents/:id",
    {
      ...strict,
      schema: {
        tags: ["agents"],
        summary: "Remove an agent",
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
    deleteAgentHandler,
  );

  app.post(
    "/me/agents/batch-delete",
    {
      ...strict,
      schema: {
        tags: ["agents"],
        summary: "Remove up to 100 agents at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    batchDeleteAgentsHandler,
  );

  done();
};
