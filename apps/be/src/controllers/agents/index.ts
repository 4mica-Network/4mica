import type { PaymentNetwork } from "@4mica/db";
import { slugify } from "@4mica/rules";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  auditProject,
  invalidBody,
  notFound,
  parseBody,
  requireProject,
  sellerWalletError,
} from "@controllers/shared";
import {
  resolvePayerWallet,
  resolveSellerWallet,
} from "@controllers/wallets/repository";
import { appLogger } from "@logger/index";
import { resolvePriceAsset } from "@utils/price-asset";
import {
  isUniqueViolation,
  uniqueViolationTargets,
} from "@utils/prisma-errors";
import { networkAllowed, networkIssue } from "@utils/scope";
import { nextFreeSlug } from "@utils/slug";
import type { FastifyReply, RouteHandler } from "fastify";
import {
  batchSoftDeleteAgents,
  createAgent,
  getAgent,
  listAgents,
  softDeleteAgent,
  takenSlugs,
  updateAgent,
} from "./repository";
import {
  BatchDeleteAgentsSchema,
  CreateAgentSchema,
  ListAgentsQuerySchema,
  UpdateAgentSchema,
} from "./schema";

const slugTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "slug_taken",
    message: "You already have an agent at that address.",
    issues: [{ path: "slug", message: "is already in use on your profile" }],
  });

const payerAddressTaken = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "agent_wallet_in_use",
    message:
      "Another agent already signs with that wallet on this network. One payer address is one agent.",
    issues: [{ path: "payerWalletId", message: "is already used by an agent" }],
  });

const notPayable = (reply: FastifyReply) =>
  reply.code(409).send({
    error: "agent_not_payable",
    message:
      "Choose a receiving wallet before publishing — without one the integration guide cannot generate code.",
    issues: [{ path: "walletId", message: "is required before publishing" }],
  });

const suspended = (reply: FastifyReply, path: "status" | "visibility") =>
  reply.code(409).send({
    error: "agent_suspended",
    message:
      "This agent was suspended by moderation and cannot be reactivated or published from here.",
    issues: [{ path, message: "cannot change while suspended" }],
  });

const uniqueConflict = (reply: FastifyReply, error: unknown) => {
  const targets = uniqueViolationTargets(error);
  return targets.some((target) => target.includes("wallet_address"))
    ? payerAddressTaken(reply)
    : slugTaken(reply);
};

export const listAgentsHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(ListAgentsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  return reply.send(await listAgents(scope, parsed.data));
};

export const getAgentHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.read");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const agent = await getAgent(scope, id);

  return agent ? reply.send(agent) : notFound(reply, "agent");
};

export const createAgentHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(CreateAgentSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const data = parsed.data;
  const network = data.network as PaymentNetwork;
  if (!networkAllowed(scope, network)) {
    return invalidBody(reply, [networkIssue(scope)]);
  }

  let payerWalletId: string | null = null;
  let walletAddress: string | null = null;
  if (data.payerWalletId) {
    const resolved = await resolvePayerWallet(
      scope.orgId,
      data.payerWalletId,
      network,
    );
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
    payerWalletId = resolved.wallet.id;
    walletAddress = resolved.wallet.address;
  }

  let walletId: string | null = null;
  let payToAddress: string | null = null;
  if (data.walletId) {
    const resolved = await resolveSellerWallet(
      scope.orgId,
      data.walletId,
      network,
    );
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
    walletId = resolved.wallet.id;
    payToAddress = resolved.wallet.address;
  }

  const priced = resolvePriceAsset(network, data.assetAddress ?? null);
  if (!priced.ok) {
    return invalidBody(reply, [priced.issue]);
  }

  // Same bar as POST /publish: a public agent must be payable.
  if (data.visibility === "PUBLIC" && !payToAddress) {
    return notPayable(reply);
  }

  const taken = await takenSlugs(scope.orgId);
  if (data.slug && taken.has(data.slug)) {
    return slugTaken(reply);
  }
  const slug = data.slug ?? nextFreeSlug(slugify(data.name), taken);

  try {
    const agent = await createAgent(scope, scope.userId, {
      slug,
      name: data.name,
      headline: data.headline ?? null,
      description: data.description ?? null,
      avatarUrl: data.avatarUrl ?? null,
      docsUrl: data.docsUrl ?? null,
      status: data.status,
      visibility: data.visibility,
      network,
      publishedAt: data.visibility === "PUBLIC" ? new Date() : null,

      payerWalletId,
      walletAddress,
      creditLimit: data.creditLimit,

      walletId,
      payToAddress,
      assetAddress: priced.assetAddress,
      priceAmount: data.priceAmount ?? null,
      priceCurrency: priced.priceCurrency,
      priceLabel: data.priceLabel ?? null,
      endpointUrl: data.endpointUrl ?? null,
      x402Endpoint: data.x402Endpoint ?? null,
    });

    await auditProject(request, scope, {
      action: "agent.created",
      targetType: "agent",
      targetId: agent.id,
    });

    appLogger.info("Agent created", {
      userId: scope.userId,
      agentId: agent.id,
      slug: agent.slug,
    });

    return reply.code(201).send(agent);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return uniqueConflict(reply, error);
    }
    appLogger.error("Agent create failed", { error, userId: scope.userId });
    throw error;
  }
};

