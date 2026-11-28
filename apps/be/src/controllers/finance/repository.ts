import {
  type EnvironmentKind,
  type PaymentNetwork,
  Prisma,
  prisma,
  type SpendAuthorizationStatus,
} from "@4mica/db";
import { networksForEnvironment } from "@4mica/rules";
import { walletAddressesFor } from "@controllers/payments/repository";
import { amountText, optionalAmountText } from "@utils/amount";
import { type ProjectAccess, projectIn, projectInOrNone } from "@utils/scope";
import type {
  DateRange,
  ExportDirection,
  UsageDirection,
  UsageGroup,
} from "./schema";

export interface FinanceScope {
  orgId: string;
  environment: EnvironmentKind;
  projects: ProjectAccess;
}

export const RECONCILIATION_LIMIT = 500;

const networksOf = (environment: EnvironmentKind): PaymentNetwork[] =>
  networksForEnvironment(environment) as PaymentNetwork[];

const inRange = (range: DateRange) => ({ gte: range.from, lt: range.to });

export interface AssetTotal {
  network: string;
  assetAddress: string | null;
  amount: string;
  count: number;
}

export interface AuthorizationCounts {
  reserved: number;
  pendingApproval: number;
  consumed: number;
  denied: number;
  released: number;
  expired: number;
}

export interface FinanceSummary {
  sent: AssetTotal[];
  received: AssetTotal[];
  authorizations: AuthorizationCounts;
}

