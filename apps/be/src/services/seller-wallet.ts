import { type PaymentNetwork, prisma } from "@4mica/db";
import type { ValidationIssue } from "@controllers/shared";
import type { FastifyReply } from "fastify";

export type SellerWalletError =
  | "wallet_not_found"
  | "wallet_not_active"
  | "wallet_not_recipient"
  | "network_mismatch";

export interface SellerWallet {
  id: string;
  address: string;
  network: PaymentNetwork;
}

export type SellerWalletResult =
  | { ok: true; wallet: SellerWallet }
  | {
      ok: false;
      error: SellerWalletError;
      message: string;
      issues: ValidationIssue[];
    };

const fail = (
  error: SellerWalletError,
  message: string,
  issue: string,
  field = "walletId",
): SellerWalletResult => ({
  ok: false,
  error,
  message,
  issues: [{ path: field, message: issue }],
});

export const resolveSellerWallet = async (
  ownerId: string,
  walletId: string,
  requiredNetwork?: PaymentNetwork,
  field = "walletId",
): Promise<SellerWalletResult> => {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, ownerId },
    select: {
      id: true,
      address: true,
      network: true,
      role: true,
      status: true,
    },
  });

  if (!wallet) {
    return fail(
      "wallet_not_found",
      "That wallet is not one of yours.",
      "is not one of your wallets",
      field,
    );
  }

  if (wallet.status !== "ACTIVE") {
    return fail(
      "wallet_not_active",
      "A paused or retired wallet cannot receive payments. Reactivate it first.",
      "must be an active wallet",
      field,
    );
  }

  if (wallet.role !== "RECIPIENT" && wallet.role !== "BOTH") {
    return fail(
      "wallet_not_recipient",
      "That wallet is set up to pay, not to receive. Change its role to recipient or both.",
      "must be able to receive payments",
      field,
    );
  }

  if (requiredNetwork && wallet.network !== requiredNetwork) {
    return fail(
      "network_mismatch",
      `This agent signs on ${requiredNetwork}, but that wallet is on ${wallet.network}. Payments would be signed on a chain the wallet cannot receive on.`,
      "is on a different network",
      field,
    );
  }

  return {
    ok: true,
    wallet: { id: wallet.id, address: wallet.address, network: wallet.network },
  };
};

export const resolvePayerWallet = async (
  ownerId: string,
  walletId: string,
  requiredNetwork?: PaymentNetwork,
  field = "payerWalletId",
): Promise<SellerWalletResult> => {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, ownerId },
    select: {
      id: true,
      address: true,
      network: true,
      role: true,
      status: true,
    },
  });

  if (!wallet) {
    return fail(
      "wallet_not_found",
      "That wallet is not one of yours.",
      "is not one of your wallets",
      field,
    );
  }

  if (wallet.status !== "ACTIVE") {
    return fail(
      "wallet_not_active",
      "A paused or retired wallet cannot sign payments. Reactivate it first.",
      "must be an active wallet",
      field,
    );
  }

  if (wallet.role !== "PAYER" && wallet.role !== "BOTH") {
    return fail(
      "wallet_not_recipient",
      "That wallet is set up to receive, not to pay. Change its role to payer or both.",
      "must be able to send payments",
      field,
    );
  }

  if (requiredNetwork && wallet.network !== requiredNetwork) {
    return fail(
      "network_mismatch",
      `This agent signs on ${requiredNetwork}, but that wallet is on ${wallet.network}.`,
      "is on a different network",
      field,
    );
  }

  return {
    ok: true,
    wallet: { id: wallet.id, address: wallet.address, network: wallet.network },
  };
};

export const sellerWalletError = (
  reply: FastifyReply,
  result: Extract<SellerWalletResult, { ok: false }>,
) =>
  reply.code(400).send({
    error: result.error,
    message: result.message,
    issues: result.issues,
  });
