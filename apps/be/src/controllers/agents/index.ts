import type { PaymentNetwork } from "@4mica/db";
import { MAX_OFFSET } from "@controllers/schema-primitives";
import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import {
  isUniqueViolation,
  uniqueViolationTargets,
} from "@services/prisma-errors";
import {
  resolvePayerWallet,
  resolveSellerWallet,
  sellerWalletError,
} from "@services/seller-wallet";
import { nextFreeSlug, slugify } from "@services/slug";
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

const uniqueConflict = (reply: FastifyReply, error: unknown) => {
  const targets = uniqueViolationTargets(error);
  return targets.some((target) => target.includes("wallet_address"))
    ? payerAddressTaken(reply)
    : slugTaken(reply);
};

export const listAgentsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
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

  return reply.send(await listAgents(userId, parsed.data));
};

export const getAgentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const agent = await getAgent(userId, id);

  return agent ? reply.send(agent) : notFound(reply, "agent");
};

export const createAgentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateAgentSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const data = parsed.data;
  const network = data.network as PaymentNetwork;

  let payerWalletId: string | null = null;
  let walletAddress: string | null = null;
  if (data.payerWalletId) {
    const resolved = await resolvePayerWallet(
      userId,
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
    const resolved = await resolveSellerWallet(userId, data.walletId, network);
    if (!resolved.ok) {
      return sellerWalletError(reply, resolved);
    }
    walletId = resolved.wallet.id;
    payToAddress = resolved.wallet.address;
  }

  const taken = await takenSlugs(userId);
  if (data.slug && taken.has(data.slug)) {
    return slugTaken(reply);
  }
  const slug = data.slug ?? nextFreeSlug(slugify(data.name), taken);

  try {
    const agent = await createAgent(userId, {
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
      assetAddress: data.assetAddress ?? null,
      priceAmount: data.priceAmount ?? null,
      priceCurrency: data.priceCurrency ?? null,
      priceLabel: data.priceLabel ?? null,
      endpointUrl: data.endpointUrl ?? null,
      x402Endpoint: data.x402Endpoint ?? null,
    });

    appLogger.info("Agent created", {
      userId,
      agentId: agent.id,
      slug: agent.slug,
    });

    return reply.code(201).send(agent);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return uniqueConflict(reply, error);
    }
    appLogger.error("Agent create failed", { error, userId });
    throw error;
  }
};

export const updateAgentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateAgentSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getAgent(userId, id);
  if (!current) {
    return notFound(reply, "agent");
  }

  const next = parsed.data;
  const { walletId, payerWalletId, network, ...rest } = next;
  const data: Record<string, unknown> = { ...rest };

  const effectiveNetwork = (network ?? current.network) as PaymentNetwork;
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
        userId,
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
        userId,
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

  if (next.slug && next.slug !== current.slug) {
    const taken = await takenSlugs(userId);
    if (taken.has(next.slug)) {
      return slugTaken(reply);
    }
  }

  try {
    const updated = await updateAgent(userId, id, data);
    return updated ? reply.send(updated) : notFound(reply, "agent");
  } catch (error) {
    if (isUniqueViolation(error)) {
      return uniqueConflict(reply, error);
    }
    throw error;
  }
};

export const publishAgentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const current = await getAgent(userId, id);
  if (!current) {
    return notFound(reply, "agent");
  }

  if (!current.payToAddress) {
    return reply.code(409).send({
      error: "agent_not_payable",
      message:
        "Choose a receiving wallet before publishing — without one the integration guide cannot generate code.",
      issues: [{ path: "walletId", message: "is required before publishing" }],
    });
  }

  const updated = await updateAgent(userId, id, {
    visibility: "PUBLIC",
    publishedAt: current.publishedAt ?? new Date(),
  });

  appLogger.info("Agent published", {
    userId,
    agentId: id,
    slug: current.slug,
  });
  return updated ? reply.send(updated) : notFound(reply, "agent");
};

export const unpublishAgentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const updated = await updateAgent(userId, id, { visibility: "PRIVATE" });

  if (!updated) {
    return notFound(reply, "agent");
  }

  appLogger.info("Agent unpublished", { userId, agentId: id });
  return reply.send(updated);
};

export const deleteAgentHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await softDeleteAgent(userId, id);

  if (deleted) {
    appLogger.info("Agent removed", { userId, agentId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "agent");
};

export const batchDeleteAgentsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteAgentsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchSoftDeleteAgents(userId, parsed.data.ids);
  appLogger.info("Agents removed", { userId, count: result.deleted.length });

  return reply.send(result);
};
