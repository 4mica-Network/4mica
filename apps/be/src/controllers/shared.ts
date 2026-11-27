import { prisma } from "@4mica/db";
import { can, type Permission } from "@auth/permissions";
import { resolveTenant, type Tenant } from "@auth/tenant";
import { type AuditEntry, writeAudit } from "@controllers/audit/repository";
import type { SellerWalletResult } from "@controllers/wallets/repository";
import { appLogger } from "@logger/index";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as v from "valibot";

/**
 * The only source of the acting user's id is the verified session token, via
 * getUserData. No route accepts an id from the path, query or body, so a
 * caller cannot address anyone else's record.
 */
export const requireUserId = (
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

  if (request.user.disabled) {
    reply.code(403).send({
      error: "account_disabled",
      message: "This account cannot be modified.",
    });
    return null;
  }

  return request.user.id;
};

/**
 * Resolves the organization the request acts in and checks the caller's role
 * against `permission`. The organization comes from the `X-Org-Id` header but
 * is only honoured when the session's user is a member, so the header selects
 * among the caller's own tenants and never reaches anyone else's. An unknown
 * or foreign organization answers 404, exactly like a foreign resource.
 */
export const requireTenant = async (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: Permission,
): Promise<Tenant | null> => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return null;
  }

  const tenant = await resolveTenant(request, userId);
  if (!tenant) {
    notFound(reply, "organization");
    return null;
  }

  if (!can(tenant.role, permission)) {
    void Promise.resolve()
      .then(() =>
        writeAudit(prisma, {
          orgId: tenant.orgId,
          actorUserId: userId,
          action: "authz.denied",
          metadata: {
            permission,
            method: request.method,
            route: request.routeOptions.url ?? null,
          },
          ip: request.ip,
        }),
      )
      .catch((error: unknown) => {
        appLogger.warn("Could not record denied request", { error });
      });

    reply.code(403).send({
      error: "forbidden",
      message: "Your role in this organization does not allow that.",
      permission,
    });
    return null;
  }

  return tenant;
};

export const audit = async (
  request: FastifyRequest,
  tenant: Tenant,
  entry: Omit<AuditEntry, "orgId" | "actorUserId" | "ip">,
): Promise<void> => {
  try {
    await writeAudit(prisma, {
      ...entry,
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      ip: request.ip,
    });
  } catch (error) {
    appLogger.error("Could not record audit entry", {
      action: entry.action,
      orgId: tenant.orgId,
      error,
    });
  }
};

export const notFound = (reply: FastifyReply, what: string) =>
  reply.code(404).send({
    error: "not_found",
    message: `That ${what} does not exist.`,
  });

export const coreUnavailable = (reply: FastifyReply) =>
  reply.code(503).send({
    error: "core_unavailable",
    message: "4mica core is unreachable. Retry shortly.",
  });

export interface ValidationIssue {
  path: string;
  message: string;
}

export const invalidBody = (reply: FastifyReply, issues: ValidationIssue[]) =>
  reply.code(400).send({
    error: "invalid_request",
    message: "The request body failed validation.",
    issues,
  });

export const sellerWalletError = (
  reply: FastifyReply,
  result: Extract<SellerWalletResult, { ok: false }>,
) =>
  reply.code(400).send({
    error: result.error,
    message: result.message,
    issues: result.issues,
  });

export const parseBody = <TSchema extends v.GenericSchema>(
  schema: TSchema,
  body: unknown,
):
  | { success: true; data: v.InferOutput<TSchema> }
  | { success: false; issues: ValidationIssue[] } => {
  const result = v.safeParse(schema, body ?? {});

  if (result.success) {
    return { success: true, data: result.output };
  }

  return {
    success: false,
    issues: result.issues.map((issue) => ({
      path: v.getDotPath(issue) ?? "(root)",
      message: issue.message,
    })),
  };
};
