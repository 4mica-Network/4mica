import { authenticateApiKey } from "@auth/api-key";
import {
  getPaymentHandler,
  listPaymentsHandler,
  paymentStatsHandler,
  paymentSummaryHandler,
  reportPaymentHandler,
} from "@controllers/payments/index";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  limitedResponses,
  paymentListResponseSchema,
  paymentResponseSchema,
  paymentStatsResponseSchema,
  paymentSummaryResponseSchema,
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
    direction: { type: "string", enum: ["sent", "received", "all"] },
    status: { type: "string", enum: ["PENDING", "SETTLED", "FAILED"] },
    network: {
      type: "string",
      enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
    },
    q: { type: "string", maxLength: 100 },
    sort: {
      type: "string",
      enum: ["createdAt", "-createdAt", "amount", "-amount"],
    },
  },
} as const;

export const paymentRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.get(
    "/me/payments",
    {
      ...base,
      schema: {
        tags: ["payments"],
        summary: "List payments this account sent or received",
        description:
          "Scoped by the wallet addresses the caller has proved they control, not by who reported the payment — so a buyer and a seller both see the same row.",
        security: [{ bearerAuth: [] }],
        querystring: listQuerySchema,
        response: {
          ...limitedResponses,
          200: paymentListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    listPaymentsHandler,
  );

  app.get(
    "/me/payments/summary",
    {
      ...base,
      schema: {
        tags: ["payments"],
        summary: "Counts and settled volume, split by direction",
        description:
          "Volume is grouped by asset and network so two different tokens are never added together.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: paymentSummaryResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    paymentSummaryHandler,
  );

  app.get(
    "/me/payments/stats",
    {
      ...base,
      schema: {
        tags: ["payments"],
        summary: "Settled volume and counts, bucketed by month",
        description:
          "Months are UTC and always contiguous, including empty ones, so a chart never has to guess at a gap.",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: { months: { type: "integer", minimum: 1, maximum: 24 } },
        },
        response: {
          ...limitedResponses,
          200: paymentStatsResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    paymentStatsHandler,
  );

  app.get(
    "/me/payments/:id",
    {
      ...base,
      schema: {
        tags: ["payments"],
        summary: "Fetch one payment",
        security: [{ bearerAuth: [] }],
        params: idParamSchema,
        response: {
          ...limitedResponses,
          200: paymentResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getPaymentHandler,
  );

  app.post(
    "/v1/payments",
    {
      onRequest: [authenticateApiKey],
      schema: {
        tags: ["payments"],
        summary: "Report a payment your service took",
        description:
          "Idempotent on `reqId`, which the payer mints once per payment — a retry after a timeout updates the existing row rather than creating a second one. Returns 201 the first time and 200 thereafter.",
        security: [{ apiKeyAuth: [] }],
        response: {
          ...limitedResponses,
          200: paymentResponseSchema,
          201: paymentResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    reportPaymentHandler,
  );

  done();
};
