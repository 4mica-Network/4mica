import {
  invalidBody,
  notFound,
  parseBody,
  requireUserId,
} from "@controllers/shared";
import { appLogger } from "@logger/index";
import { isUniqueViolation } from "@services/prisma-errors";
import {
  buildWalletLinkMessage,
  WALLET_NONCE_MAX_ATTEMPTS,
} from "@services/siwe";
import type { FastifyReply, RouteHandler } from "fastify";
import { verifyMessage } from "viem";
import { config } from "@/config/index";
import {
  batchDeleteWallets,
  consumeNonceAndCreateWallet,
  createWalletNonce,
  deleteWallet,
  findWalletNonce,
  getWallet,
  listWallets,
  recordNonceAttempt,
  updateWallet,
} from "./repository";
import {
  BatchDeleteWalletsSchema,
  CreateWalletNonceSchema,
  CreateWalletSchema,
  ListWalletsQuerySchema,
  MAX_OFFSET,
  UpdateWalletSchema,
} from "./schema";

const siweOrigin = () => {
  const appUrl = config.appUrl;
  let domain = appUrl;
  try {
    domain = new URL(appUrl).host;
  } catch {}
  return { domain, uri: appUrl };
};

const invalidChallenge = (reply: FastifyReply) =>
  reply.code(400).send({
    error: "invalid_challenge",
    message:
      "That signing request is no longer valid. Start again to get a new one.",
    issues: [{ path: "nonce", message: "is expired or already used" }],
  });

export const listWalletsHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(ListWalletsQuerySchema, request.query);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  if ((parsed.data.page - 1) * parsed.data.limit > MAX_OFFSET) {
    return invalidBody(reply, [
      { path: "page", message: "is beyond the last page" },
    ]);
  }

  return reply.send(await listWallets(userId, parsed.data));
};

export const getWalletHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const wallet = await getWallet(userId, id);

  return wallet ? reply.send(wallet) : notFound(reply, "wallet");
};

export const createWalletNonceHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateWalletNonceSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const challenge = await createWalletNonce(userId, parsed.data, siweOrigin());

  return reply.code(201).send({
    nonce: challenge.nonce,
    message: challenge.message,
    expiresAt: challenge.expiresAt,
  });
};

export const createWalletHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(CreateWalletSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const data = parsed.data;
  const challenge = await findWalletNonce(userId, data.nonce);

  if (
    !challenge ||
    challenge.consumedAt !== null ||
    challenge.expiresAt.getTime() <= Date.now() ||
    challenge.address !== data.address ||
    challenge.network !== data.network
  ) {
    return invalidChallenge(reply);
  }

  if (challenge.attempts >= WALLET_NONCE_MAX_ATTEMPTS) {
    return invalidChallenge(reply);
  }

  const message = buildWalletLinkMessage({
    domain: challenge.domain,
    uri: challenge.uri,
    address: challenge.address,
    chainId: challenge.chainId,
    nonce: challenge.nonce,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    userId,
  });

  let verified = false;
  try {
    verified = await verifyMessage({
      address: challenge.address as `0x${string}`,
      message,
      signature: data.signature as `0x${string}`,
    });
  } catch {
    verified = false;
  }

  if (!verified) {
    await recordNonceAttempt(challenge.id);
    return reply.code(400).send({
      error: "invalid_signature",
      message:
        "That signature does not match the address. Smart contract wallets (Safe, ERC-4337) are not supported yet.",
      issues: [{ path: "signature", message: "does not match the address" }],
    });
  }

  try {
    const wallet = await consumeNonceAndCreateWallet(
      userId,
      challenge.id,
      data,
      challenge.chainId,
    );

    if (!wallet) {
      return invalidChallenge(reply);
    }

    appLogger.info("Wallet linked", {
      userId,
      walletId: wallet.id,
      address: wallet.address,
      network: wallet.network,
      method: wallet.verificationMethod,
    });

    return reply.code(201).send(wallet);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const message = "You have already linked that address on this network.";
      return reply.code(409).send({
        error: "wallet_already_linked",
        message,
        issues: [{ path: "address", message }],
      });
    }
    appLogger.error("Wallet create failed", { error, userId });
    throw error;
  }
};

type WalletStatusValue = "ACTIVE" | "PAUSED" | "RETIRED";

const ALLOWED_TRANSITIONS: Record<
  WalletStatusValue,
  readonly WalletStatusValue[]
> = {
  ACTIVE: ["ACTIVE", "PAUSED", "RETIRED"],
  PAUSED: ["ACTIVE", "PAUSED", "RETIRED"],
  RETIRED: ["RETIRED"],
};

export const updateWalletHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(UpdateWalletSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const { id } = request.params as { id: string };
  const current = await getWallet(userId, id);
  if (!current) {
    return notFound(reply, "wallet");
  }

  const next = parsed.data;

  if (next.status && !ALLOWED_TRANSITIONS[current.status].includes(next.status))
    return reply.code(409).send({
      error: "invalid_transition",
      message: `A ${current.status.toLowerCase()} wallet cannot become ${next.status.toLowerCase()}. Link the address again to reactivate it.`,
      issues: [{ path: "status", message: "is not a permitted transition" }],
    });

  const effectiveStatus = next.status ?? current.status;
  if (next.isDefault === true && effectiveStatus !== "ACTIVE") {
    return reply.code(409).send({
      error: "invalid_transition",
      message: "Only an active wallet can be the default.",
      issues: [{ path: "isDefault", message: "requires an active wallet" }],
    });
  }

  const updated = await updateWallet(userId, id, next);
  return updated ? reply.send(updated) : notFound(reply, "wallet");
};

export const deleteWalletHandler: RouteHandler = async (request, reply) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const { id } = request.params as { id: string };
  const deleted = await deleteWallet(userId, id);

  if (deleted) {
    appLogger.info("Wallet removed", { userId, walletId: id });
    return reply.code(204).send();
  }

  return notFound(reply, "wallet");
};

export const batchDeleteWalletsHandler: RouteHandler = async (
  request,
  reply,
) => {
  const userId = requireUserId(request, reply);
  if (!userId) {
    return reply;
  }

  const parsed = parseBody(BatchDeleteWalletsSchema, request.body);
  if (!parsed.success) {
    return invalidBody(reply, parsed.issues);
  }

  const result = await batchDeleteWallets(userId, parsed.data.ids);
  appLogger.info("Wallets removed", {
    userId,
    count: result.deleted.length,
  });

  return reply.send(result);
};
