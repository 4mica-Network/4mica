import { requireProductionKeyApproval } from "@controllers/approvals/key-gate";
import { UpdateApiKeySchema } from "@controllers/developer/schema";
import {
  invalidBody,
  notFound,
  parseBody,
  requireProject,
  withProjectAudit,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  createServiceAccount,
  createServiceAccountKey,
  deleteServiceAccount,
  getServiceAccount,
  listServiceAccountKeys,
  listServiceAccounts,
  revokeServiceAccountKey,
  rotateServiceAccountKey,
  updateServiceAccount,
  updateServiceAccountKey,
} from "./repository";
import {
  CreateServiceAccountKeySchema,
  CreateServiceAccountSchema,
  RotateServiceAccountKeySchema,
  UpdateServiceAccountSchema,
} from "./schema";

const suspended = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "service_account_suspended",
    message: "Reactivate this service account before giving it new keys.",
  });

const params = (request: Parameters<RouteHandler>[0]) =>
  request.params as { id: string; keyId?: string };

export const listServiceAccountsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }
  return reply.send({ items: await listServiceAccounts(scope) });
};

export const createServiceAccountHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "service_accounts.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateServiceAccountSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const account = await withProjectAudit(
    request,
    scope,
    (tx) => createServiceAccount(scope, scope.userId, parsed.data, tx),
    (created) => ({
      action: "service_account.created",
      targetType: "service_account",
      targetId: created.id,
    }),
  );
  appLogger.info("Service account created", {
    userId: scope.userId,
    serviceAccountId: account.id,
  });

  return reply.code(201).send(account);
};

export const updateServiceAccountHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "service_accounts.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateServiceAccountSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = params(request);
  const updated = await withProjectAudit(
    request,
    scope,
    (tx) => updateServiceAccount(scope, id, parsed.data, tx),
    (row) =>
      row && {
        action: "service_account.updated",
        targetType: "service_account",
        targetId: id,
      },
  );
  if (!updated) {
    return notFound(reply, "service account");
  }

  return reply.send(updated);
};

const setSuspended =
  (suspend: boolean): RouteHandler =>
  async (request, reply) => {
    const scope = await requireProject(
      request,
      reply,
      "service_accounts.manage",
    );
    if (!scope) {
      return reply;
    }

    const { id } = params(request);
    const current = await getServiceAccount(scope, id);
    if (!current) {
      return notFound(reply, "service account");
    }
    if ((current.suspendedAt !== null) === suspend) {
      return reply.send(current);
    }

    const updated = await withProjectAudit(
      request,
      scope,
      (tx) =>
        updateServiceAccount(
          scope,
          id,
          { suspendedAt: suspend ? new Date() : null },
          tx,
        ),
      (row) =>
        row && {
          action: suspend
            ? "service_account.suspended"
            : "service_account.reactivated",
          targetType: "service_account",
          targetId: id,
        },
    );
    if (!updated) {
      return notFound(reply, "service account");
    }

    appLogger.info(
      suspend ? "Service account suspended" : "Service account reactivated",
      { userId: scope.userId, serviceAccountId: id },
    );
    return reply.send(updated);
  };

export const suspendServiceAccountHandler = setSuspended(true);
export const reactivateServiceAccountHandler = setSuspended(false);

export const deleteServiceAccountHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "service_accounts.manage");
  if (!scope) {
    return reply;
  }

  const { id } = params(request);
  const deleted = await withProjectAudit(
    request,
    scope,
    (tx) => deleteServiceAccount(scope, id, tx),
    (found) =>
      found
        ? {
            action: "service_account.deleted",
            targetType: "service_account",
            targetId: id,
          }
        : null,
  );
  if (!deleted) {
    return notFound(reply, "service account");
  }

  appLogger.info("Service account removed", {
    userId: scope.userId,
    serviceAccountId: id,
  });
  return reply.code(204).send();
};

export const listServiceAccountKeysHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = params(request);
  if (!(await getServiceAccount(scope, id))) {
    return notFound(reply, "service account");
  }

  return reply.send({ items: await listServiceAccountKeys(scope, id) });
};

