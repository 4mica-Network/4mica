import { Prisma, prisma } from "@4mica/db";
import type { ListPaymentsQuery, ReportPaymentInput } from "./schema";

export const PAYMENT_SELECT = {
  id: true,
  listingId: true,
  agentId: true,
  payerAddress: true,
  recipientAddress: true,
  network: true,
  assetAddress: true,
  amount: true,
  status: true,
  failureReason: true,
  reqId: true,
  txHash: true,
  resource: true,
  description: true,
  settledAt: true,
  createdAt: true,
  updatedAt: true,
  listing: { select: { slug: true, name: true } },
  agent: { select: { slug: true, name: true } },
} satisfies Prisma.PaymentSelect;

type RawPayment = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

export type PaymentRow = Omit<
  RawPayment,
  "amount" | "listing" | "agent" | "settledAt"
> & {
  amount: string;
  settledAt: string | null;
  listingSlug: string | null;
  listingName: string | null;
  agentSlug: string | null;
  agentName: string | null;
  direction: "sent" | "received";
};

const toRow = (row: RawPayment, myAddresses: Set<string>): PaymentRow => {
  const { listing, agent, amount, settledAt, ...rest } = row;

  return {
    ...rest,
    amount: amount.toString(),
    settledAt: settledAt?.toISOString() ?? null,
    listingSlug: listing?.slug ?? null,
    listingName: listing?.name ?? null,
    agentSlug: agent?.slug ?? null,
    agentName: agent?.name ?? null,
    direction: myAddresses.has(row.payerAddress) ? "sent" : "received",
  };
};

export const walletAddressesFor = async (
  ownerId: string,
): Promise<string[]> => {
  const rows = await prisma.wallet.findMany({
    where: { ownerId },
    select: { address: true },
  });

  return [...new Set(rows.map((row) => row.address))];
};

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const orderFor = (
  sort: ListPaymentsQuery["sort"],
): Prisma.PaymentOrderByWithRelationInput[] => {
  switch (sort) {
    case "createdAt":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "amount":
      return [{ amount: "asc" }, { id: "asc" }];
    case "-amount":
      return [{ amount: "desc" }, { id: "desc" }];
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
};

const whereFor = (
  addresses: string[],
  query: ListPaymentsQuery,
): Prisma.PaymentWhereInput => {
  const sent: Prisma.PaymentWhereInput = {
    payerAddress: { in: addresses },
  };
  const received: Prisma.PaymentWhereInput = {
    recipientAddress: { in: addresses },
  };

  const where: Prisma.PaymentWhereInput =
    query.direction === "sent"
      ? sent
      : query.direction === "received"
        ? received
        : { OR: [sent, received] };

  if (query.status) {
    where.status = query.status;
  }
  if (query.network) {
    where.network = query.network;
  }

  if (query.q) {
    const needle = escapeLike(query.q);
    where.AND = [
      {
        OR: [
          { payerAddress: { contains: needle, mode: "insensitive" } },
          { recipientAddress: { contains: needle, mode: "insensitive" } },
          { reqId: { contains: needle, mode: "insensitive" } },
          { description: { contains: needle, mode: "insensitive" } },
          { listing: { name: { contains: needle, mode: "insensitive" } } },
          { agent: { name: { contains: needle, mode: "insensitive" } } },
        ],
      },
    ];
  }

  return where;
};

export const listPayments = async (
  ownerId: string,
  query: ListPaymentsQuery,
): Promise<{
  items: PaymentRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const addresses = await walletAddressesFor(ownerId);

  if (addresses.length === 0) {
    return { items: [], total: 0, page: query.page, limit: query.limit };
  }

  const where = whereFor(addresses, query);
  const skip = (query.page - 1) * query.limit;
  const mine = new Set(addresses);

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: orderFor(query.sort),
      skip,
      take: query.limit,
      select: PAYMENT_SELECT,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    items: items.map((row) => toRow(row, mine)),
    total,
    page: query.page,
    limit: query.limit,
  };
};

