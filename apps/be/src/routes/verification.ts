import {
  sendVerificationEmailHandler,
  verifyEmailHandler,
} from "@controllers/verification/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  errorResponseSchema,
  limitedResponses,
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
        summary: "Send a verification link to the account's email address",
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

  app.get(
    "/verify-email",
    {
      schema: {
        tags: ["verification"],
        summary: "Consume a verification link and return to the dashboard",
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
