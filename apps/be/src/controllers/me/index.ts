import { usernameUnavailableReason } from "@4mica/url";
import { invalidateUser } from "@auth/user-store";
import { invalidBody, parseBody, requireUserId } from "@controllers/shared";
import { deliverVerification } from "@controllers/verification/index";
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
      const updated = await updateUser(userId, parsed.data);
      if (request.user) {
        invalidateUser(request.user.clerkUserId);
      }

      // A new address only takes effect once confirmed, so send the link now
      // rather than leave the user to find the resend button. A failed send
      // does not fail the save — the dashboard can resend.
      const requested = (parsed.data as { email?: unknown }).email;
      if (
        request.server.email &&
        typeof requested === "string" &&
        updated.pendingEmail === requested
      ) {
        await deliverVerification(
          request.server.email,
          userId,
          updated.pendingEmail,
          updated.name,
        ).catch((error) => {
          appLogger.warn("Could not send the email-change link", {
            error,
            userId,
          });
        });
      }

      return reply.send(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const target = uniqueViolationTarget(error);
        const message = `That ${target} is already taken.`;
        return reply.code(409).send({
          error: "conflict",
          message,
          issues: target ? [{ path: target, message }] : [],
        });
      }
      appLogger.error("Profile update failed", { error, path });
      throw error;
    }
  };

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

  const blocked = usernameUnavailableReason(username);
  if (blocked) {
    return reply.send({ username, available: false, reason: blocked });
  }

  const owner = await findUsernameOwner(username);
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
