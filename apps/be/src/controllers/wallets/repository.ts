import { type Prisma, prisma } from "@4mica/db";
import { generateWalletNonce } from "@services/secrets";
import {
  buildWalletLinkMessage,
  chainIdFor,
  WALLET_NONCE_TTL_MS,
} from "@services/siwe";
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

/**
 * Prisma's `contains` passes the needle straight into LIKE without escaping, so
 * a bare `%` would match every row and force the worst-case scan. Escape the
 * wildcards (and the escape character itself) before they get there.
 */
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
      // `createdAt` alone has ambiguous ties, which makes a row able to appear
      // on two pages or none. uuid(7) ids are time-ordered, so id breaks the
      // tie in the same direction.
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
};

const whereFor = (
  ownerId: string,
  query: ListWalletsQuery,
): Prisma.WalletWhereInput => {
  // ownerId first, always: it is the indexed predicate that bounds the
  // unanchored ILIKE below to one account's rows.
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

  // One transaction so `total` and `items` come from the same snapshot —
  // otherwise a concurrent create shows the client `total: 10` while it pages
  // through 11 rows.
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

/**
 * Issues a fresh challenge, replacing any the caller left outstanding for the
 * same address and network.
 *
 * Mirrors `createEmailVerification`'s delete-then-create so at most one live
 * signable message exists per (user, address, network) at a time.
 */
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
    // Scoped by userId so one account can never spend another's challenge.
    where: { nonce, userId },
  });

export const recordNonceAttempt = (id: string) =>
  prisma.walletNonce.update({
    where: { id },
    data: { attempts: { increment: 1 } },
  });

/**
 * Consumes the challenge and creates the wallet atomically.
 *
 * The consume is a compare-and-swap rather than a read-then-write: two requests
 * replaying the same nonce concurrently would both pass a prior `consumedAt ===
 * null` check, and only the `updateMany` predicate makes the second one lose.
 * Returns null when the nonce was already spent or has expired.
 *
 * Signature verification happens before this is called — never hold a
 * transaction open across that work.
 */
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
      select: { id: true, network: true },
    });

    if (!current) {
      return null;
    }

    // A partial unique index guarantees one default per (owner, network), and
    // Postgres checks it per statement rather than at commit — so the old
    // default has to be cleared before the new one is set, not alongside it.
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

    return tx.wallet.findUnique({
      where: { id: current.id },
      select: WALLET_SELECT,
    });
  });
};

export const deleteWallet = async (ownerId: string, id: string) => {
  const { count } = await prisma.wallet.deleteMany({ where: { id, ownerId } });
  return count > 0;
};

/**
 * Deletes the caller's wallets among `ids` and reports which were not theirs.
 *
 * A wallet that belongs to someone else is reported as `notFound`, exactly as a
 * nonexistent one is — the same information the single-delete 404 already
 * gives, and no more.
 */
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
    await prisma.wallet.deleteMany({ where: { id: { in: deleted }, ownerId } });
  }

  const deletedSet = new Set(deleted);
  return {
    deleted,
    notFound: ids.filter((id) => !deletedSet.has(id)),
  };
};
