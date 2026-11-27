import { prisma } from "@4mica/db";
import { environmentForNetwork } from "@4mica/rules";
import { requireApiKeyScope } from "@auth/api-key";
import { writeAudit } from "@controllers/audit/repository";
import {
  audit,
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  cancelApproval,
  createSellerApproval,
  customerInProject,
  type DecideFailure,
  decideApproval,
  findApproval,
  findSellerApproval,
  getGovernance,
  listApprovals,
  nonMembers,
  saveGovernance,
  toApproval,
} from "./repository";
import {
  CreateSellerApprovalSchema,
  DecideApprovalSchema,
  ListApprovalsQuerySchema,
  UpdateGovernanceSchema,
} from "./schema";

const changeFailed = (reply: FastifyReply, reason: DecideFailure) => {
  switch (reason) {
    case "not_found":
      return notFound(reply, "approval request");
    case "closed":
      return reply.code(409).send({
        error: "approval_closed",
        message: "This approval request has already been decided or expired.",
      });
    case "self_approval":
      return reply.code(403).send({
        error: "self_approval",
        message: "You cannot decide on a request you made yourself.",
      });
    case "forbidden_role":
      return reply.code(403).send({
        error: "forbidden",
        message: "Only an owner or admin can approve granting a role.",
        permission: "members.manage",
      });
    case "already_decided":
      return reply.code(409).send({
        error: "already_decided",
        message: "You have already voted on this request.",
      });
    case "not_requester":
      return reply.code(403).send({
        error: "not_requester",
        message: "Only the person who made this request can cancel it.",
      });
  }
};

export const listApprovalsHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(ListApprovalsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { items, nextCursor } = await listApprovals(tenant.orgId, parsed.data);
  return reply.send({
    items: items.map((row) => toApproval(row, tenant)),
    nextCursor,
  });
};

export const getApprovalHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const row = await findApproval(tenant.orgId, id);
  return row
    ? reply.send(toApproval(row, tenant))
    : notFound(reply, "approval request");
};

export const decideApprovalHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "approvals.decide");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(DecideApprovalSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const { vote, comment } = parsed.data;
  const result = await decideApproval(tenant.orgId, id, tenant, vote, comment);
  if (!result.ok) {
    return changeFailed(reply, result.reason);
  }

  await audit(request, tenant, {
    action: vote === "APPROVE" ? "approval.approved" : "approval.rejected",
    targetType: "approval_request",
    targetId: id,
    projectId: result.row.projectId,
    metadata: {
      kind: result.row.kind,
      action: result.row.action,
      status: result.status,
      ...(comment ? { comment } : {}),
    },
  });
  appLogger.info("Approval decided", {
    orgId: tenant.orgId,
    approvalId: id,
    vote,
    status: result.status,
  });

  return reply.send(toApproval(result.row, tenant));
};

export const cancelApprovalHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const result = await cancelApproval(tenant.orgId, id, tenant.userId);
  if (!result.ok) {
    return changeFailed(reply, result.reason);
  }

  await audit(request, tenant, {
    action: "approval.cancelled",
    targetType: "approval_request",
    targetId: id,
    projectId: result.row.projectId,
    metadata: { kind: result.row.kind, action: result.row.action },
  });

  return reply.send(toApproval(result.row, tenant));
};

const sellerSummary = (input: {
  amount: string;
  network: string;
  payerAddress: string;
  reason: string | null;
}) =>
  `Payment of ${input.amount} on ${input.network} from ${input.payerAddress}${input.reason ? `: ${input.reason}` : ""}`.slice(
    0,
    280,
  );

export const createSellerApprovalHandler: RouteHandler = async (
  request,
  reply,
) => {
  const key = requireApiKeyScope(request, reply, "APPROVALS_WRITE");
  if (!key) {
    return reply;
  }

  const parsed = parseBody(CreateSellerApprovalSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const input = parsed.data;
  if (environmentForNetwork(input.network) !== key.environment) {
    return reply.code(403).send({
      error: "environment_mismatch",
      message: `This key belongs to the ${key.environment.toLowerCase()} environment, which does not include ${input.network}.`,
    });
  }

  if (
    input.customerId &&
    !(await customerInProject(key.orgId, key.projectId, input.customerId))
  ) {
    return notFound(reply, "customer");
  }

  const created = await createSellerApproval(key, input, sellerSummary(input));

  try {
    await writeAudit(prisma, {
      orgId: key.orgId,
      projectId: key.projectId,
      actorApiKeyId: key.id,
      action: "approval.requested",
      targetType: "approval_request",
      targetId: created.id,
      metadata: {
        kind: "SELLER_PAYMENT",
        network: input.network,
        amount: input.amount,
      },
      ip: request.ip,
    });
  } catch (error) {
    appLogger.error("Could not record audit entry", {
      action: "approval.requested",
      orgId: key.orgId,
      error,
    });
  }

  return reply.code(201).send(created);
};

export const getSellerApprovalHandler: RouteHandler = async (
  request,
  reply,
) => {
  const key = requireApiKeyScope(request, reply, "APPROVALS_WRITE");
  if (!key) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const row = await findSellerApproval(key.orgId, key.projectId, id);
  return row ? reply.send(row) : notFound(reply, "approval request");
};

export const getGovernanceHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "finance.read");
  if (!tenant) {
    return reply;
  }

  return reply.send(await getGovernance(tenant.orgId));
};

export const updateGovernanceHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "governance.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateGovernanceSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const strangers = await nonMembers(
    tenant.orgId,
    parsed.data.financeRecipientIds ?? [],
  );
  if (strangers.length > 0) {
    return invalidBody(
      reply,
      strangers.map((id) => ({
        path: "financeRecipientIds",
        message: `${id} is not a member of this organization`,
      })),
    );
  }

  const saved = await saveGovernance(tenant.orgId, parsed.data);
  await audit(request, tenant, {
    action: "governance.updated",
    targetType: "organization",
    targetId: tenant.orgId,
    metadata: saved,
  });

  return reply.send(saved);
};