export const updateAgentHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(UpdateAgentSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getAgent(scope, id);
  if (!current) {
    return notFound(reply, "agent");
  }

  const next = parsed.data;

  if (current.status === "SUSPENDED" && next.status !== undefined) {
    return suspended(reply, "status");
  }
  if (current.status === "SUSPENDED" && next.visibility === "PUBLIC") {
    return suspended(reply, "visibility");
  }

  const { walletId, payerWalletId, network, ...rest } = next;
  const data: Record<string, unknown> = { ...rest };

  const effectiveNetwork = (network ?? current.network) as PaymentNetwork;
  if (network && !networkAllowed(scope, network)) {
    return invalidBody(reply, [networkIssue(scope)]);
  }
  if (network && network !== current.network) {
    const keepsPayer =
      payerWalletId === undefined
        ? current.payerWalletId !== null
        : payerWalletId !== null;
    const keepsSeller =
      walletId === undefined ? current.walletId !== null : walletId !== null;

    if (keepsPayer || keepsSeller) {
      return reply.code(409).send({
        error: "network_locked",
        message:
          "Unlink this agent's wallets before moving it to another network — a wallet proved on one chain cannot receive on another.",
        issues: [
          {
            path: "network",
            message: "cannot change while a wallet is linked",
          },
        ],
      });
    }
    data.network = network;
  }

  if (payerWalletId !== undefined) {
    if (payerWalletId === null) {
      data.payerWalletId = null;
      data.walletAddress = null;
    } else {
      const resolved = await resolvePayerWallet(
        scope.orgId,
        payerWalletId,
        effectiveNetwork,
      );
      if (!resolved.ok) {
        return sellerWalletError(reply, resolved);
      }
      data.payerWalletId = resolved.wallet.id;
      data.walletAddress = resolved.wallet.address;
    }
  }

  if (walletId !== undefined) {
    if (walletId === null) {
      data.walletId = null;
      data.payToAddress = null;
    } else {
      const resolved = await resolveSellerWallet(
        scope.orgId,
        walletId,
        effectiveNetwork,
      );
      if (!resolved.ok) {
        return sellerWalletError(reply, resolved);
      }
      data.walletId = resolved.wallet.id;
      data.payToAddress = resolved.wallet.address;
    }
  }

  if (network !== undefined || next.assetAddress !== undefined) {
    const priced = resolvePriceAsset(
      effectiveNetwork,
      next.assetAddress !== undefined
        ? next.assetAddress
        : current.assetAddress,
    );
    if (!priced.ok) {
      return invalidBody(reply, [priced.issue]);
    }
    data.assetAddress = priced.assetAddress;
    data.priceCurrency = priced.priceCurrency;
  }

  const payToAfter =
    "payToAddress" in data
      ? (data.payToAddress as string | null)
      : current.payToAddress;

  if (next.visibility === "PUBLIC") {
    if (!payToAfter) {
      return notPayable(reply);
    }
    if (walletId === undefined && current.walletId) {
      const resolved = await resolveSellerWallet(scope.orgId, current.walletId);
      if (!resolved.ok) {
        return sellerWalletError(reply, resolved);
      }
    }
    data.publishedAt = current.publishedAt ?? new Date();
  } else if (
    next.visibility === undefined &&
    current.visibility === "PUBLIC" &&
    !payToAfter
  ) {
    data.visibility = "PRIVATE";
  }

  if (next.slug && next.slug !== current.slug) {
    const taken = await takenSlugs(scope.orgId);
    if (taken.has(next.slug)) {
      return slugTaken(reply);
    }
  }

  try {
    const updated = await updateAgent(scope, id, data);
    return updated ? reply.send(updated) : notFound(reply, "agent");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return uniqueConflict(reply, error);
    }
    throw error;
  }
};

export const publishAgentHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const current = await getAgent(scope, id);
  if (!current) {
    return notFound(reply, "agent");
  }

  if (current.status === "SUSPENDED") {
    return suspended(reply, "visibility");
  }

  if (!current.payToAddress) {
    return notPayable(reply);
  }

  if (current.walletId) {
    const resolved = await resolveSellerWallet(scope.orgId, current.walletId);
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
  }

  const updated = await updateAgent(scope, id, {
    visibility: "PUBLIC",
    publishedAt: current.publishedAt ?? new Date(),
  });

  if (updated) {
    await auditProject(request, scope, {
      action: "agent.published",
      targetType: "agent",
      targetId: id,
    });
  }

  appLogger.info("Agent published", {
    userId: scope.userId,
    agentId: id,
    slug: current.slug,
  });
  return updated ? reply.send(updated) : notFound(reply, "agent");
};

export const unpublishAgentHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const updated = await updateAgent(scope, id, {
    visibility: "PRIVATE",
  });

  if (!updated) {
    return notFound(reply, "agent");
  }

  await auditProject(request, scope, {
    action: "agent.unpublished",
    targetType: "agent",
    targetId: id,
  });
  appLogger.info("Agent unpublished", { userId: scope.userId, agentId: id });
  return reply.send(updated);
};

export const deleteAgentHandler: RouteHandler = async (request, reply) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await softDeleteAgent(scope, id);

  if (deleted) {
    await auditProject(request, scope, {
      action: "agent.deleted",
      targetType: "agent",
      targetId: id,
    });
    appLogger.info("Agent removed", { userId: scope.userId, agentId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "agent");
};

export const batchDeleteAgentsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const scope = await requireProject(request, reply, "resources.write");
  if (!scope) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteAgentsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchSoftDeleteAgents(scope, parsed.data.ids);
  if (result.deleted.length > 0) {
    await auditProject(request, scope, {
      action: "agent.deleted",
      targetType: "agent",
      metadata: { ids: result.deleted },
    });
  }
  appLogger.info("Agents removed", {
    userId: scope.userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};
