import { Prisma, prisma } from "@4mica/db";
import { amountText } from "@utils/amount";
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
  couponCode: true,
  creditApplied: true,
  redeemedAt: true,
  listing: { select: { slug: true, name: true } },
  agent: { select: { slug: true, name: true } },
} satisfies Prisma.PaymentSelect;

type RawPayment = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

export type PaymentRow = Omit<
  RawPayment,
  | "amount"
  | "listing"
  | "agent"
  | "settledAt"
  | "couponCode"
  | "creditApplied"
  | "redeemedAt"
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
  const {
    listing,
    agent,
    amount,
    settledAt,
    couponCode: _couponCode,
    creditApplied: _creditApplied,
    redeemedAt: _redeemedAt,
    ...rest
  } = row;

  return {
    ...rest,
    amount: amountText(amount),
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

/** A seller may only report payments into a wallet it has proved it controls. */
export const ownsRecipientWallet = async (
  ownerId: string,
  address: string,
  network: ReportPaymentInput["network"],
): Promise<boolean> =>
  (await prisma.wallet.findFirst({
    where: { ownerId, address, network },
    select: { id: true },
  })) !== null;

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
      amount: amountText(row._sum?.amount ?? 0),
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

const canonicalAmount = (value: string): string =>
  value.includes(".") ? value.replace(/\.?0+$/, "") : value;

const IDENTITY_FIELDS = [
  "payerAddress",
  "recipientAddress",
  "network",
  "assetAddress",
  "amount",
] as const;

const DETAIL_FIELDS = [
  "listingId",
  "agentId",
  "failureReason",
  "guaranteeClaims",
  "guaranteeSignature",
  "txHash",
  "resource",
  "description",
  "couponCode",
  "creditApplied",
] as const;

type PaymentStatus = ReportPaymentInput["status"];

const canMove = (from: PaymentStatus, to: PaymentStatus): boolean =>
  from === "PENDING" || from === to;

const EXISTING_SELECT = {
  id: true,
  status: true,
  settledAt: true,
  payerAddress: true,
  recipientAddress: true,
  network: true,
  assetAddress: true,
  amount: true,
  listingId: true,
  agentId: true,
  failureReason: true,
  guaranteeClaims: true,
  guaranteeSignature: true,
  txHash: true,
  resource: true,
  description: true,
  couponCode: true,
  creditApplied: true,
} satisfies Prisma.PaymentSelect;

type ExistingPayment = Prisma.PaymentGetPayload<{
  select: typeof EXISTING_SELECT;
}>;

export type ReportOutcome =
  | { kind: "created" | "updated"; row: PaymentRow; redeemable: boolean }
  | { kind: "conflict"; field: string; message: string };

const isUniqueViolation = (error: unknown): boolean =>
  (error as { code?: unknown })?.code === "P2002";

const identityConflict = (
  existing: ExistingPayment,
  incoming: Record<(typeof IDENTITY_FIELDS)[number], string | null>,
): string | null => {
  for (const field of IDENTITY_FIELDS) {
    const before =
      field === "amount"
        ? canonicalAmount(amountText(existing.amount))
        : (existing[field] as string | null);
    const after =
      field === "amount"
        ? canonicalAmount(incoming.amount ?? "")
        : incoming[field];

    if (before !== after) {
      return field;
    }
  }
  return null;
};

const isRedeemable = (row: RawPayment): boolean =>
  row.status === "SETTLED" &&
  row.redeemedAt === null &&
  (row.couponCode !== null || row.creditApplied !== null);

export const reportPayment = async (
  ownerId: string,
  data: ReportPaymentInput,
  targets: ReportResolution,
): Promise<ReportOutcome> => {
  const identity = {
    payerAddress: data.payerAddress,
    recipientAddress: data.recipientAddress,
    network: data.network,
    assetAddress: data.assetAddress ?? null,
    amount: data.amount,
  };

  const detail: Record<(typeof DETAIL_FIELDS)[number], string | null> = {
    listingId: targets.listingId,
    agentId: targets.agentId,
    failureReason: data.failureReason ?? null,
    guaranteeClaims: data.guaranteeClaims ?? null,
    guaranteeSignature: data.guaranteeSignature ?? null,
    txHash: data.txHash ?? null,
    resource: data.resource ?? null,
    description: data.description ?? null,
    couponCode: data.couponCode ?? null,
    creditApplied: data.creditApplied ?? null,
  };

  const reportedSettledAt = data.settledAt ? new Date(data.settledAt) : null;
  const where = { ownerId_reqId: { ownerId, reqId: data.reqId } };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await prisma.payment.findUnique({
      where,
      select: EXISTING_SELECT,
    });

    if (!existing) {
      try {
        const row = await prisma.payment.create({
          data: {
            ownerId,
            reqId: data.reqId,
            ...identity,
            ...detail,
            status: data.status,
            settledAt:
              data.status === "SETTLED"
                ? (reportedSettledAt ?? new Date())
                : null,
          },
          select: PAYMENT_SELECT,
        });
        return {
          kind: "created",
          row: toRow(row, new Set([data.recipientAddress])),
          redeemable: isRedeemable(row),
        };
      } catch (error) {
        if (isUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    const field = identityConflict(existing, identity);
    if (field) {
      return {
        kind: "conflict",
        field,
        message: `A payment with this reqId was already reported with a different ${field}.`,
      };
    }

    if (!canMove(existing.status, data.status)) {
      return {
        kind: "conflict",
        field: "status",
        message: `This payment is already ${existing.status} and cannot become ${data.status}.`,
      };
    }

    const final = existing.status !== "PENDING";
    const update: Record<string, unknown> = {};
    for (const key of DETAIL_FIELDS) {
      const value = detail[key];
      if (value !== null && (!final || existing[key] === null)) {
        update[key] = value;
      }
    }

    if (!final && data.status !== existing.status) {
      update.status = data.status;
      if (data.status === "SETTLED") {
        update.settledAt = reportedSettledAt ?? new Date();
      }
    }

    if (Object.keys(update).length > 0) {
      const { count } = await prisma.payment.updateMany({
        where: { id: existing.id, status: existing.status },
        data: update,
      });
      if (count === 0) {
        continue;
      }
    }

    const row = await prisma.payment.findUnique({
      where: { id: existing.id },
      select: PAYMENT_SELECT,
    });

    if (row) {
      return {
        kind: "updated",
        row: toRow(row, new Set([data.recipientAddress])),
        redeemable: isRedeemable(row),
      };
    }
  }

  return {
    kind: "conflict",
    field: "reqId",
    message: "This payment changed while it was being reported. Retry.",
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
  amount: Prisma.Decimal | null;
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
        amount: amountText(row.amount ?? 0),
      });
    }

    return keys.map((month) => byMonth.get(month) as MonthlyBucket);
  };

  return { months: keys, received: build("received"), sent: build("sent") };
};
