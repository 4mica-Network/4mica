import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { GenericSchema } from "valibot";
import { appLogger } from "../logger/index";
import {
  parseBody,
  type UpdateAccountInput,
  UpdateAccountSchema,
  type UpdateNotificationsInput,
  UpdateNotificationsSchema,
  type UpdateProfileInput,
  UpdateProfileSchema,
  UpsertBusinessSchema,
} from "../schemas/profile";
import {
  getBusiness,
  getProfile,
  isUniqueViolation,
  uniqueViolationTarget,
  updateUser,
  upsertBusiness,
} from "../services/profile";
import {
  businessResponseSchema,
  errorResponseSchema,
  meResponseSchema,
  userResponseSchema,
} from "./schema-fragments";

const requireUserId = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  if (!request.user) {
    reply.code(401).send({
      error: "unauthorized",
      message: "No user context is attached to this request.",
    });
    return null;
  }
  return request.user.id;
};

type UpdatableUser =
  | UpdateProfileInput
  | UpdateAccountInput
  | UpdateNotificationsInput;

const patchRoute = (
  app: FastifyInstance,
  path: string,
  summary: string,
  schema: GenericSchema<unknown, UpdatableUser>,
) => {
  app.patch(
    path,
    {
      onRequest: [app.authenticate],
      preHandler: [app.getUserData],
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
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const parsed = parseBody(schema, request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: parsed.issues,
        });
      }

      try {
        return reply.send(await updateUser(userId, parsed.data));
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            error: "conflict",
            message: `That ${uniqueViolationTarget(error)} is already taken.`,
          });
        }
        appLogger.error("Profile update failed", { error, path });
        throw error;
      }
    },
  );
};

export const meRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get(
    "/me",
    {
      onRequest: [app.authenticate],
      preHandler: [app.getUserData],
      schema: {
        tags: ["account"],
        summary: "The authenticated user with their business",
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const [user, business] = await Promise.all([
        getProfile(userId),
        getBusiness(userId),
      ]);

      if (!user) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "The authenticated user no longer exists.",
        });
      }

      return reply.send({ user, business });
    },
  );

  patchRoute(app, "/me/profile", "Update public profile", UpdateProfileSchema);
  patchRoute(
    app,
    "/me/account",
    "Update account settings",
    UpdateAccountSchema,
  );
  patchRoute(
    app,
    "/me/notifications",
    "Update notification preferences",
    UpdateNotificationsSchema,
  );

  app.get(
    "/me/business",
    {
      onRequest: [app.authenticate],
      preHandler: [app.getUserData],
      schema: {
        tags: ["account"],
        summary: "The business owned by the authenticated user",
        security: [{ bearerAuth: [] }],
        response: { 200: businessResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }
      return reply.send(await getBusiness(userId));
    },
  );

  app.put(
    "/me/business",
    {
      onRequest: [app.authenticate],
      preHandler: [app.getUserData],
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
    async (request, reply) => {
      const userId = requireUserId(request, reply);
      if (!userId) {
        return reply;
      }

      const parsed = parseBody(UpsertBusinessSchema, request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_request",
          message: "The request body failed validation.",
          issues: parsed.issues,
        });
      }

      return reply.send(await upsertBusiness(userId, parsed.data));
    },
  );

  done();
};
