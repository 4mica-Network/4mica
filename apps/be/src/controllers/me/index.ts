import { usernameUnavailableReason } from "@4mica/url";
import { invalidBody, parseBody, requireUserId } from "@controllers/shared";
import { appLogger } from "@logger/index";
import {
  isUniqueViolation,
  uniqueViolationTarget,
} from "@services/prisma-errors";
import type { RouteHandler } from "fastify";
import type { GenericSchema } from "valibot";
import {
  findUsernameOwner,
  getBusiness,
  getProfile,
  updateUser,
  upsertBusiness,
} from "./repository";
import {
  CheckUsernameSchema,
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
        const target = uniqueViolationTarget(error);
        const message = `That ${target} is already taken.`;
        return reply.code(409).send({
          error: "conflict",
          message,
          // Carry the same `issues[]` envelope a 400 uses, so a client can
          // render "already taken" under the offending field instead of as a
          // page-level banner. `target` is a column name, which is what the
          // client keys its issue map by.
          issues: target ? [{ path: target, message }] : [],
        });
      }
      appLogger.error("Profile update failed", { error, path });
      throw error;
    }
  };

/**
 * Advisory only — the unique index is what actually enforces this, and the 409
 * above is the backstop for the race between checking and writing.
 */
export const checkUsernameHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CheckUsernameSchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { username } = parsed.data;

  // Short-circuit before Prisma: policy alone settles these, and no row will
  // ever hold one. "reserved" means the marketing site owns the path;
  // "blacklisted" means the name is barred outright (roles, brands).
  const blocked = usernameUnavailableReason(username);
  if (blocked) {
    return reply.send({ username, available: false, reason: blocked });
  }

  const owner = await findUsernameOwner(username);

  // Your own current handle reads as available, so re-submitting an unchanged
  // username in the wizard or in Settings does not self-conflict.
  const available = owner === null || owner.id === userId;

  return reply.send({
    username,
    available,
    reason: available ? null : "taken",
  });
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
