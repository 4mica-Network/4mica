import { environmentForNetwork } from "@4mica/rules";
import { requireApiKeyScope } from "@auth/api-key";
import { effectiveProjectRole } from "@auth/permissions";
import { accessibleProjectIds, requestedEnvironment } from "@auth/project";
import { notifyFinance } from "@controllers/finance-alerts/notify";
import { projectVisibleTo } from "@controllers/payments/repository";
import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { amountText } from "@utils/amount";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  authorizeSpend,
  consumeAuthorization,
  refreshAuthorization,
  releaseAuthorization,
  type TransitionOutcome,
} from "./decide";
import {
  type AuthorizationRow,
  authorizationOwner,
  findAgentInScope,
  findPayerWallet,
  listAuthorizations,
} from "./repository";
import {
  AuthorizeSpendSchema,
  ConsumeAuthorizationSchema,
  ListAuthorizationsQuerySchema,
} from "./schema";

export const toAuthorization = (row: AuthorizationRow) => ({
  id: row.id,
  status: row.status,
  deniedReason: row.deniedReason,
  policyId: row.policyId,
  approvalRequestId: row.approvalRequestId,
  expiresAt: row.expiresAt.toISOString(),
  amount: amountText(row.amount),
  network: row.network,
  assetAddress: row.assetAddress,
});

const toAuthorizationDetail = (row: AuthorizationRow) => ({
  ...toAuthorization(row),
  projectId: row.projectId,
  environment: row.environment,
  apiKeyId: row.apiKeyId,
  agentId: row.agentId,
  payerAddress: row.payerAddress,
  recipientAddress: row.recipientAddress,
  reqId: row.reqId,
  paymentId: row.paymentId,
  consumedAt: row.consumedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const idOf = (params: unknown): string => (params as { id: string }).id;

const replyTransition = (reply: FastifyReply, outcome: TransitionOutcome) => {
  switch (outcome.kind) {
    case "ok":
      return reply.send(toAuthorization(outcome.row));
    case "not_found":
      return notFound(reply, "spend authorization");
    case "req_id_mismatch":
      return invalidBody(reply, [
        { path: "reqId", message: "does not match this authorization" },
      ]);
    case "req_id_in_use":
      return reply.code(409).send({
        error: "req_id_in_use",
        message: "Another live authorization already uses this reqId.",
      });
    case "conflict":
      return reply.code(409).send({
        error: "invalid_transition",
        message: `This authorization is ${outcome.row.status} and cannot change that way.`,
        status: outcome.row.status,
      });
  }
};

export const authorizeSpendHandler: RouteHandler = async (request, reply) => {
  const key = requireApiKeyScope(request, reply, "SPEND_AUTHORIZE");
  if (!key) {
    return reply;
  }

  const parsed = parseBody(AuthorizeSpendSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }
  const data = parsed.data;

  if (environmentForNetwork(data.network) !== key.environment) {
    return reply.code(403).send({
      error: "environment_mismatch",
      message: `This key belongs to ${key.environment === "PRODUCTION" ? "production" : "sandbox"} and cannot authorize spend on ${data.network}.`,
      issues: [
        { path: "network", message: "is outside the key's environment" },
      ],
    });
  }

  if (data.payerAddress === data.recipientAddress) {
    return invalidBody(reply, [
      { path: "recipientAddress", message: "must differ from payerAddress" },
    ]);
  }

  if (key.agentId && data.agentId && data.agentId !== key.agentId) {
    return invalidBody(reply, [
      { path: "agentId", message: "does not match this key" },
    ]);
  }

  if (!(await findPayerWallet(key.orgId, data.payerAddress, data.network))) {
    return reply.code(403).send({
      error: "payer_not_owned",
      message:
        "The payer must be an active wallet of this organization on that network, with the payer role.",
      issues: [{ path: "payerAddress", message: "is not one of your payers" }],
    });
  }

  const agentId = key.agentId ?? data.agentId;
  const agent = agentId ? await findAgentInScope(key, agentId) : null;
  if (agentId && !agent) {
    return notFound(reply, "agent");
  }

  const outcome = await authorizeSpend({
    orgId: key.orgId,
    projectId: key.projectId,
    environment: key.environment,
    apiKeyId: key.id,
    agentId: agent?.id ?? null,
    agentName: agent?.name ?? null,
    network: data.network,
    assetAddress: data.assetAddress,
    amount: data.amount,
    payerAddress: data.payerAddress,
    recipientAddress: data.recipientAddress,
    reqId: data.reqId,
  });

  if (outcome.kind === "req_id_in_use") {
    return reply.code(409).send({
      error: "req_id_in_use",
      message: "Another live authorization already uses this reqId.",
    });
  }

  appLogger.info("Spend authorization decided", {
    orgId: key.orgId,
    authorizationId: outcome.row.id,
    status: outcome.row.status,
    deniedReason: outcome.row.deniedReason,
  });

  void notifyFinance(request.server.email, key.orgId, outcome.alerts);

  return reply.send(toAuthorization(outcome.row));
};

export const getAuthorizationHandler: RouteHandler = async (request, reply) => {
  const key = requireApiKeyScope(request, reply, "SPEND_AUTHORIZE");
  if (!key) {
    return reply;
  }

  const row = await refreshAuthorization(
    await authorizationOwner(key),
    idOf(request.params),
  );
  return row
    ? reply.send(toAuthorization(row))
    : notFound(reply, "spend authorization");
};

export const consumeAuthorizationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const key = requireApiKeyScope(request, reply, "SPEND_AUTHORIZE");
  if (!key) {
    return reply;
  }

  const parsed = parseBody(ConsumeAuthorizationSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  return replyTransition(
    reply,
    await consumeAuthorization(
      await authorizationOwner(key),
      idOf(request.params),
      parsed.data.reqId,
    ),
  );
};

export const releaseAuthorizationHandler: RouteHandler = async (
  request,
  reply,
) => {
  const key = requireApiKeyScope(request, reply, "SPEND_AUTHORIZE");
  if (!key) {
    return reply;
  }

  return replyTransition(
    reply,
    await releaseAuthorization(
      await authorizationOwner(key),
      idOf(request.params),
    ),
  );
};

export const listAuthorizationsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const environment = requestedEnvironment(request);
  if (!environment) {
    return notFound(reply, "environment");
  }

  const parsed = parseBody(ListAuthorizationsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { projectId } = parsed.data;
  if (projectId) {
    const project = await projectVisibleTo(
      tenant.orgId,
      tenant.userId,
      projectId,
    );
    const visible =
      project &&
      effectiveProjectRole({
        orgRole: tenant.role,
        customProjectRole: tenant.custom?.projectRole ?? null,
        projectRole: project.members[0]?.role ?? null,
        restricted: project.restricted,
      });
    if (!visible) {
      return notFound(reply, "project");
    }
  }

  const page = await listAuthorizations(tenant.orgId, {
    ...parsed.data,
    environment,
    projects: await accessibleProjectIds(tenant),
  });

  return reply.send({
    items: page.items.map(toAuthorizationDetail),
    nextCursor: page.nextCursor,
  });
};
