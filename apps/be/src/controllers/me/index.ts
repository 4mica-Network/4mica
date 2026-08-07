import type { RouteHandler } from "fastify";
import type { GenericSchema } from "valibot";
import { appLogger } from "../../logger/index";
import { invalidBody, parseBody, requireUserId } from "../shared";
import {
  getBusiness,
  getProfile,
  isUniqueViolation,
  uniqueViolationTarget,
  updateUser,
  upsertBusiness,
} from "./repository";
import {
  type UpdateAccountInput,
  UpdateAccountSchema,
  type UpdateNotificationsInput,
  UpdateNotificationsSchema,
  type UpdateProfileInput,
  UpdateProfileSchema,
  UpsertBusinessSchema,
} from "./schema";

type UpdatableUser =
  | UpdateProfileInput
  | UpdateAccountInput
  | UpdateNotificationsInput;

const patchUserHandler =
  (schema: GenericSchema<unknown, UpdatableUser>, path: string): RouteHandler =>
  async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }

    const parsed = parseBody(schema, request.body);
    if (!parsed.success) {
      return invalidBody(reply, parsed.issues);
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
  };

export const getMeHandler: RouteHandler = async (request, reply) => {
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
};

export const updateProfileHandler = patchUserHandler(
  UpdateProfileSchema,
  "/me/profile",
);

export const updateAccountHandler = patchUserHandler(
  UpdateAccountSchema,
  "/me/account",
);

export const updateNotificationsHandler = patchUserHandler(
  UpdateNotificationsSchema,
  "/me/notifications",
);

export const getBusinessHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }
  return reply.send(await getBusiness(userId));
};

export const upsertBusinessHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpsertBusinessSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  return reply.send(await upsertBusiness(userId, parsed.data));
};
