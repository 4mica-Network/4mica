import {
  createStreamHandler,
  deleteStreamHandler,
  listStreamsHandler,
  resumeStreamHandler,
  rotateStreamSecretHandler,
  testStreamHandler,
  updateStreamHandler,
} from "@controllers/audit-streams/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const str = { type: "string" } as const;
const nullStr = { type: ["string", "null"] } as const;
const nullInt = { type: ["integer", "null"] } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nullDateTime = { type: ["string", "null"], format: "date-time" } as const;

const errorSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    reauthWithinMinutes: { type: "integer" },
  },
} as const;

const streamSchema = {
  type: "object",
  required: ["id", "name", "url", "status", "actionPrefixes"],
  properties: {
    id: str,
    name: str,
    url: str,
    status: { type: "string", enum: ["ACTIVE", "PAUSED", "FAILING"] },
    actionPrefixes: { type: "array", items: str },
    secretPrefix: nullStr,
    lastDeliveryAt: nullDateTime,
    lastStatusCode: nullInt,
    lastError: nullStr,
    consecutiveFailures: { type: "integer" },
    nextAttemptAt: nullDateTime,
    createdAt: dateTime,
  },
} as const;

const withSecretSchema = {
  type: "object",
  required: ["stream", "secret"],
  properties: { stream: streamSchema, secret: str },
} as const;

const idParams = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const doc = (summary: string, response: Record<number, unknown>) => ({
  tags: ["organizations"],
  summary,
  security: [{ bearerAuth: [] }],
  response: {
    ...limitedResponses,
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    503: errorSchema,
    ...response,
  },
});

export const auditStreamRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);
  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };
  const byId = (summary: string, response: Record<number, unknown>) => ({
    ...strict,
    schema: { ...doc(summary, response), params: idParams },
  });

  app.get(
    "/me/organization/audit-streams",
    {
      ...base,
      schema: doc("List the organization's audit streams", {
        200: {
          type: "object",
          required: ["items"],
          properties: { items: { type: "array", items: streamSchema } },
        },
      }),
    },
    listStreamsHandler,
  );

  app.post(
    "/me/organization/audit-streams",
    {
      ...strict,
      schema: doc("Stream audit events to an HTTPS endpoint", {
        201: withSecretSchema,
      }),
    },
    createStreamHandler,
  );

  app.patch(
    "/me/organization/audit-streams/:id",
    byId("Change an audit stream", { 200: streamSchema }),
    updateStreamHandler,
  );

  app.delete(
    "/me/organization/audit-streams/:id",
    byId("Delete an audit stream", { 204: { type: "null" } }),
    deleteStreamHandler,
  );

  app.post(
    "/me/organization/audit-streams/:id/rotate-secret",
    byId("Issue a new signing secret", { 200: withSecretSchema }),
    rotateStreamSecretHandler,
  );

  app.post(
    "/me/organization/audit-streams/:id/test",
    byId("Send one synthetic event", {
      200: {
        type: "object",
        required: ["delivered"],
        properties: {
          delivered: { type: "boolean" },
          statusCode: nullInt,
          error: nullStr,
          deliveryId: str,
        },
      },
    }),
    testStreamHandler,
  );

  app.post(
    "/me/organization/audit-streams/:id/resume",
    byId("Resume a paused or failing stream", { 200: streamSchema }),
    resumeStreamHandler,
  );

  done();
};
