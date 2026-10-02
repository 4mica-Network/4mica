import {
  addCustomerIdentityHandler,
  batchDeleteCustomersHandler,
  createCustomerHandler,
  customerActivityHandler,
  customerBreakdownHandler,
  customerOverviewHandler,
  deleteCustomerHandler,
  getCustomerHandler,
  listCustomersHandler,
  removeCustomerIdentityHandler,
  resetCustomerUsageHandler,
  setCustomerPolicyHandler,
  setCustomerStatusHandler,
  updateCustomerHandler,
  updateCustomerIdentityHandler,
} from "@controllers/customers/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  batchDeleteResponseSchema,
  customerBreakdownResponseSchema,
  customerListResponseSchema,
  customerOverviewResponseSchema,
  customerResponseSchema,
  errorResponseSchema,
  limitedResponses,
  paymentListResponseSchema,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

const identityParamSchema = {
  type: "object",
  required: ["id", "identityId"],
  properties: { id: { type: "string" }, identityId: { type: "string" } },
} as const;

const networkEnum = {
  type: "string",
  enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
} as const;

const listQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    q: { type: "string", maxLength: 100 },
    type: {
      type: "string",
      enum: ["HUMAN", "ORGANIZATION", "AGENT", "WALLET"],
    },
    status: { type: "string", enum: ["ACTIVE", "BLOCKED", "SUSPENDED"] },
    network: networkEnum,
    source: {
      type: "string",
      enum: ["MANUAL", "API", "VERIFIED", "DISCOVERED"],
    },
    sort: {
      type: "string",
      enum: [
        "totalSpend",
        "-totalSpend",
        "recentSpend",
        "-recentSpend",
        "txnCount",
        "-txnCount",
        "lastActiveAt",
        "-lastActiveAt",
        "name",
        "-name",
        "createdAt",
        "-createdAt",
      ],
    },
  },
} as const;

const activityQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
    status: { type: "string", enum: ["PENDING", "SETTLED", "FAILED"] },
    network: networkEnum,
    sort: {
      type: "string",
      enum: ["createdAt", "-createdAt", "amount", "-amount"],
    },
  },
} as const;

export const customerRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.get(
    "/me/customers",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "List the account's customers",
        description:
          "Spend, transaction count and last activity are derived by matching each customer's wallet identities against payments received by this account's own wallets — a payer who also pays someone else contributes nothing here.",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: customerListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listCustomersHandler,
  );

  app.post(
    "/me/customers/batch-delete",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Remove up to 100 customers at once",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: batchDeleteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    batchDeleteCustomersHandler,
  );

  app.get(
    "/me/customers/:id",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Fetch one customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getCustomerHandler,
  );

  app.post(
    "/me/customers",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Create a customer",
        description:
          "Payment identities may be attached in the same call. Spend limits are advisory — 4Mica is not in the payment path for reported payments, so nothing enforces them.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    createCustomerHandler,
  );

  app.patch(
    "/me/customers/:id",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Update a customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    updateCustomerHandler,
  );

  app.patch(
    "/me/customers/:id/status",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Block, suspend or reactivate a customer",
        description:
          "A suspension needs an end date and lapses on its own once that passes. Reactivating clears both the end date and the reason.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    setCustomerStatusHandler,
  );

  app.patch(
    "/me/customers/:id/policy",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Set what this customer is charged",
        description:
          "A free allowance is a unit, an amount and a period together, or nothing. Writing one starts its window now, so the allowance is never already spent by earlier payments.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    setCustomerPolicyHandler,
  );

  app.post(
    "/me/customers/:id/reset-usage",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Start the free allowance window again",
        description:
          "Moves the line usage is counted from to now, so the customer gets a full allowance without their payment history being touched.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    resetCustomerUsageHandler,
  );

  app.delete(
    "/me/customers/:id",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Remove a customer",
        description:
          "Soft deletes the customer and drops its payment identities, which frees those addresses to be mapped to another customer.",
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
    deleteCustomerHandler,
  );

  app.post(
    "/me/customers/:id/identities",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Attach a payment identity to a customer",
        description:
          "A WALLET identity matches on network and address together. Attaching one surfaces that address's existing history, bounded by `validFrom`/`validUntil` when they are set.",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          201: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    addCustomerIdentityHandler,
  );

  app.patch(
    "/me/customers/:id/identities/:identityId",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Block an identity, or change its window or source",
        security: [{ bearerAuth: [] }],
        params: identityParamSchema,
        response: {
          ...limitedResponses,
          200: customerResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    updateCustomerIdentityHandler,
  );

  app.delete(
    "/me/customers/:id/identities/:identityId",
    {
      ...strict,
      schema: {
        tags: ["customers"],
        summary: "Detach a payment identity",
        security: [{ bearerAuth: [] }],
        params: identityParamSchema,
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    removeCustomerIdentityHandler,
  );

  app.get(
    "/me/customers/:id/overview",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Spend and activity totals for one customer",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerOverviewResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    customerOverviewHandler,
  );

  app.get(
    "/me/customers/:id/activity",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "Payments this customer made to the account",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        querystring: activityQuerySchema,
        response: {
          ...limitedResponses,
          200: paymentListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    customerActivityHandler,
  );

  app.get(
    "/me/customers/:id/breakdown",
    {
      ...base,
      schema: {
        tags: ["customers"],
        summary: "What this customer paid for, by agent and API",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: customerBreakdownResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    customerBreakdownHandler,
  );

  done();
};