export interface PaymentTotals {
  count: number;
  settledCount: number;
  pendingCount: number;
  failedCount: number;
  volume: { assetAddress: string | null; network: string; amount: string }[];
}

export interface PaymentSummary {
  sent: PaymentTotals;
  received: PaymentTotals;
}

const emptyTotals = (): PaymentTotals => ({
  count: 0,
  settledCount: 0,
  pendingCount: 0,
  failedCount: 0,
  volume: [],
});

const totalsFor = async (
  where: Prisma.PaymentWhereInput,
): Promise<PaymentTotals> => {
  const [count, settledCount, pendingCount, failedCount, byAsset] =
    await prisma.$transaction([
      prisma.payment.count({ where }),
      prisma.payment.count({ where: { ...where, status: "SETTLED" } }),
      prisma.payment.count({ where: { ...where, status: "PENDING" } }),
      prisma.payment.count({ where: { ...where, status: "FAILED" } }),
      prisma.payment.groupBy({
        by: ["assetAddress", "network"],
        where: { ...where, status: "SETTLED" },
        _sum: { amount: true },
        orderBy: [{ network: "asc" }, { assetAddress: "asc" }],
      }),
    ]);

  return {
    count,
    settledCount,
    pendingCount,
    failedCount,
    volume: byAsset.map((row) => ({
      assetAddress: row.assetAddress,
      network: row.network,
      amount: (row._sum?.amount ?? 0).toString(),
    })),
  };
};

export const paymentSummary = async (
  ownerId: string,
): Promise<PaymentSummary> => {
  const addresses = await walletAddressesFor(ownerId);

  if (addresses.length === 0) {
    return { sent: emptyTotals(), received: emptyTotals() };
  }

  const [sent, received] = await Promise.all([
    totalsFor({ payerAddress: { in: addresses } }),
    totalsFor({ recipientAddress: { in: addresses } }),
  ]);

  return { sent, received };
};

export const getPayment = async (
  ownerId: string,
  id: string,
): Promise<PaymentRow | null> => {
  const addresses = await walletAddressesFor(ownerId);

  if (addresses.length === 0) {
    return null;
  }

  const row = await prisma.payment.findFirst({
    where: {
      id,
      OR: [
        { payerAddress: { in: addresses } },
        { recipientAddress: { in: addresses } },
      ],
    },
    select: PAYMENT_SELECT,
  });

  return row ? toRow(row, new Set(addresses)) : null;
};

export interface ReportResolution {
  listingId: string | null;
  agentId: string | null;
}

