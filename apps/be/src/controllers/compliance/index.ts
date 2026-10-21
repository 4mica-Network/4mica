import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
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
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }
  return reply.send(await getComplianceState(userId));
};

export const updateComplianceHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateComplianceSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await isComplianceLocked(userId)) {
    return locked(reply);
  }

  return reply.send(await updateComplianceProfile(userId, parsed.data));
};

export const listBeneficialOwnersHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }
  return reply.send(await listBeneficialOwners(userId));
};

export const createBeneficialOwnerHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateBeneficialOwnerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await isComplianceLocked(userId)) {
    return locked(reply);
  }

  if ((await countBeneficialOwners(userId)) >= MAX_BENEFICIAL_OWNERS) {
    return reply.code(409).send({
      error: "limit_reached",
      message: `A business can list at most ${MAX_BENEFICIAL_OWNERS} people.`,
    });
  }

  const held = await ownershipHeldByOthers(userId);
  if (held + (parsed.data.ownershipPercent ?? 0) > 100) {
    return ownershipExceeded(reply, 100 - held);
  }

  const owner = await createBeneficialOwner(userId, parsed.data);
  appLogger.info("Beneficial owner added", { userId, ownerId: owner.id });

  return reply.code(201).send(owner);
};

export const updateBeneficialOwnerHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateBeneficialOwnerSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if (await isComplianceLocked(userId)) {
    return locked(reply);
  }

  const { id } = request.params as { id: string };

  if (typeof parsed.data.ownershipPercent === "number") {
    const held = await ownershipHeldByOthers(userId, id);
    if (held + parsed.data.ownershipPercent > 100) {
      return ownershipExceeded(reply, 100 - held);
    }
  }

  const updated = await updateBeneficialOwner(userId, id, parsed.data);

  return updated ? reply.send(updated) : notFound(reply, "person");
};

export const deleteBeneficialOwnerHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  if (await isComplianceLocked(userId)) {
    return locked(reply);
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteBeneficialOwner(userId, id);

  return deleted ? reply.code(204).send() : notFound(reply, "person");
};

export const submitComplianceHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const state = await getComplianceState(userId);

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

  const submitted = await submitForReview(userId);
  appLogger.info("Compliance submitted for review", { userId });

  return reply.send(submitted);
};