export const createServiceAccountKeyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateServiceAccountKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = params(request);
  const account = await getServiceAccount(scope, id);
  if (!account) {
    return notFound(reply, "service account");
  }
  if (account.suspendedAt) {
    return suspended(reply);
  }

  const gate = await requireProductionKeyApproval(
    request,
    reply,
    scope,
    { kind: "service_account", serviceAccountId: id, ...parsed.data },
    `Create key "${parsed.data.name}" for service account ${account.name}`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const key = await withProjectAudit(
    request,
    scope,
    (tx) =>
      createServiceAccountKey(
        scope,
        scope.userId,
        id,
        {
          name: parsed.data.name,
          scopes: parsed.data.scopes,
          expiresAt: parsed.data.expiresAt
            ? new Date(parsed.data.expiresAt)
            : null,
          ipAllowlist: parsed.data.ipAllowlist ?? [],
        },
        tx,
      ),
    (created) => ({
      action: "api_key.created",
      targetType: "api_key",
      targetId: created.id,
      metadata: {
        serviceAccountId: id,
        scopes: created.scopes,
        ...(gate.approvalId ? { approvalId: gate.approvalId } : {}),
      },
    }),
  );
  appLogger.info("API key created", {
    userId: scope.userId,
    apiKeyId: key.id,
    serviceAccountId: id,
  });

  return reply.code(201).send(key);
};

export const updateServiceAccountKeyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateApiKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id, keyId = "" } = params(request);
  if (!(await getServiceAccount(scope, id))) {
    return notFound(reply, "service account");
  }

  const updated = await withProjectAudit(
    request,
    scope,
    (tx) => updateServiceAccountKey(scope, id, keyId, parsed.data, tx),
    (row) =>
      row && {
        action: "api_key.updated",
        targetType: "api_key",
        targetId: keyId,
        metadata: { serviceAccountId: id, ...parsed.data },
      },
  );
  if (!updated) {
    return notFound(reply, "key");
  }

  return reply.send(updated);
};

export const revokeServiceAccountKeyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const { id, keyId = "" } = params(request);
  if (!(await getServiceAccount(scope, id))) {
    return notFound(reply, "service account");
  }

  const revoked = await withProjectAudit(
    request,
    scope,
    (tx) => revokeServiceAccountKey(scope, id, keyId, tx),
    (row) =>
      row && {
        action: "api_key.revoked",
        targetType: "api_key",
        targetId: keyId,
        metadata: { serviceAccountId: id },
      },
  );
  if (!revoked) {
    return notFound(reply, "active key");
  }

  appLogger.info("API key revoked", {
    userId: scope.userId,
    apiKeyId: keyId,
    serviceAccountId: id,
  });
  return reply.send(revoked);
};

export const rotateServiceAccountKeyHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "keys.manage");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(RotateServiceAccountKeySchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id, keyId = "" } = params(request);
  const account = await getServiceAccount(scope, id);
  if (!account) {
    return notFound(reply, "service account");
  }
  if (account.suspendedAt) {
    return suspended(reply);
  }

  const gate = await requireProductionKeyApproval(
    request,
    reply,
    scope,
    {
      kind: "rotation",
      serviceAccountId: id,
      keyId,
      expireOldInHours: parsed.data.expireOldInHours,
    },
    `Rotate a key of service account ${account.name}`,
  );
  if (!gate.proceed) {
    return reply;
  }

  const key = await withProjectAudit(
    request,
    scope,
    (tx) =>
      rotateServiceAccountKey(
        scope,
        scope.userId,
        id,
        keyId,
        parsed.data.expireOldInHours,
        tx,
      ),
    (created) =>
      created && {
        action: "api_key.rotated",
        targetType: "api_key",
        targetId: keyId,
        metadata: {
          serviceAccountId: id,
          replacedBy: created.id,
          expireOldInHours: parsed.data.expireOldInHours,
          ...(gate.approvalId ? { approvalId: gate.approvalId } : {}),
        },
      },
  );
  if (!key) {
    return notFound(reply, "active key");
  }

  appLogger.info("API key rotated", {
    userId: scope.userId,
    apiKeyId: keyId,
    replacedBy: key.id,
    serviceAccountId: id,
  });
  return reply.code(201).send(key);
};
