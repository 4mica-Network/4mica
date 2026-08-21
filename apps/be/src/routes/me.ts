import {
  checkUsernameHandler,
  getBusinessHandler,
  getMeHandler,
  updateAccountHandler,
  updateNotificationsHandler,
  updateProfileHandler,
  upsertBusinessHandler,
} from "@controllers/me/index";
import { sensitiveRateLimit } from "@plugins/rate-limit";
import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { guards } from "./guards";
import {
  businessResponseSchema,
  errorResponseSchema,
  limitedResponses,
  meResponseSchema,
  usernameAvailabilityResponseSchema,
  userResponseSchema,
} from "./schema-fragments";

const patchOptions = (app: FastifyInstance, summary: string) => ({
  ...guards(app),
  schema: {
    tags: ["account"],
    summary,
    security: [{ bearerAuth: [] }],
    response: {
      ...limitedResponses,
      200: userResponseSchema,
      400: errorResponseSchema,
      401: errorResponseSchema,
      409: errorResponseSchema,
    },
  },
});

export const meRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/me",
    {
      ...guards(app),
      schema: {
        tags: ["account"],
        summary: "The authenticated user with their business",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: meResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    getMeHandler,
  );

  // Sensitive because it is a lookup over the public handle namespace and the
  // dashboard calls it from a typeahead. `guards` keeps it authenticated, which
  // is also what gives the per-user limiter a key to work with.
  app.get(
    "/me/username-available",
    {
      onRequest: guards(app).onRequest,
      preHandler: [...guards(app).preHandler, sensitiveRateLimit(app)],
      schema: {
        tags: ["account"],
        summary: "Whether a handle can be claimed",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          required: ["username"],
          properties: { username: { type: "string" } },
        },
        response: {
          ...limitedResponses,
          200: usernameAvailabilityResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    checkUsernameHandler,
  );

  app.patch(
    "/me/profile",
    patchOptions(app, "Update public profile"),
    updateProfileHandler,
  );

  app.patch(
    "/me/account",
    patchOptions(app, "Update account settings"),
    updateAccountHandler,
  );

  app.patch(
    "/me/notifications",
    patchOptions(app, "Update notification preferences"),
    updateNotificationsHandler,
  );

  app.get(
    "/me/business",
    {
      ...guards(app),
      schema: {
        tags: ["account"],
        summary: "The business owned by the authenticated user",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: businessResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    getBusinessHandler,
  );

  app.put(
    "/me/business",
    {
      ...guards(app),
      schema: {
        tags: ["account"],
        summary: "Create or update the business",
        security: [{ bearerAuth: [] }],
        response: {
          ...limitedResponses,
          200: businessResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    upsertBusinessHandler,
  );

  done();
};
