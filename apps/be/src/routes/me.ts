import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import {
  getBusinessHandler,
  getMeHandler,
  updateAccountHandler,
  updateNotificationsHandler,
  updateProfileHandler,
  upsertBusinessHandler,
} from "../controllers/me/index";
import { guards } from "./guards";
import {
  businessResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  userResponseSchema,
} from "./schema-fragments";

/** The three PATCH routes differ only by path, summary and handler. */
const patchOptions = (app: FastifyInstance, summary: string) => ({
  ...guards(app),
  schema: {
    tags: ["account"],
    summary,
    security: [{ bearerAuth: [] }],
    response: {
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
        response: { 200: meResponseSchema, 401: errorResponseSchema },
      },
    },
    getMeHandler,
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
        response: { 200: businessResponseSchema, 401: errorResponseSchema },
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
