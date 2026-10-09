import { type PaymentNetwork, type Prisma, prisma } from "@4mica/db";
import type { ValidationIssue } from "@controllers/shared";
import { generateWalletNonce } from "@utils/secrets";
import {
  buildWalletLinkMessage,
  chainIdFor,
  WALLET_NONCE_TTL_MS,
} from "@utils/siwe";
import type {
  CreateWalletInput,
  CreateWalletNonceInput,
  ListWalletsQuery,
  UpdateWalletInput,
} from "./schema";

export const WALLET_SELECT = {
  id: true,
  label: true,
  description: true,
  address: true,
  network: true,
  role: true,
  status: true,
  isDefault: true,
  verifiedAt: true,
  verificationMethod: true,
  verifiedChainId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type WalletRow = Prisma.WalletGetPayload<{
  select: typeof WALLET_SELECT;
}>;

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const orderFor = (
  sort: ListWalletsQuery["sort"],
): Prisma.WalletOrderByWithRelationInput[] => {
  switch (sort) {
    case "createdAt":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "label":
      return [{ label: "asc" }, { id: "asc" }];
    case "-label":
      return [{ label: "desc" }, { id: "desc" }];
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
};

const whereFor = (
  ownerId: string,
  query: ListWalletsQuery,
): Prisma.WalletWhereInput => {
  const where: Prisma.WalletWhereInput = { ownerId };

  if (query.status) {
    where.status = query.status;
  }
  if (query.network) {
    where.network = query.network;
  }
  if (query.role) {
    where.role = query.role;
  }

  if (query.q) {
    const needle = escapeLike(query.q);
    where.OR = [
      { label: { contains: needle, mode: "insensitive" } },
      { description: { contains: needle, mode: "insensitive" } },
      { address: { contains: needle, mode: "insensitive" } },
    ];
  }

  return where;
};

export const listWallets = async (
  ownerId: string,
  query: ListWalletsQuery,
): Promise<{
  items: WalletRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const where = whereFor(ownerId, query);
  const skip = (query.page - 1) * query.limit;

  const [items, total] = await prisma.$transaction([
    prisma.wallet.findMany({
      where,
      orderBy: orderFor(query.sort),
      skip,
      take: query.limit,
      select: WALLET_SELECT,
    }),
    prisma.wallet.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
};

export const getWallet = (ownerId: string, id: string) =>
  prisma.wallet.findFirst({
    where: { id, ownerId },
    select: WALLET_SELECT,
  });

export const createWalletNonce = async (
  userId: string,
  data: CreateWalletNonceInput,
  origin: { domain: string; uri: string },
) => {
  const nonce = generateWalletNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + WALLET_NONCE_TTL_MS);
  const chainId = chainIdFor(data.network);

  const message = buildWalletLinkMessage({
    domain: origin.domain,
    uri: origin.uri,
    address: data.address,
    chainId,
    nonce,
    issuedAt,
    expiresAt,
    userId,
  });

  await prisma.$transaction([
    prisma.walletNonce.deleteMany({
      where: {
        userId,
        address: data.address,
        network: data.network,
        consumedAt: null,
      },
    }),
    prisma.walletNonce.create({
      data: {
        userId,
        address: data.address,
        network: data.network,
        nonce,
        chainId,
        domain: origin.domain,
        uri: origin.uri,
        issuedAt,
        expiresAt,
      },
    }),
  ]);

  return { nonce, message, expiresAt };
};

export const findWalletNonce = (userId: string, nonce: string) =>
  prisma.walletNonce.findFirst({
    where: { nonce, userId },
  });

export const recordNonceAttempt = (id: string) =>
  prisma.walletNonce.update({
    where: { id },
    data: { attempts: { increment: 1 } },
  });

export const consumeNonceAndCreateWallet = async (
  ownerId: string,
  nonceId: string,
  data: CreateWalletInput,
  chainId: number,
): Promise<WalletRow | null> =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.walletNonce.updateMany({
      where: { id: nonceId, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });

    if (count === 0) {
      return null;
    }

    return tx.wallet.create({
      data: {
        ownerId,
        label: data.label,
        description: data.description ?? null,
        address: data.address,
        network: data.network,
        role: data.role,
        verifiedAt: new Date(),
        verificationMethod: "EOA_SIGNATURE",
        verifiedChainId: chainId,
      },
      select: WALLET_SELECT,
    });
  });

export const updateWallet = async (
  ownerId: string,
  id: string,
  data: UpdateWalletInput,
): Promise<WalletRow | null> => {
  const { isDefault, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const current = await tx.wallet.findFirst({
      where: { id, ownerId },
      select: { id: true, network: true, role: true, status: true },
    });

    if (!current) {
      return null;
    }

    if (isDefault === true) {
      await tx.wallet.updateMany({
        where: { ownerId, network: current.network, isDefault: true },
        data: { isDefault: false },
      });
    }

    await tx.wallet.update({
      where: { id: current.id },
      data: { ...rest, ...(isDefault === undefined ? {} : { isDefault }) },
    });

    const canReceive =
      (rest.status ?? current.status) === "ACTIVE" &&
      (rest.role ?? current.role) !== "PAYER";

    if (!canReceive) {
      const receiving = {
        ownerId,
        walletId: current.id,
        visibility: "PUBLIC" as const,
      };
      await tx.apiListing.updateMany({
        where: receiving,
        data: { visibility: "PRIVATE" },
      });
      await tx.agent.updateMany({
        where: receiving,
        data: { visibility: "PRIVATE" },
      });
    }

    return tx.wallet.findUnique({
      where: { id: current.id },
      select: WALLET_SELECT,
    });
  });
};

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const removeWallets = async (
  tx: Tx,
  ownerId: string,
  ids: string[],
): Promise<number> => {
  const receiving = { ownerId, walletId: { in: ids } };

  await tx.apiListing.updateMany({
    where: receiving,
    data: { payToAddress: null, visibility: "PRIVATE" },
  });
  await tx.agent.updateMany({
    where: receiving,
    data: { payToAddress: null, visibility: "PRIVATE" },
  });
  await tx.agent.updateMany({
    where: { ownerId, payerWalletId: { in: ids } },
    data: { walletAddress: null },
  });

  const { count } = await tx.wallet.deleteMany({
    where: { id: { in: ids }, ownerId },
  });
  return count;
};

export const deleteWallet = async (ownerId: string, id: string) => {
  const owned = await prisma.wallet.findFirst({
    where: { id, ownerId },
    select: { id: true },
  });
  if (!owned) {
    return false;
  }

  const count = await prisma.$transaction((tx) =>
    removeWallets(tx, ownerId, [owned.id]),
  );
  return count > 0;
};

export const batchDeleteWallets = async (
  ownerId: string,
  ids: string[],
): Promise<{ deleted: string[]; notFound: string[] }> => {
  const owned = await prisma.wallet.findMany({
    where: { id: { in: ids }, ownerId },
    select: { id: true },
  });

  const deleted = owned.map((wallet) => wallet.id);

  if (deleted.length > 0) {
    await prisma.$transaction((tx) => removeWallets(tx, ownerId, deleted));
  }

  const deletedSet = new Set(deleted);
  return {
    deleted,
    notFound: ids.filter((id) => !deletedSet.has(id)),
  };
};

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
