import { authenticateCliToken } from "@auth/cli-token";
import {
  approveDeviceRequestHandler,
  createCliTokenHandler,
  createDeviceCodeHandler,
  denyDeviceRequestHandler,
  deviceTokenHandler,
  getCurrentCliSessionHandler,
  getDeviceRequestHandler,
  listCliSessionsHandler,
  revokeCliSessionHandler,
  revokeCurrentCliSessionHandler,
} from "@controllers/cli/index";
import {
  publicSensitiveRateLimit,
  sensitiveRateLimit,
} from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  cliCurrentSessionResponseSchema,
  cliDeviceCodeResponseSchema,
  cliDeviceRequestResponseSchema,
  cliDeviceTokenResponseSchema,
  cliSessionResponseSchema,
  createdCliTokenResponseSchema,
  errorResponseSchema,
  idParam,
  limitedResponses,
} from "./schema-fragments";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: idParam },
} as const;

const userCodeBodySchema = {
  type: "object",
  required: ["userCode"],
  properties: { userCode: { type: "string", maxLength: 32 } },
} as const;

export const cliRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  const strict = {
    onRequest: base.onRequest,
    preHandler: [...base.preHandler, sensitiveRateLimit(app)],
  };

  app.post(
    "/v1/cli/device/code",
    {
      preHandler: [publicSensitiveRateLimit(app)],
      schema: {
        tags: ["cli"],
        summary: "Start a CLI sign-in: get a code to approve in the dashboard",
        description:
          "RFC 8628 device authorization. Unauthenticated by design; the request grants nothing until a signed-in user approves its user code.",
        body: {
          type: "object",
          properties: { client_name: { type: "string", maxLength: 120 } },
        },
        response: {
          ...limitedResponses,
          200: cliDeviceCodeResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    createDeviceCodeHandler,
  );

  app.post(
    "/v1/cli/device/token",
    {
      schema: {
        tags: ["cli"],
        summary: "Poll a CLI sign-in for its access token",
        description:
          "Answers 400 with authorization_pending, slow_down, access_denied or expired_token until the request is approved, then returns the token exactly once.",
        response: {
          ...limitedResponses,
          200: cliDeviceTokenResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    deviceTokenHandler,
  );

  app.get(
    "/v1/cli/session",
    {
      onRequest: [authenticateCliToken("account:read")],
      schema: {
        tags: ["cli"],
        summary: "The account and session a CLI token belongs to",
        security: [{ cliTokenAuth: [] }],
        response: {
          ...limitedResponses,
          200: cliCurrentSessionResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    getCurrentCliSessionHandler,
  );

  app.delete(
    "/v1/cli/session",
    {
      onRequest: [authenticateCliToken(null)],
      schema: {
        tags: ["cli"],
        summary: "Revoke the CLI token making this request",
        security: [{ cliTokenAuth: [] }],
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
        },
      },
    },
    revokeCurrentCliSessionHandler,
  );

  app.get(
    "/me/cli/device",
    {
      ...strict,
      schema: {
        tags: ["cli"],
        summary: "Look up the CLI sign-in waiting behind a user code",
        security: [{ bearerAuth: [] }],
        querystring: userCodeBodySchema,
        response: {
          ...limitedResponses,
          200: cliDeviceRequestResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    getDeviceRequestHandler,
  );

  app.post(
    "/me/cli/device/approve",
    {
      ...strict,
      schema: {
        tags: ["cli"],
        summary: "Approve a CLI sign-in for the signed-in account",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    approveDeviceRequestHandler,
  );

  app.post(
    "/me/cli/device/deny",
    {
      ...strict,
      schema: {
        tags: ["cli"],
        summary: "Deny a CLI sign-in",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          204: { type: "null" },
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    denyDeviceRequestHandler,
  );

  app.get(
    "/me/cli/sessions",
    {
      ...base,
      schema: {
        tags: ["cli"],
        summary: "List the account's active CLI sessions",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: { type: "array", items: cliSessionResponseSchema },
          401: errorResponseSchema,
        },
      },
    },
    listCliSessionsHandler,
  );

  app.post(
    "/me/cli/sessions",
    {
      ...strict,
      schema: {
        tags: ["cli"],
        summary:
          "Create a CLI token for CI. The plaintext is returned only here.",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          201: createdCliTokenResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    createCliTokenHandler,
  );

  app.delete(
    "/me/cli/sessions/:id",
    {
      ...strict,
      schema: {
        tags: ["cli"],
        summary: "Revoke a CLI session",
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
    revokeCliSessionHandler,
  );

  done();
};