const assetTotals = async (
  where: Prisma.PaymentWhereInput,
): Promise<AssetTotal[]> => {
  const rows = await prisma.payment.groupBy({
    by: ["network", "assetAddress"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: [{ network: "asc" }, { assetAddress: "asc" }],
  });

  return rows.map((row) => ({
    network: row.network,
    assetAddress: row.assetAddress,
    amount: amountText(row._sum?.amount ?? 0),
    count: (row._count as { _all?: number } | undefined)?._all ?? 0,
  }));
};

const paymentBase = (
  scope: FinanceScope,
  range: DateRange,
): Prisma.PaymentWhereInput => ({
  network: { in: networksOf(scope.environment) },
  createdAt: inRange(range),
});

const COUNT_KEYS: Record<SpendAuthorizationStatus, keyof AuthorizationCounts> =
  {
    RESERVED: "reserved",
    PENDING_APPROVAL: "pendingApproval",
    CONSUMED: "consumed",
    DENIED: "denied",
    RELEASED: "released",
    EXPIRED: "expired",
  };

const authorizationCounts = async (
  scope: FinanceScope,
  range: DateRange,
  now: Date,
): Promise<AuthorizationCounts> => {
  const where: Prisma.SpendAuthorizationWhereInput = {
    organizationId: scope.orgId,
    environment: scope.environment,
    createdAt: inRange(range),
    ...projectIn(scope.projects),
  };

  const [all, lapsed] = await Promise.all([
    prisma.spendAuthorization.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
    prisma.spendAuthorization.groupBy({
      by: ["status"],
      where: {
        ...where,
        status: { in: ["RESERVED", "PENDING_APPROVAL"] },
        expiresAt: { lt: now },
      },
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
  ]);

  const counts: AuthorizationCounts = {
    reserved: 0,
    pendingApproval: 0,
    consumed: 0,
    denied: 0,
    released: 0,
    expired: 0,
  };
  const countOf = (row: { _count?: unknown }): number =>
    (row._count as { _all?: number } | undefined)?._all ?? 0;

  for (const row of all) {
    counts[COUNT_KEYS[row.status]] += countOf(row);
  }
  for (const row of lapsed) {
    const count = countOf(row);
    counts[COUNT_KEYS[row.status]] -= count;
    counts.expired += count;
  }

  return counts;
};

export const financeSummary = async (
  scope: FinanceScope,
  range: DateRange,
  now = new Date(),
): Promise<FinanceSummary> => {
  const addresses = await walletAddressesFor(scope.orgId, scope.environment);
  const base: Prisma.PaymentWhereInput = {
    ...paymentBase(scope, range),
    status: { not: "FAILED" },
  };

  const [sent, received, authorizations] = await Promise.all([
    addresses.length === 0
      ? Promise.resolve([])
      : sentTotals(scope, range, addresses),
    assetTotals({
      ...base,
      organizationId: scope.orgId,
      ...projectInOrNone(scope.projects),
    }),
    authorizationCounts(scope, range, now),
  ]);

  return { sent, received, authorizations };
};

export interface UsageItem {
  key: string | null;
  label: string;
  network: string;
  assetAddress: string | null;
  amount: string;
  count: number;
}

interface UsageRow {
  key: string | null;
  network: string;
  asset_address: string | null;
  amount: Prisma.Decimal | null;
  count: bigint | number;
}

const RECEIVED_KEYS: Record<UsageGroup, () => Prisma.Sql> = {
  project: () => Prisma.sql`p.project_id`,
  agent: () => Prisma.sql`p.agent_id`,
  api_key: () => Prisma.sql`p.api_key_id`,
  listing: () => Prisma.sql`p.listing_id`,
  recipient: () => Prisma.sql`p.payer_address`,
};

const SENT_KEYS: Record<Exclude<UsageGroup, "listing">, () => Prisma.Sql> = {
  project: () => Prisma.sql`a.project_id`,
  agent: () => Prisma.sql`a.agent_id`,
  api_key: () => Prisma.sql`a.api_key_id`,
  recipient: () => Prisma.sql`p.recipient_address`,
};

const paymentWindow = (scope: FinanceScope, range: DateRange): Prisma.Sql =>
  Prisma.sql`p.network::text IN (${Prisma.join(networksOf(scope.environment))})
     AND p.created_at >= ${range.from}
     AND p.created_at <  ${range.to}
     AND p.status <> 'FAILED'`;

const authorizationMatch = (orgId: string): Prisma.Sql =>
  Prisma.sql`a.organization_id = ${orgId}
     AND (a.payment_id = p.id OR a.req_id = p.req_id)`;

const receivedVisible = (scope: FinanceScope): Prisma.Sql =>
  scope.projects === null
    ? Prisma.sql`TRUE`
    : scope.projects.length === 0
      ? Prisma.sql`p.project_id IS NULL`
      : Prisma.sql`(p.project_id IS NULL OR p.project_id IN (${Prisma.join(scope.projects)}))`;

const sentVisible = (scope: FinanceScope): Prisma.Sql =>
  scope.projects === null
    ? Prisma.sql`TRUE`
    : Prisma.sql`NOT EXISTS (
        SELECT 1 FROM spend_authorizations a
         WHERE ${authorizationMatch(scope.orgId)}
           AND ${
             scope.projects.length === 0
               ? Prisma.sql`TRUE`
               : Prisma.sql`a.project_id NOT IN (${Prisma.join(scope.projects)})`
})`;

interface TotalRow {
  network: string;
  asset_address: string | null;
  amount: Prisma.Decimal | null;
  count: bigint | number;
}

const sentTotals = async (
  scope: FinanceScope,
  range: DateRange,
  addresses: string[],
): Promise<AssetTotal[]> => {
  const rows = await prisma.$queryRaw<TotalRow[]>`
    SELECT p.network::text AS network,
           p.asset_address,
           SUM(p.amount) AS amount,
           COUNT(*) AS count
      FROM payments p
     WHERE p.payer_address IN (${Prisma.join(addresses)})
       AND ${paymentWindow(scope, range)}
       AND ${sentVisible(scope)}
     GROUP BY 1, 2
     ORDER BY 1 ASC, 2 ASC
  `;
  return rows.map((row) => ({
    network: row.network,
    assetAddress: row.asset_address,
    amount: amountText(row.amount ?? 0),
    count: Number(row.count),
  }));
};

const labelsFor = async (
  orgId: string,
  groupBy: UsageGroup,
  keys: string[],
): Promise<Map<string, string>> => {
  if (keys.length === 0 || groupBy === "recipient") {
    return new Map();
  }

  const where = { id: { in: keys }, organizationId: orgId };
  const select = { id: true, name: true } as const;
  const rows: { id: string; name: string }[] =
    groupBy === "project"
      ? await prisma.project.findMany({ where, select })
      : groupBy === "agent"
        ? await prisma.agent.findMany({ where, select })
        : groupBy === "api_key"
          ? await prisma.apiKey.findMany({ where, select })
          : await prisma.apiListing.findMany({ where, select });

  return new Map(rows.map((row) => [row.id, row.name]));
};

export const UNATTRIBUTED = "Unattributed";

export const financeUsage = async (
  scope: FinanceScope,
  range: DateRange,
  groupBy: UsageGroup,
  direction: UsageDirection,
): Promise<UsageItem[]> => {
  let rows: UsageRow[];

  if (direction === "received") {
    const key = RECEIVED_KEYS[groupBy]();
    rows = await prisma.$queryRaw<UsageRow[]>`
      SELECT ${key} AS key,
             p.network::text AS network,
             p.asset_address,
             SUM(p.amount) AS amount,
             COUNT(*) AS count
        FROM payments p
       WHERE p.organization_id = ${scope.orgId}
         AND ${paymentWindow(scope, range)}
         AND ${receivedVisible(scope)}
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC, 1 ASC
    `;
  } else {
    const addresses = await walletAddressesFor(scope.orgId, scope.environment);
    if (addresses.length === 0 || groupBy === "listing") {
      return [];
    }
    const key = SENT_KEYS[groupBy]();
    rows = await prisma.$queryRaw<UsageRow[]>`
      SELECT ${key} AS key,
             p.network::text AS network,
             p.asset_address,
             SUM(p.amount) AS amount,
             COUNT(*) AS count
        FROM payments p
        LEFT JOIN LATERAL (
          SELECT a.project_id, a.agent_id, a.api_key_id
            FROM spend_authorizations a
           WHERE ${authorizationMatch(scope.orgId)}
           ORDER BY (a.payment_id IS NOT DISTINCT FROM p.id) DESC,
                    a.created_at DESC
           LIMIT 1
        ) a ON TRUE
       WHERE p.payer_address IN (${Prisma.join(addresses)})
         AND ${paymentWindow(scope, range)}
         AND ${sentVisible(scope)}
       GROUP BY 1, 2, 3
       ORDER BY 4 DESC, 1 ASC
    `;
  }

  const keys = [
    ...new Set(rows.flatMap((row) => (row.key === null ? [] : [row.key]))),
  ];
  const labels = await labelsFor(scope.orgId, groupBy, keys);

  return rows.map((row) => ({
    key: row.key,
    label: row.key === null ? UNATTRIBUTED : (labels.get(row.key) ?? row.key),
    network: row.network,
    assetAddress: row.asset_address,
    amount: amountText(row.amount ?? 0),
    count: Number(row.count),
  }));
};

const AUTHORIZATION_SELECT = {
  id: true,
  status: true,
  deniedReason: true,
  policyId: true,
  approvalRequestId: true,
  expiresAt: true,
  amount: true,
  authorizedAmount: true,
  settledAmount: true,
  network: true,
  assetAddress: true,
  payerAddress: true,
  recipientAddress: true,
  reqId: true,
  projectId: true,
  agentId: true,
  apiKeyId: true,
  createdAt: true,
} satisfies Prisma.SpendAuthorizationSelect;

type RawAuthorization = Prisma.SpendAuthorizationGetPayload<{
  select: typeof AUTHORIZATION_SELECT;
}>;

export type AuthorizationRow = Omit<
  RawAuthorization,
  "amount" | "authorizedAmount" | "settledAmount" | "expiresAt" | "createdAt"
> & {
  amount: string;
  authorizedAmount: string | null;
  settledAmount: string | null;
  expiresAt: string;
  createdAt: string;
};

const toAuthorizationRow = (
  row: RawAuthorization,
  now: Date,
): AuthorizationRow => ({
  ...row,
  status:
    (row.status === "RESERVED" || row.status === "PENDING_APPROVAL") &&
    row.expiresAt < now
      ? "EXPIRED"
      : row.status,
  amount: amountText(row.amount),
  authorizedAmount: optionalAmountText(row.authorizedAmount),
  settledAmount: optionalAmountText(row.settledAmount),
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export interface UnauthorizedPayment {
  id: string;
  reqId: string;
  network: string;
  assetAddress: string | null;
  amount: string;
  payerAddress: string;
  recipientAddress: string;
  status: string;
  createdAt: string;
}

interface UnauthorizedRow {
  id: string;
  req_id: string;
  network: string;
  asset_address: string | null;
  amount: Prisma.Decimal;
  payer_address: string;
  recipient_address: string;
  status: string;
  created_at: Date;
}

export interface Reconciliation {
  matched: number;
  authorizedNotReported: AuthorizationRow[];
  reportedNotAuthorized: UnauthorizedPayment[];
}

export const financeReconciliation = async (
  scope: FinanceScope,
  range: DateRange,
  now = new Date(),
): Promise<Reconciliation> => {
  const addresses = await walletAddressesFor(scope.orgId, scope.environment);

  const authorizedNotReported = prisma.spendAuthorization.findMany({
    where: {
      organizationId: scope.orgId,
      environment: scope.environment,
      createdAt: inRange(range),
      paymentId: null,
      ...projectIn(scope.projects),
      OR: [
        { status: "CONSUMED" },
        { status: "RESERVED", expiresAt: { lt: now } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECONCILIATION_LIMIT,
    select: AUTHORIZATION_SELECT,
  });

  if (addresses.length === 0) {
    return {
      matched: 0,
      authorizedNotReported: (await authorizedNotReported).map((row) =>
        toAuthorizationRow(row, now),
      ),
      reportedNotAuthorized: [],
    };
  }

  const sent = Prisma.sql`p.payer_address IN (${Prisma.join(addresses)})
     AND ${paymentWindow(scope, range)}
     AND ${sentVisible(scope)}`;
  const match = authorizationMatch(scope.orgId);

  const [authorized, counted, unauthorized] = await Promise.all([
    authorizedNotReported,
    prisma.$queryRaw<{ matched: bigint | number }[]>`
      SELECT COUNT(*) AS matched
        FROM payments p
       WHERE ${sent}
         AND EXISTS (SELECT 1 FROM spend_authorizations a WHERE ${match})
    `,
    prisma.$queryRaw<UnauthorizedRow[]>`
      SELECT p.id,
             p.req_id,
             p.network::text AS network,
             p.asset_address,
             p.amount,
             p.payer_address,
             p.recipient_address,
             p.status::text AS status,
             p.created_at
        FROM payments p
       WHERE ${sent}
         AND NOT EXISTS (SELECT 1 FROM spend_authorizations a WHERE ${match})
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ${RECONCILIATION_LIMIT}
    `,
  ]);

  return {
    matched: Number(counted[0]?.matched ?? 0),
    authorizedNotReported: authorized.map((row) =>
      toAuthorizationRow(row, now),
    ),
    reportedNotAuthorized: unauthorized.map((row) => ({
      id: row.id,
      reqId: row.req_id,
      network: row.network,
      assetAddress: row.asset_address,
      amount: amountText(row.amount),
      payerAddress: row.payer_address,
      recipientAddress: row.recipient_address,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    })),
  };
};

interface ExportPaymentRow {
  id: string;
  created_at: Date;
  settled_at: Date | null;
  status: string;
  network: string;
  asset_address: string | null;
  amount: Prisma.Decimal;
  payer_address: string;
  recipient_address: string;
  req_id: string;
  tx_hash: string | null;
  project_id: string | null;
  agent_id: string | null;
  listing_id: string | null;
  api_key_id: string | null;
  description: string | null;
  resource: string | null;
  failure_reason: string | null;
}

export const PAYMENT_EXPORT_HEADER = [
  "id",
  "created_at",
  "settled_at",
  "direction",
  "status",
  "network",
  "asset_address",
  "amount",
  "payer_address",
  "recipient_address",
  "req_id",
  "tx_hash",
  "project_id",
  "agent_id",
  "listing_id",
  "api_key_id",
  "description",
  "resource",
  "failure_reason",
] as const;

export type ExportRow = (string | null)[];

const EXPORT_PAGE = 5_000;

export const exportPayments = async (
  scope: FinanceScope,
  range: DateRange,
  direction: ExportDirection,
  limit: number,
): Promise<{ rows: ExportRow[]; truncated: boolean }> => {
  const addresses =
    direction === "received"
      ? []
      : await walletAddressesFor(scope.orgId, scope.environment);
  const mine = new Set(addresses);

  if (direction === "sent" && addresses.length === 0) {
    return { rows: [], truncated: false };
  }

  const received = Prisma.sql`(p.organization_id = ${scope.orgId} AND ${receivedVisible(scope)})`;
  const sent =
    addresses.length === 0
      ? null
      : Prisma.sql`(p.payer_address IN (${Prisma.join(addresses)}) AND ${sentVisible(scope)})`;
  const which =
    direction === "sent" && sent
      ? sent
      : direction === "received" || !sent
        ? received
        : Prisma.sql`(${sent} OR ${received})`;

  const rows: ExportRow[] = [];
  let cursor: { createdAt: Date; id: string } | null = null;

  while (rows.length <= limit) {
    const take = Math.min(EXPORT_PAGE, limit + 1 - rows.length);
    const page: ExportPaymentRow[] = await prisma.$queryRaw<ExportPaymentRow[]>`
      SELECT p.id, p.created_at, p.settled_at, p.status::text AS status,
             p.network::text AS network, p.asset_address, p.amount,
             p.payer_address, p.recipient_address, p.req_id, p.tx_hash,
             p.project_id, p.agent_id, p.listing_id, p.api_key_id,
             p.description, p.resource, p.failure_reason
        FROM payments p
       WHERE p.network::text IN (${Prisma.join(networksOf(scope.environment))})
         AND p.created_at >= ${range.from}
         AND p.created_at <  ${range.to}
         AND ${which}
         ${cursor ? Prisma.sql`AND (p.created_at, p.id) > (${cursor.createdAt}, ${cursor.id})` : Prisma.empty}
       ORDER BY p.created_at ASC, p.id ASC
       LIMIT ${take}
    `;

    for (const row of page) {
      rows.push([
        row.id,
        row.created_at.toISOString(),
        row.settled_at?.toISOString() ?? null,
        mine.has(row.payer_address) ? "sent" : "received",
        row.status,
        row.network,
        row.asset_address,
        amountText(row.amount),
        row.payer_address,
        row.recipient_address,
        row.req_id,
        row.tx_hash,
        row.project_id,
        row.agent_id,
        row.listing_id,
        row.api_key_id,
        row.description,
        row.resource,
        row.failure_reason,
      ]);
    }

    const last = page.at(-1);
    if (page.length < EXPORT_PAGE || !last) {
      break;
    }
    cursor = { createdAt: last.created_at, id: last.id };
  }

  const truncated = rows.length > limit;
  return { rows: truncated ? rows.slice(0, limit) : rows, truncated };
};
