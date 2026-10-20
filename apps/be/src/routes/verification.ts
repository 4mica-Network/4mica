import {
  confirmEmailHandler,
  sendVerificationEmailHandler,
  verifyEmailHandler,
} from "@controllers/verification/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  limitedResponses,
  userResponseSchema,
  verificationSentResponseSchema,
} from "./schema-fragments";

export const verificationRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const base = guards(app);

  app.post(
    "/me/email/verification",
    {
      onRequest: base.onRequest,
      preHandler: [...base.preHandler, sensitiveRateLimit(app)],
      schema: {
        tags: ["verification"],
        summary:
          "Send a verification link to the pending email address, or to the current one if it was never verified",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          202: verificationSentResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    sendVerificationEmailHandler,
  );

  app.post(
    "/me/email/verification/confirm",
    {
      onRequest: base.onRequest,
      preHandler: [...base.preHandler, sensitiveRateLimit(app)],
      schema: {
        tags: ["verification"],
        summary: "Spend a verification link as the signed-in user",
        description:
          "The token must have been minted for the caller. A link for a pending address promotes it to the account email.",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string" } },
        },
        response: {
          ...limitedResponses,
          200: userResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    confirmEmailHandler,
  );

  app.get(
    "/verify-email",
    {
      schema: {
        tags: ["verification"],
        summary: "Forward a verification link to the dashboard to confirm",
        description:
          "Never spends the token: a GET can be prefetched by mail scanners. The dashboard confirms through POST /me/email/verification/confirm.",
        querystring: {
          type: "object",
          properties: { token: { type: "string" } },
        },
        response: { ...limitedResponses, 303: { type: "null" } },
      },
    },
    verifyEmailHandler,
  );

  done();
};
