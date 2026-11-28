import { type Prisma, prisma } from "@4mica/db";
import {
  can,
  isWrite,
  type Permission,
  type ProjectPermission,
} from "@auth/permissions";
import { type ProjectScope, resolveProject } from "@auth/project";
import { enforceAccessPolicy } from "@auth/security";
import { resolveTenant, type Tenant } from "@auth/tenant";
import type { MandatoryAuditAction } from "@controllers/audit/classification";
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

const recordDenied = (
  request: FastifyRequest,
  orgId: string,
  userId: string,
  permission: string,
  projectId?: string,
) => {
  void Promise.resolve()
    .then(() =>
      writeAudit(prisma, {
        orgId,
        actorUserId: userId,
        action: "authz.denied",
        ...(projectId ? { targetType: "project", targetId: projectId } : {}),
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
};

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

  if (!(await enforceAccessPolicy(request, reply, tenant))) {
    return null;
  }

  if (!can(tenant, permission)) {
    recordDenied(request, tenant.orgId, userId, permission);

    reply.code(403).send({
      error: "forbidden",
      message: "Your role in this organization does not allow that.",
      permission,
    });
    return null;
  }

  return tenant;
};

export const requireProject = async (
  request: FastifyRequest,
  reply: FastifyReply,
  permission: ProjectPermission,
): Promise<ProjectScope | null> => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return null;
  }

  const tenant = await resolveTenant(request, userId);
  if (!tenant) {
    notFound(reply, "organization");
    return null;
  }

  if (!(await enforceAccessPolicy(request, reply, tenant))) {
    return null;
  }

  const scope = await resolveProject(request, tenant);
  if (!scope) {
    notFound(reply, "project");
    return null;
  }

  if (scope.permissions.includes(permission)) {
    return scope;
  }

  recordDenied(request, scope.orgId, userId, permission, scope.projectId);

  if (scope.archived && isWrite(permission)) {
    reply.code(409).send({
      error: "project_archived",
      message: "This project is archived. Unarchive it to make changes.",
    });
    return null;
  }

  if (
    scope.environment === "PRODUCTION" &&
    scope.restrictProduction &&
    isWrite(permission)
  ) {
    reply.code(403).send({
      error: "production_restricted",
      message: "Only project admins can change production in this project.",
      permission,
    });
    return null;
  }

  reply.code(403).send({
    error: "forbidden",
    message: "Your role in this project does not allow that.",
    permission,
  });
  return null;
};

type AuditInput = Omit<AuditEntry, "orgId" | "actorUserId" | "ip">;

interface AuditActor {
  orgId: string;
  userId: string | null;
}

export type MandatoryAuditInput = AuditInput & {
  action: MandatoryAuditAction;
};

type AuditFor<T> =
  | MandatoryAuditInput
  | ((result: T) => MandatoryAuditInput | null);

const projectEntry = <E extends AuditInput>(
  scope: ProjectScope,
  entry: E,
): E => ({
  ...entry,
  projectId: scope.projectId,
  metadata: {
    projectId: scope.projectId,
    environment: scope.environment,
    ...(entry.metadata &&
    typeof entry.metadata === "object" &&
    !Array.isArray(entry.metadata)
      ? (entry.metadata as Record<string, unknown>)
      : entry.metadata === undefined
        ? {}
        : { value: entry.metadata }),
  } as AuditEntry["metadata"],
});

export const withAudit = <T>(
  request: FastifyRequest,
  actor: AuditActor,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  entry: AuditFor<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> =>
  prisma.$transaction(async (tx) => {
    const result = await mutation(tx);
    const resolved = typeof entry === "function" ? entry(result) : entry;
    if (resolved) {
      await writeAudit(tx, {
        ...resolved,
        orgId: actor.orgId,
        actorUserId: actor.userId,
        ip: request.ip,
      });
    }
    return result;
  }, options);

export const recordAudit = (
  request: FastifyRequest,
  actor: AuditActor,
  entry: MandatoryAuditInput,
): Promise<void> => withAudit(request, actor, async () => undefined, entry);

export const withProjectAudit = <T>(
  request: FastifyRequest,
  scope: ProjectScope,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  entry: AuditFor<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> =>
  withAudit(
    request,
    scope,
    mutation,
    (result) => {
      const resolved = typeof entry === "function" ? entry(result) : entry;
      return resolved ? projectEntry(scope, resolved) : null;
    },
    options,
  );

export const auditProject = (
  request: FastifyRequest,
  scope: ProjectScope,
  entry: AuditInput,
) => audit(request, scope, projectEntry(scope, entry));

export const audit = async (
  request: FastifyRequest,
  actor: AuditActor,
  entry: AuditInput,
): Promise<void> => {
  try {
    await writeAudit(prisma, {
      ...entry,
      orgId: actor.orgId,
      actorUserId: actor.userId,
      ip: request.ip,
    });
  } catch (error) {
    appLogger.error("Could not record audit entry", {
      action: entry.action,
      orgId: actor.orgId,
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
