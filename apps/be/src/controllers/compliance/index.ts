import {
  invalidBody,
  notFound,
  parseBody,
  requireTenant,
  withAudit,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  countBeneficialOwners,
  createBeneficialOwner,
  deleteBeneficialOwner,
  getComplianceState,
  isComplianceLocked,
  listBeneficialOwners,
  ownershipHeldByOthers,
  submitForReview,
  updateBeneficialOwner,
  updateComplianceProfile,
} from "./repository";
import {
  CreateBeneficialOwnerSchema,
  MAX_BENEFICIAL_OWNERS,
  UpdateBeneficialOwnerSchema,
  UpdateComplianceSchema,
} from "./schema";

const locked = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "compliance_locked",
    message:
      "Compliance details cannot change while a review is pending or after verification. Contact support to amend them.",
  });

const ownershipExceeded = (reply: FastifyReply, available: number) =>
  invalidBody(reply, [
    {
      path: "ownershipPercent",
      message: `only ${available}% of the business is left to assign`,
    },
  ]);

export const getComplianceHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }
  return reply.send(await getComplianceState(tenant.orgId));
};

export const updateComplianceHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "business.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateComplianceSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await isComplianceLocked(tenant.orgId)) {
    return locked(reply);
  }

  await withAudit(
    request,
    tenant,
    (tx) => updateComplianceProfile(tenant.orgId, parsed.data, tx),
    {
      action: "compliance.updated",
      targetType: "compliance",
      targetId: tenant.orgId,
      metadata: { fields: Object.keys(parsed.data) },
    },
  );

  return reply.send(await getComplianceState(tenant.orgId));
};

export const listBeneficialOwnersHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "resources.read");
  if (!tenant) {
    return reply;
  }
  return reply.send(await listBeneficialOwners(tenant.orgId));
};

export const createBeneficialOwnerHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "business.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(CreateBeneficialOwnerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await isComplianceLocked(tenant.orgId)) {
    return locked(reply);
  }

  if ((await countBeneficialOwners(tenant.orgId)) >= MAX_BENEFICIAL_OWNERS) {
    return reply.code(409).send({
      error: "limit_reached",
      message: `A business can list at most ${MAX_BENEFICIAL_OWNERS} people.`,
    });
  }

  const held = await ownershipHeldByOthers(tenant.orgId);
  if (held + (parsed.data.ownershipPercent ?? 0) > 100) {
    return ownershipExceeded(reply, 100 - held);
  }

  const owner = await withAudit(
    request,
    tenant,
    (tx) => createBeneficialOwner(tenant.orgId, parsed.data, tx),
    (created) => ({
      action: "beneficial_owner.added",
      targetType: "beneficial_owner",
      targetId: created.id,
    }),
  );
  appLogger.info("Beneficial owner added", {
    userId: tenant.userId,
    beneficialOwnerId: owner.id,
  });

  return reply.code(201).send(owner);
};

export const updateBeneficialOwnerHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "business.manage");
  if (!tenant) {
    return reply;
  }

  const parsed = parseBody(UpdateBeneficialOwnerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await isComplianceLocked(tenant.orgId)) {
    return locked(reply);
  }

  const { id } = request.params as { id: string };

  if (typeof parsed.data.ownershipPercent === "number") {
    const held = await ownershipHeldByOthers(tenant.orgId, id);
    if (held + parsed.data.ownershipPercent > 100) {
      return ownershipExceeded(reply, 100 - held);
    }
  }

  const updated = await withAudit(
    request,
    tenant,
    (tx) => updateBeneficialOwner(tenant.orgId, id, parsed.data, tx),
    (owner) =>
      owner
        ? {
            action: "beneficial_owner.updated",
            targetType: "beneficial_owner",
            targetId: id,
            metadata: { fields: Object.keys(parsed.data) },
          }
        : null,
  );
  if (!updated) {
    return notFound(reply, "person");
  }

  return reply.send(updated);
};

export const deleteBeneficialOwnerHandler: RouteHandler = async (
  request,
  reply,
) => {
  const tenant = await requireTenant(request, reply, "business.manage");
  if (!tenant) {
    return reply;
  }

  if (await isComplianceLocked(tenant.orgId)) {
    return locked(reply);
  }

  const { id } = request.params as { id: string };
  const deleted = await withAudit(
    request,
    tenant,
    (tx) => deleteBeneficialOwner(tenant.orgId, id, tx),
    (found) =>
      found
        ? {
            action: "beneficial_owner.removed",
            targetType: "beneficial_owner",
            targetId: id,
          }
        : null,
  );
  if (!deleted) {
    return notFound(reply, "person");
  }

  return reply.code(204).send();
};

export const submitComplianceHandler: RouteHandler = async (request, reply) => {
  const tenant = await requireTenant(request, reply, "business.manage");
  if (!tenant) {
    return reply;
  }

  const state = await getComplianceState(tenant.orgId);

  if (state.kybStatus === "PENDING" || state.kybStatus === "VERIFIED") {
    return reply.code(409).send({
      error: "already_submitted",
      message:
        state.kybStatus === "PENDING"
          ? "Your details are already under review."
          : "Your business is already verified.",
    });
  }

  if (state.missing.length > 0) {
    return reply.code(400).send({
      error: "incomplete",
      message: "Some required compliance details are missing.",
      issues: state.missing.map((path) => ({
        path,
        message: "is required before review",
      })),
    });
  }

  await withAudit(request, tenant, (tx) => submitForReview(tenant.orgId, tx), {
    action: "compliance.submitted",
    targetType: "compliance",
    targetId: tenant.orgId,
  });
  appLogger.info("Compliance submitted for review", {
    userId: tenant.userId,
  });

  return reply.send(await getComplianceState(tenant.orgId));
};
