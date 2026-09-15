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

/**
 * The SIWE `domain` and `uri` are the dashboard origin the user is actually
 * looking at, and come from server config — never from the request body, or a
 * caller could have the wallet popup display any site it liked.
 */
const siweOrigin = () => {
  const appUrl = config.appUrl;
  let domain = appUrl;
  try {
    domain = new URL(appUrl).host;
  } catch {
    // config.appUrl is validated at boot; this is belt and braces.
  }
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

  // Offset pagination makes Postgres generate and discard every skipped row, so
  // an unbounded `page` is a cheap way to tie up a connection.
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

/**
 * Issues a challenge for ANY syntactically valid address, unconditionally.
 *
 * No existence check and no 409 here: addresses are public on-chain and Clerk
 * signup is unlimited, so a "that address is taken" answer would turn this into
 * an enumeration oracle mapping on-chain addresses to 4Mica accounts. Only
 * POST /me/wallets may conflict, and only once a signature has proved the
 * caller holds the key.
 *
 * This is the opposite of checkUsernameHandler, which is an intentional oracle
 * over a deliberately public handle namespace. Addresses are not that.
 */
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

  // Expiry is read from the column, never parsed back out of the message.
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

  // Rebuilt from the stored components rather than read back from a stored
  // string, so no future change can let a caller choose the text it signed.
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
    // Verified outside any transaction, and `recoverMessageAddress` throws on a
    // malformed signature rather than returning false.
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

/**
 * A wallet may be paused and resumed, and may be retired once. Coming back from
 * RETIRED is not an edit: `verifiedAt` only ever proved control at that instant,
 * so re-activating an address needs a fresh signature.
 */
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

  // A paused or retired wallet must not be the one payments route to.
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
