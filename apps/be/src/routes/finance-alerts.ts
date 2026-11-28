import {
  acknowledgeAlertHandler,
  listAlertsHandler,
} from "@controllers/finance-alerts/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const str = { type: "string" } as const;
const nullStr = { type: "string", nullable: true } as const;
const date = { type: "string", format: "date-time" } as const;
const kinds = [
  "BUDGET_THRESHOLD",
  "UNAUTHORIZED_SPEND",
  "POLICY_DENIAL",
  "APPROVAL_REQUESTED",
];

const alertSchema = {
  type: "object",
  required: ["id", "kind", "title", "createdAt"],
  properties: {
    id: str,
    kind: { type: "string", enum: kinds },
    title: str,
    detail: { type: "object", additionalProperties: true },
    policyId: nullStr,
    projectId: nullStr,
    createdAt: date,
    acknowledgedAt: { ...date, nullable: true },
    acknowledgedBy: {
      type: "object",
      nullable: true,
      properties: { id: str, name: str },
    },
  },
} as const;

export const financeAlertRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.get(
    "/me/finance/alerts",
    {
      ...base,
      schema: {
        tags: ["finance"],
        summary: "List financial alerts, newest first",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            acknowledged: { type: "boolean" },
            kind: { type: "string", enum: kinds },
            cursor: { type: "string", maxLength: 64 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        response: {
          ...limitedResponses,
          200: {
            type: "object",
            required: ["items", "nextCursor"],
            properties: {
              items: { type: "array", items: alertSchema },
              nextCursor: nullStr,
            },
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    listAlertsHandler,
  );

  app.post(
    "/me/finance/alerts/:id/acknowledge",
    {
      onRequest: base.onRequest,
      preHandler: [...base.preHandler, sensitiveRateLimit(app)],
      schema: {
        tags: ["finance"],
        summary: "Acknowledge an alert",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: idParam },
        },
        response: {
          ...limitedResponses,
          200: alertSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    acknowledgeAlertHandler,
  );

  done();
};