export const resolveReportTargets = async (
  ownerId: string,
  data: ReportPaymentInput,
): Promise<ReportResolution> => {
  const [listing, agent] = await Promise.all([
    data.listingSlug
      ? prisma.apiListing.findFirst({
          where: { ownerId, slug: data.listingSlug, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
    data.agentSlug
      ? prisma.agent.findFirst({
          where: { ownerId, slug: data.agentSlug, deletedAt: null },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return { listingId: listing?.id ?? null, agentId: agent?.id ?? null };
};

export const reportPayment = async (
  ownerId: string,
  data: ReportPaymentInput,
  targets: ReportResolution,
): Promise<{ row: PaymentRow; created: boolean }> => {
  const settledAt =
    data.status === "SETTLED"
      ? data.settledAt
        ? new Date(data.settledAt)
        : new Date()
      : null;

  const fields = {
    listingId: targets.listingId,
    agentId: targets.agentId,
    payerAddress: data.payerAddress,
    recipientAddress: data.recipientAddress,
    network: data.network,
    assetAddress: data.assetAddress ?? null,
    amount: data.amount,
    status: data.status,
    failureReason: data.failureReason ?? null,
    guaranteeClaims: data.guaranteeClaims ?? null,
    guaranteeSignature: data.guaranteeSignature ?? null,
    txHash: data.txHash ?? null,
    resource: data.resource ?? null,
    description: data.description ?? null,
    settledAt,
  };

  const existing = await prisma.payment.findUnique({
    where: { ownerId_reqId: { ownerId, reqId: data.reqId } },
    select: { id: true },
  });

  const row = await prisma.payment.upsert({
    where: { ownerId_reqId: { ownerId, reqId: data.reqId } },
    update: fields,
    create: { ownerId, reqId: data.reqId, ...fields },
    select: PAYMENT_SELECT,
  });

  return {
    row: toRow(row, new Set([data.recipientAddress])),
    created: existing === null,
  };
};

export interface MonthlyBucket {
  month: string;
  settledCount: number;
  failedCount: number;
  volume: { assetAddress: string | null; network: string; amount: string }[];
}

export interface PaymentStats {
  months: string[];
  received: MonthlyBucket[];
  sent: MonthlyBucket[];
}

interface CountRow {
  month: string;
  direction: string;
  status: string;
  count: bigint | number;
}

interface VolumeRow {
  month: string;
  direction: string;
  network: string;
  asset_address: string | null;
  amount: { toString(): string } | null;
}

const monthKeys = (months: number): string[] => {
  const keys: string[] = [];
  const now = new Date();
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(cursor);
    date.setUTCMonth(date.getUTCMonth() - index);
    keys.push(date.toISOString().slice(0, 7));
  }

  return keys;
};

export const paymentStats = async (
  ownerId: string,
  months: number,
): Promise<PaymentStats> => {
  const keys = monthKeys(months);
  const addresses = await walletAddressesFor(ownerId);

  const empty = (): MonthlyBucket[] =>
    keys.map((month) => ({
      month,
      settledCount: 0,
      failedCount: 0,
      volume: [],
    }));

  if (addresses.length === 0) {
    return { months: keys, received: empty(), sent: empty() };
  }

  const since = new Date(`${keys[0]}-01T00:00:00.000Z`);
  const owned = Prisma.join(addresses);

  const [counts, volumes] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             CASE WHEN payer_address IN (${owned}) THEN 'sent' ELSE 'received' END AS direction,
             status::text AS status,
             COUNT(*) AS count
        FROM payments
       WHERE created_at >= ${since}
         AND (payer_address IN (${owned}) OR recipient_address IN (${owned}))
       GROUP BY 1, 2, 3
    `,
    prisma.$queryRaw<VolumeRow[]>`
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
             CASE WHEN payer_address IN (${owned}) THEN 'sent' ELSE 'received' END AS direction,
             network::text AS network,
             asset_address,
             SUM(amount) AS amount
        FROM payments
       WHERE created_at >= ${since}
         AND status = 'SETTLED'
         AND (payer_address IN (${owned}) OR recipient_address IN (${owned}))
       GROUP BY 1, 2, 3, 4
    `,
  ]);

  const build = (direction: "sent" | "received"): MonthlyBucket[] => {
    const byMonth = new Map(
      keys.map((month) => [
        month,
        { month, settledCount: 0, failedCount: 0, volume: [] } as MonthlyBucket,
      ]),
    );

    for (const row of counts) {
      if (row.direction !== direction) {
        continue;
      }
      const bucket = byMonth.get(row.month);
      if (!bucket) {
        continue;
      }
      const count = Number(row.count);
      if (row.status === "SETTLED") {
        bucket.settledCount = count;
      } else if (row.status === "FAILED") {
        bucket.failedCount = count;
      }
    }

    for (const row of volumes) {
      if (row.direction !== direction) {
        continue;
      }
      byMonth.get(row.month)?.volume.push({
        assetAddress: row.asset_address,
        network: row.network,
        amount: (row.amount ?? 0).toString(),
      });
    }

    return keys.map((month) => byMonth.get(month) as MonthlyBucket);
  };

  return { months: keys, received: build("received"), sent: build("sent") };
};
