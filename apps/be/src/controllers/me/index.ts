import { usernameUnavailableReason } from "@4mica/url";
import { resolveTenant } from "@auth/tenant";
import { invalidateUser } from "@auth/user-store";
import {
  invalidBody,
  parseBody,
  requireTenant,
  requireUserId,
  withAudit,
} from "@controllers/shared";
import { deliverVerification } from "@controllers/verification/index";
import { appLogger } from "@logger/index";
import {
  isUniqueViolation,
  uniqueViolationTargets,
} from "@utils/prisma-errors";
import type { RouteHandler } from "fastify";
import type { GenericSchema } from "valibot";
import {
  getBusiness,
  getProfile,
  getUsername,
  isUsernameTaken,
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

const conflictPath = (error: unknown): string => {
  const targets = uniqueViolationTargets(error).map((target) =>
    /handle/.test(target) ? "username" : target,
  );
  return [...new Set(targets)].join(", ");
};

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
      const previous =
        "username" in parsed.data ? await getUsername(userId) : null;
      const updated = await updateUser(userId, parsed.data, previous);
      if (previous && previous !== updated.username) {
        request.staleUsernames = [previous];
      }
      if (request.user) {
        invalidateUser(request.user.clerkUserId);
      }

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
        const target = conflictPath(error);
        const message = `That ${target || "field"} is already taken.`;
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

  const available = !(await isUsernameTaken(username, userId));

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

  const tenant = await resolveTenant(request, userId);
  const [user, business] = await Promise.all([
    getProfile(userId),
    tenant ? getBusiness(tenant.orgId) : null,
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
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }
  return reply.send(await getBusiness(tenant.orgId));
};

export const upsertBusinessHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "business.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpsertBusinessSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const business = await withAudit(
    request,
    tenant,
    (tx) => upsertBusiness(tenant.orgId, parsed.data, tx),
    (row) => ({
      action: "business.updated",
      targetType: "business",
      targetId: row.id,
      metadata: { fields: Object.keys(parsed.data) },
    }),
  );

  return reply.send(business);
};
