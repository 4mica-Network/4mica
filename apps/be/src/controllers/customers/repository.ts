import { type CustomerQuotaPeriod, Prisma, prisma } from "@4mica/db";
import { walletAddressesFor } from "@controllers/payments/repository";
import type {
  CreateCustomerInput,
  CustomerActivityQuery,
  CustomerIdentityInput,
  ListCustomersQuery,
  SetCustomerPolicyInput,
  SetCustomerStatusInput,
  UpdateCustomerIdentityInput,
} from "./schema";

export const CUSTOMER_IDENTITY_SELECT = {
  id: true,
  type: true,
  network: true,
  address: true,
  value: true,
  source: true,
  verifiedAt: true,
  validFrom: true,
  validUntil: true,
  blockedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerPaymentIdentitySelect;

export const CUSTOMER_SELECT = {
  id: true,
  name: true,
  email: true,
  type: true,
  status: true,
  statusReason: true,
  suspendedUntil: true,
  freeQuotaUnit: true,
  freeQuota: true,
  freeQuotaPeriod: true,
  quotaResetAt: true,
  discountPercent: true,
  discountFixed: true,
  minPaymentAmount: true,
  approvalThreshold: true,
  description: true,
  notes: true,
  dailyLimit: true,
  monthlyLimit: true,
  limitCurrency: true,
  createdAt: true,
  updatedAt: true,
  identities: {
    select: CUSTOMER_IDENTITY_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.CustomerSelect;

type RawCustomer = Prisma.CustomerGetPayload<{
  select: typeof CUSTOMER_SELECT;
}>;
type RawIdentity = RawCustomer["identities"][number];

export interface SpendBucket {
  network: string;
  assetAddress: string | null;
  amount: string;
}

export interface CustomerSpend {
  totalSpend: SpendBucket[];
  recentSpend: SpendBucket[];
  txnCount: number;
  settledCount: number;
  failedCount: number;
  lastActiveAt: string | null;
}

export type CustomerIdentityRow = Omit<
  RawIdentity,
  "verifiedAt" | "validFrom" | "validUntil" | "blockedAt"
> & {
  verifiedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  blockedAt: string | null;
};

type MoneyField =
  | "dailyLimit"
  | "monthlyLimit"
  | "freeQuota"
  | "discountPercent"
  | "discountFixed"
  | "minPaymentAmount"
  | "approvalThreshold";

export type CustomerRow = Omit<
  RawCustomer,
  MoneyField | "identities" | "suspendedUntil" | "quotaResetAt"
> & {
  [K in MoneyField]: string | null;
} & {
  suspendedUntil: string | null;
  quotaResetAt: string | null;
  identities: CustomerIdentityRow[];
  quotaUsed: string | null;
  quotaRemaining: string | null;
} & CustomerSpend;

const emptySpend = (): CustomerSpend => ({
  totalSpend: [],
  recentSpend: [],
  txnCount: 0,
  settledCount: 0,
  failedCount: 0,
  lastActiveAt: null,
});

const toIdentityRow = (row: RawIdentity): CustomerIdentityRow => ({
  ...row,
  verifiedAt: row.verifiedAt?.toISOString() ?? null,
  validFrom: row.validFrom?.toISOString() ?? null,
  validUntil: row.validUntil?.toISOString() ?? null,
  blockedAt: row.blockedAt?.toISOString() ?? null,
});

const toRow = (
  row: RawCustomer,
  spend: CustomerSpend,
  quota: QuotaUsage = { used: null, remaining: null },
): CustomerRow => {
  const {
    dailyLimit,
    monthlyLimit,
    freeQuota,
    discountPercent,
    discountFixed,
    minPaymentAmount,
    approvalThreshold,
    identities,
    suspendedUntil,
    quotaResetAt,
    ...rest
  } = row;

  return {
    ...rest,
    dailyLimit: dailyLimit?.toString() ?? null,
    monthlyLimit: monthlyLimit?.toString() ?? null,
    freeQuota: freeQuota?.toString() ?? null,
    discountPercent: discountPercent?.toString() ?? null,
    discountFixed: discountFixed?.toString() ?? null,
    minPaymentAmount: minPaymentAmount?.toString() ?? null,
    approvalThreshold: approvalThreshold?.toString() ?? null,
    suspendedUntil: suspendedUntil?.toISOString() ?? null,
    quotaResetAt: quotaResetAt?.toISOString() ?? null,
    identities: identities.map(toIdentityRow),
    quotaUsed: quota.used,
    quotaRemaining: quota.remaining,
    ...spend,
  };
};

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const RECENT_WINDOW_DAYS = 30;

const recentSince = (): Date =>
  new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

const matchedPayments = (
  ownerId: string,
  owned: Prisma.Sql,
  customerIds: Prisma.Sql,
): Prisma.Sql => Prisma.sql`
  SELECT i.customer_id,
         p.network::text AS network,
         p.asset_address,
         p.amount,
         p.status::text AS status,
         p.created_at
    FROM customer_payment_identities i
    JOIN payments p
      ON p.payer_address = i.address
     AND p.network       = i.network
     AND (i.valid_from  IS NULL OR p.created_at >= i.valid_from)
     AND (i.valid_until IS NULL OR p.created_at <  i.valid_until)
   WHERE i.owner_id = ${ownerId}
     AND i.type = 'WALLET'
     AND i.customer_id IN (${customerIds})
     AND p.recipient_address IN (${owned})
`;

interface ScalarRow {
  id: string;
  txn_count: bigint;
  settled_count: bigint;
  failed_count: bigint;
  last_active_at: Date | null;
}

interface SpendRow {
  customer_id: string;
  network: string;
  asset_address: string | null;
  total_amount: Prisma.Decimal | null;
  recent_amount: Prisma.Decimal | null;
}

const filterFor = (
  ownerId: string,
  query: Pick<
    ListCustomersQuery,
    "q" | "type" | "status" | "network" | "source"
  >,
): Prisma.Sql => {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`c.owner_id = ${ownerId}`,
    Prisma.sql`c.deleted_at IS NULL`,
  ];

  if (query.type) {
    clauses.push(Prisma.sql`c.type = ${query.type}::"CustomerType"`);
  }
  if (query.status) {
    clauses.push(Prisma.sql`c.status = ${query.status}::"CustomerStatus"`);
  }
  if (query.network) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM customer_payment_identities i
       WHERE i.customer_id = c.id
         AND i.network = ${query.network}::"PaymentNetwork"
    )`);
  }
  if (query.source) {
    clauses.push(Prisma.sql`EXISTS (
      SELECT 1 FROM customer_payment_identities i
       WHERE i.customer_id = c.id
         AND i.source = ${query.source}::"CustomerIdentitySource"
    )`);
  }
  if (query.q) {
    const needle = `%${escapeLike(query.q)}%`;
    clauses.push(Prisma.sql`(
      c.name ILIKE ${needle}
      OR c.email ILIKE ${needle}
      OR c.description ILIKE ${needle}
      OR EXISTS (
        SELECT 1 FROM customer_payment_identities i
         WHERE i.customer_id = c.id
           AND (i.address ILIKE ${needle} OR i.value ILIKE ${needle})
      )
    )`);
  }

  return Prisma.join(clauses, " AND ");
};

/**
 * `rank_total` and `rank_recent` sum across assets, which no reported figure
 * ever does — they exist only to order the page. Every amount this module
 * returns stays grouped by (network, assetAddress).
 */
const orderFor = (sort: ListCustomersQuery["sort"]): Prisma.Sql => {
  switch (sort) {
    case "totalSpend":
      return Prisma.sql`rank_total ASC, c.id ASC`;
    case "recentSpend":
      return Prisma.sql`rank_recent ASC, c.id ASC`;
    case "-recentSpend":
      return Prisma.sql`rank_recent DESC, c.id DESC`;
    case "txnCount":
      return Prisma.sql`txn_count ASC, c.id ASC`;
    case "-txnCount":
      return Prisma.sql`txn_count DESC, c.id DESC`;
    case "lastActiveAt":
      return Prisma.sql`last_active_at ASC NULLS FIRST, c.id ASC`;
    case "-lastActiveAt":
      return Prisma.sql`last_active_at DESC NULLS LAST, c.id DESC`;
    case "name":
      return Prisma.sql`c.name ASC, c.id ASC`;
    case "-name":
      return Prisma.sql`c.name DESC, c.id DESC`;
    case "createdAt":
      return Prisma.sql`c.created_at ASC, c.id ASC`;
    case "-createdAt":
      return Prisma.sql`c.created_at DESC, c.id DESC`;
    default:
      return Prisma.sql`rank_total DESC, c.id DESC`;
  }
};

const spendFor = async (
  ownerId: string,
  customerIds: string[],
  addresses: string[],
): Promise<Map<string, CustomerSpend>> => {
  const byCustomer = new Map<string, CustomerSpend>(
    customerIds.map((id) => [id, emptySpend()]),
  );

  if (customerIds.length === 0 || addresses.length === 0) {
    return byCustomer;
  }

  const owned = Prisma.join(addresses);
  const ids = Prisma.join(customerIds);
  const since = recentSince();
  const matched = matchedPayments(ownerId, owned, ids);

  const [scalars, buckets] = await Promise.all([
    prisma.$queryRaw<ScalarRow[]>`
      WITH matched AS (${matched})
      SELECT m.customer_id AS id,
             COUNT(*) AS txn_count,
             COUNT(*) FILTER (WHERE m.status = 'SETTLED') AS settled_count,
             COUNT(*) FILTER (WHERE m.status = 'FAILED') AS failed_count,
             MAX(m.created_at) AS last_active_at
        FROM matched m
       GROUP BY 1
    `,
    prisma.$queryRaw<SpendRow[]>`
      WITH matched AS (${matched})
      SELECT m.customer_id,
             m.network,
             m.asset_address,
             SUM(m.amount) FILTER (WHERE m.status = 'SETTLED') AS total_amount,
             SUM(m.amount) FILTER (
               WHERE m.status = 'SETTLED' AND m.created_at >= ${since}
             ) AS recent_amount
        FROM matched m
       GROUP BY 1, 2, 3
       ORDER BY 2 ASC, 3 ASC
    `,
  ]);

  for (const row of scalars) {
    const entry = byCustomer.get(row.id);
    if (!entry) {
      continue;
    }
    entry.txnCount = Number(row.txn_count);
    entry.settledCount = Number(row.settled_count);
    entry.failedCount = Number(row.failed_count);
    entry.lastActiveAt = row.last_active_at?.toISOString() ?? null;
  }

  for (const row of buckets) {
    const entry = byCustomer.get(row.customer_id);
    if (!entry) {
      continue;
    }
    if (row.total_amount !== null) {
      entry.totalSpend.push({
        network: row.network,
        assetAddress: row.asset_address,
        amount: row.total_amount.toString(),
      });
    }
    if (row.recent_amount !== null) {
      entry.recentSpend.push({
        network: row.network,
        assetAddress: row.asset_address,
        amount: row.recent_amount.toString(),
      });
    }
  }

  return byCustomer;
};

export interface QuotaUsage {
  used: string | null;
  remaining: string | null;
}

/**
 * Where the current allowance window starts. A TOTAL quota has no window, so
 * it runs from the last reset (or from the beginning if never reset); the
 * others start at the current day, week or month, unless a later reset moved
 * the line forward.
 */
export const quotaWindowStart = (
  period: CustomerQuotaPeriod,
  resetAt: Date | null,
  now = new Date(),
): Date | null => {
  if (period === "TOTAL") {
    return resetAt;
  }

  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  if (period === "WEEK") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else if (period === "MONTH") {
    start.setUTCDate(1);
  }

  return resetAt && resetAt > start ? resetAt : start;
};

/**
 * Usage is read off the payments the customer has already made, so it cannot
 * drift from them. REQUESTS counts rows, AMOUNT sums what was settled.
 */
const quotaUsageFor = async (
  ownerId: string,
  customerId: string,
  customer: Pick<
    RawCustomer,
    "freeQuotaUnit" | "freeQuota" | "freeQuotaPeriod" | "quotaResetAt"
  >,
  addresses: string[],
): Promise<QuotaUsage> => {
  if (
    !customer.freeQuotaUnit ||
    !customer.freeQuota ||
    !customer.freeQuotaPeriod ||
    addresses.length === 0
  ) {
    return { used: null, remaining: null };
  }

  const since = quotaWindowStart(
    customer.freeQuotaPeriod,
    customer.quotaResetAt,
  );
  const owned = Prisma.join(addresses);
  const matched = matchedPayments(ownerId, owned, Prisma.join([customerId]));
  const window = since
    ? Prisma.sql`AND m.created_at >= ${since}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<{ used: Prisma.Decimal | null }[]>`
    WITH matched AS (${matched})
    SELECT ${
      customer.freeQuotaUnit === "REQUESTS"
        ? Prisma.sql`COUNT(*)::numeric`
        : Prisma.sql`COALESCE(SUM(m.amount) FILTER (WHERE m.status = 'SETTLED'), 0)`
    } AS used
      FROM matched m
     WHERE TRUE ${window}
  `;

  const used = rows[0]?.used ?? 0;
  const remaining = customer.freeQuota.minus(used);

  return {
    used: used.toString(),
    remaining: (remaining.isNegative()
      ? new Prisma.Decimal(0)
      : remaining
    ).toString(),
  };
};

export const listCustomers = async (
  ownerId: string,
  query: ListCustomersQuery,
): Promise<{
  items: CustomerRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const addresses = await walletAddressesFor(ownerId);
  const filter = filterFor(ownerId, query);
  const skip = (query.page - 1) * query.limit;

  const owned =
    addresses.length > 0 ? Prisma.join(addresses) : Prisma.sql`NULL`;
  const since = recentSince();

  const [pageRows, totals] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      WITH matched AS (
        SELECT i.customer_id,
               p.amount,
               p.status::text AS status,
               p.created_at
          FROM customer_payment_identities i
          JOIN payments p
            ON p.payer_address = i.address
           AND p.network       = i.network
           AND (i.valid_from  IS NULL OR p.created_at >= i.valid_from)
           AND (i.valid_until IS NULL OR p.created_at <  i.valid_until)
         WHERE i.owner_id = ${ownerId}
           AND i.type = 'WALLET'
           AND p.recipient_address IN (${owned})
      )
      SELECT c.id,
             COUNT(m.customer_id) AS txn_count,
             MAX(m.created_at) AS last_active_at,
             COALESCE(SUM(m.amount) FILTER (WHERE m.status = 'SETTLED'), 0)
               AS rank_total,
             COALESCE(SUM(m.amount) FILTER (
               WHERE m.status = 'SETTLED' AND m.created_at >= ${since}
             ), 0) AS rank_recent
        FROM customers c
        LEFT JOIN matched m ON m.customer_id = c.id
       WHERE ${filter}
       GROUP BY c.id
       ORDER BY ${orderFor(query.sort)}
       LIMIT ${query.limit} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM customers c WHERE ${filter}
    `,
  ]);

  const total = Number(totals[0]?.total ?? 0);
  const pageIds = pageRows.map((row) => row.id);

  if (pageIds.length === 0) {
    return { items: [], total, page: query.page, limit: query.limit };
  }

  const [rows, spend] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { in: pageIds } },
      select: CUSTOMER_SELECT,
    }),
    spendFor(ownerId, pageIds, addresses),
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = pageIds
    .map((id) => byId.get(id))
    .filter((row): row is RawCustomer => row !== undefined)
    .map((row) => toRow(row, spend.get(row.id) ?? emptySpend()));

  return { items, total, page: query.page, limit: query.limit };
};

export const getCustomer = async (
  ownerId: string,
  id: string,
): Promise<CustomerRow | null> => {
  const row = await prisma.customer.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: CUSTOMER_SELECT,
  });

  if (!row) {
    return null;
  }

  const addresses = await walletAddressesFor(ownerId);
  const [spend, quota] = await Promise.all([
    spendFor(ownerId, [row.id], addresses),
    quotaUsageFor(ownerId, row.id, row, addresses),
  ]);

  return toRow(row, spend.get(row.id) ?? emptySpend(), quota);
};

export const ownsCustomer = async (
  ownerId: string,
  id: string,
): Promise<boolean> => {
  const row = await prisma.customer.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { id: true },
  });

  return row !== null;
};

const toIdentityData = (input: CustomerIdentityInput) =>
  input.type === "WALLET"
    ? {
        type: input.type,
        network: input.network,
        address: input.address,
        value: null,
        source: input.source,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      }
    : {
        type: input.type,
        network: null,
        address: null,
        value: input.value,
        source: input.source,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      };

export const createCustomer = async (
  ownerId: string,
  data: CreateCustomerInput,
): Promise<CustomerRow> => {
  const row = await prisma.customer.create({
    data: {
      ownerId,
      name: data.name,
      email: data.email ?? null,
      type: data.type,
      description: data.description ?? null,
      notes: data.notes ?? null,
      dailyLimit: data.dailyLimit ?? null,
      monthlyLimit: data.monthlyLimit ?? null,
      limitCurrency: data.limitCurrency,
      identities: {
        create: data.identities.map((identity) => ({
          ownerId,
          ...toIdentityData(identity),
        })),
      },
    },
    select: CUSTOMER_SELECT,
  });

  const addresses = await walletAddressesFor(ownerId);
  const spend = await spendFor(ownerId, [row.id], addresses);

  return toRow(row, spend.get(row.id) ?? emptySpend());
};

export const updateCustomer = async (
  ownerId: string,
  id: string,
  data: Prisma.CustomerUpdateManyMutationInput,
): Promise<CustomerRow | null> => {
  const { count } = await prisma.customer.updateMany({
    where: { id, ownerId, deletedAt: null },
    data,
  });

  return count > 0 ? getCustomer(ownerId, id) : null;
};

export const addIdentity = async (
  ownerId: string,
  customerId: string,
  input: CustomerIdentityInput,
): Promise<CustomerRow | null> => {
  await prisma.customerPaymentIdentity.create({
    data: { ownerId, customerId, ...toIdentityData(input) },
  });

  return getCustomer(ownerId, customerId);
};

/**
 * Moving to ACTIVE clears the suspension window and the reason together: the
 * database refuses a `suspendedUntil` that outlives a SUSPENDED status, so
 * leaving it behind would make the row unwritable.
 */
export const setCustomerStatus = async (
  ownerId: string,
  id: string,
  input: SetCustomerStatusInput,
): Promise<CustomerRow | null> => {
  const data: Prisma.CustomerUpdateManyMutationInput =
    input.status === "ACTIVE"
      ? { status: "ACTIVE", suspendedUntil: null, statusReason: null }
      : input.status === "SUSPENDED"
        ? {
            status: "SUSPENDED",
            suspendedUntil: new Date(input.suspendedUntil),
            statusReason: input.reason ?? null,
          }
        : {
            status: "BLOCKED",
            suspendedUntil: null,
            statusReason: input.reason ?? null,
          };

  const { count } = await prisma.customer.updateMany({
    where: { id, ownerId, deletedAt: null },
    data,
  });

  return count > 0 ? getCustomer(ownerId, id) : null;
};

/**
 * Writing a quota starts its window now, so an allowance never arrives already
 * spent by payments that predate it. Clearing the quota clears that line too.
 */
export const setCustomerPolicy = async (
  ownerId: string,
  id: string,
  input: SetCustomerPolicyInput,
): Promise<CustomerRow | null> => {
  const data: Prisma.CustomerUpdateManyMutationInput = { ...input };

  if (input.freeQuotaUnit !== undefined) {
    data.quotaResetAt = input.freeQuotaUnit === null ? null : new Date();
  }

  const { count } = await prisma.customer.updateMany({
    where: { id, ownerId, deletedAt: null },
    data,
  });

  return count > 0 ? getCustomer(ownerId, id) : null;
};

export const resetCustomerUsage = async (
  ownerId: string,
  id: string,
): Promise<CustomerRow | null> => {
  const { count } = await prisma.customer.updateMany({
    where: { id, ownerId, deletedAt: null },
    data: { quotaResetAt: new Date() },
  });

  return count > 0 ? getCustomer(ownerId, id) : null;
};

export const updateIdentity = async (
  ownerId: string,
  customerId: string,
  identityId: string,
  input: UpdateCustomerIdentityInput,
): Promise<CustomerRow | null> => {
  const data: Prisma.CustomerPaymentIdentityUpdateManyMutationInput = {};

  if (input.source !== undefined) {
    data.source = input.source;
  }
  if (input.validFrom !== undefined) {
    data.validFrom = input.validFrom ? new Date(input.validFrom) : null;
  }
  if (input.validUntil !== undefined) {
    data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
  }
  if (input.blocked !== undefined) {
    data.blockedAt = input.blocked ? new Date() : null;
  }

  const { count } = await prisma.customerPaymentIdentity.updateMany({
    where: { id: identityId, customerId, ownerId },
    data,
  });

  return count > 0 ? getCustomer(ownerId, customerId) : null;
};

export const removeIdentity = async (
  ownerId: string,
  customerId: string,
  identityId: string,
): Promise<boolean> => {
  const { count } = await prisma.customerPaymentIdentity.deleteMany({
    where: { id: identityId, customerId, ownerId },
  });

  return count > 0;
};

export const softDeleteCustomer = async (
  ownerId: string,
  id: string,
): Promise<boolean> => {
  const row = await prisma.customer.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { id: true },
  });

  if (!row) {
    return false;
  }

  await prisma.$transaction([
    prisma.customerPaymentIdentity.deleteMany({
      where: { customerId: row.id },
    }),
    prisma.customer.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    }),
  ]);

  return true;
};

export const batchSoftDeleteCustomers = async (
  ownerId: string,
  ids: string[],
): Promise<{ deleted: string[]; notFound: string[] }> => {
  const owned = await prisma.customer.findMany({
    where: { id: { in: ids }, ownerId, deletedAt: null },
    select: { id: true },
  });

  const deleted = owned.map((row) => row.id);

  if (deleted.length > 0) {
    await prisma.$transaction([
      prisma.customerPaymentIdentity.deleteMany({
        where: { customerId: { in: deleted } },
      }),
      prisma.customer.updateMany({
        where: { id: { in: deleted } },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  const deletedSet = new Set(deleted);

  return { deleted, notFound: ids.filter((id) => !deletedSet.has(id)) };
};

export const customerOverview = async (
  ownerId: string,
  customerId: string,
): Promise<CustomerSpend & { firstSeenAt: string | null }> => {
  const addresses = await walletAddressesFor(ownerId);
  const spend = await spendFor(ownerId, [customerId], addresses);
  const base = spend.get(customerId) ?? emptySpend();

  if (addresses.length === 0 || base.txnCount === 0) {
    return { ...base, firstSeenAt: null };
  }

  const rows = await prisma.$queryRaw<{ first_seen_at: Date | null }[]>`
    WITH matched AS (${matchedPayments(
      ownerId,
      Prisma.join(addresses),
      Prisma.join([customerId]),
    )})
    SELECT MIN(m.created_at) AS first_seen_at FROM matched m
  `;

  return {
    ...base,
    firstSeenAt: rows[0]?.first_seen_at?.toISOString() ?? null,
  };
};

export interface BreakdownEntry {
  kind: "listing" | "agent" | "unattributed";
  id: string | null;
  slug: string | null;
  name: string | null;
  txnCount: number;
  volume: SpendBucket[];
}

interface BreakdownRow {
  listing_id: string | null;
  agent_id: string | null;
  listing_slug: string | null;
  listing_name: string | null;
  agent_slug: string | null;
  agent_name: string | null;
  network: string;
  asset_address: string | null;
  txn_count: bigint;
  amount: Prisma.Decimal | null;
}

export const customerBreakdown = async (
  ownerId: string,
  customerId: string,
): Promise<BreakdownEntry[]> => {
  const addresses = await walletAddressesFor(ownerId);

  if (addresses.length === 0) {
    return [];
  }

  const owned = Prisma.join(addresses);

  const rows = await prisma.$queryRaw<BreakdownRow[]>`
    SELECT p.listing_id,
           p.agent_id,
           l.slug AS listing_slug,
           l.name AS listing_name,
           a.slug AS agent_slug,
           a.name AS agent_name,
           p.network::text AS network,
           p.asset_address,
           COUNT(*) AS txn_count,
           SUM(p.amount) FILTER (WHERE p.status = 'SETTLED') AS amount
      FROM customer_payment_identities i
      JOIN payments p
        ON p.payer_address = i.address
       AND p.network       = i.network
       AND (i.valid_from  IS NULL OR p.created_at >= i.valid_from)
       AND (i.valid_until IS NULL OR p.created_at <  i.valid_until)
      LEFT JOIN api_listings l ON l.id = p.listing_id
      LEFT JOIN agents a ON a.id = p.agent_id
     WHERE i.owner_id = ${ownerId}
       AND i.type = 'WALLET'
       AND i.customer_id = ${customerId}
       AND p.recipient_address IN (${owned})
     GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
     ORDER BY 7 ASC, 8 ASC
  `;

  const byTarget = new Map<string, BreakdownEntry>();

  for (const row of rows) {
    const kind: BreakdownEntry["kind"] = row.listing_id
      ? "listing"
      : row.agent_id
        ? "agent"
        : "unattributed";
    const id = row.listing_id ?? row.agent_id ?? null;
    const key = `${kind}:${id ?? "none"}`;

    const entry =
      byTarget.get(key) ??
      ({
        kind,
        id,
        slug: row.listing_slug ?? row.agent_slug ?? null,
        name: row.listing_name ?? row.agent_name ?? null,
        txnCount: 0,
        volume: [],
      } satisfies BreakdownEntry);

    entry.txnCount += Number(row.txn_count);

    if (row.amount !== null) {
      entry.volume.push({
        network: row.network,
        assetAddress: row.asset_address,
        amount: row.amount.toString(),
      });
    }

    byTarget.set(key, entry);
  }

  return [...byTarget.values()];
};

const activityOrder = (sort: CustomerActivityQuery["sort"]): Prisma.Sql => {
  switch (sort) {
    case "createdAt":
      return Prisma.sql`p.created_at ASC, p.id ASC`;
    case "amount":
      return Prisma.sql`p.amount ASC, p.id ASC`;
    case "-amount":
      return Prisma.sql`p.amount DESC, p.id DESC`;
    default:
      return Prisma.sql`p.created_at DESC, p.id DESC`;
  }
};

export interface CustomerPaymentRow {
  id: string;
  listingId: string | null;
  agentId: string | null;
  payerAddress: string;
  recipientAddress: string;
  network: string;
  assetAddress: string | null;
  amount: string;
  status: string;
  failureReason: string | null;
  reqId: string;
  txHash: string | null;
  resource: string | null;
  description: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
  listingSlug: string | null;
  listingName: string | null;
  agentSlug: string | null;
  agentName: string | null;
  direction: "received";
}

interface RawActivityRow {
  id: string;
  listing_id: string | null;
  agent_id: string | null;
  payer_address: string;
  recipient_address: string;
  network: string;
  asset_address: string | null;
  amount: Prisma.Decimal;
  status: string;
  failure_reason: string | null;
  req_id: string;
  tx_hash: string | null;
  resource: string | null;
  description: string | null;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
  listing_slug: string | null;
  listing_name: string | null;
  agent_slug: string | null;
  agent_name: string | null;
}

export const customerActivity = async (
  ownerId: string,
  customerId: string,
  query: CustomerActivityQuery,
): Promise<{
  items: CustomerPaymentRow[];
  total: number;
  page: number;
  limit: number;
}> => {
  const addresses = await walletAddressesFor(ownerId);

  if (addresses.length === 0) {
    return { items: [], total: 0, page: query.page, limit: query.limit };
  }

  const owned = Prisma.join(addresses);
  const skip = (query.page - 1) * query.limit;

  const clauses: Prisma.Sql[] = [
    Prisma.sql`i.owner_id = ${ownerId}`,
    Prisma.sql`i.type = 'WALLET'`,
    Prisma.sql`i.customer_id = ${customerId}`,
    Prisma.sql`p.recipient_address IN (${owned})`,
  ];

  if (query.status) {
    clauses.push(Prisma.sql`p.status = ${query.status}::"PaymentStatus"`);
  }
  if (query.network) {
    clauses.push(Prisma.sql`p.network = ${query.network}::"PaymentNetwork"`);
  }

  const where = Prisma.join(clauses, " AND ");

  const from = Prisma.sql`
    FROM customer_payment_identities i
    JOIN payments p
      ON p.payer_address = i.address
     AND p.network       = i.network
     AND (i.valid_from  IS NULL OR p.created_at >= i.valid_from)
     AND (i.valid_until IS NULL OR p.created_at <  i.valid_until)
    LEFT JOIN api_listings l ON l.id = p.listing_id
    LEFT JOIN agents a ON a.id = p.agent_id
  `;

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<RawActivityRow[]>`
      SELECT p.id,
             p.listing_id,
             p.agent_id,
             p.payer_address,
             p.recipient_address,
             p.network::text AS network,
             p.asset_address,
             p.amount,
             p.status::text AS status,
             p.failure_reason,
             p.req_id,
             p.tx_hash,
             p.resource,
             p.description,
             p.settled_at,
             p.created_at,
             p.updated_at,
             l.slug AS listing_slug,
             l.name AS listing_name,
             a.slug AS agent_slug,
             a.name AS agent_name
      ${from}
       WHERE ${where}
       ORDER BY ${activityOrder(query.sort)}
       LIMIT ${query.limit} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total ${from} WHERE ${where}
    `,
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      agentId: row.agent_id,
      payerAddress: row.payer_address,
      recipientAddress: row.recipient_address,
      network: row.network,
      assetAddress: row.asset_address,
      amount: row.amount.toString(),
      status: row.status,
      failureReason: row.failure_reason,
      reqId: row.req_id,
      txHash: row.tx_hash,
      resource: row.resource,
      description: row.description,
      settledAt: row.settled_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      listingSlug: row.listing_slug,
      listingName: row.listing_name,
      agentSlug: row.agent_slug,
      agentName: row.agent_name,
      direction: "received" as const,
    })),
    total: Number(totals[0]?.total ?? 0),
    page: query.page,
    limit: query.limit,
  };
};
