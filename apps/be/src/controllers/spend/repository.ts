import {
  type EnvironmentKind,
  type PaymentNetwork,
  Prisma,
  prisma,
  type SpendAuthorizationStatus,
} from "@4mica/db";
import type { ApiKeyContext } from "@auth/api-key";
import { optionalAmountText } from "@utils/amount";
import { type ProjectAccess, projectIn } from "@utils/scope";
import { toUnits } from "@utils/units";
import type {
  EnginePolicy,
  UsageAuthorization,
  UsageData,
  UsagePayment,
} from "./engine";
import { windowsAt } from "./engine";

type Db = Prisma.TransactionClient;

export const ENGINE_POLICY_SELECT = {
  id: true,
  name: true,
  scope: true,
  projectId: true,
  agentId: true,
  apiKeyId: true,
  mode: true,
  network: true,
  assetAddress: true,
  perPaymentLimit: true,
  dailyLimit: true,
  monthlyLimit: true,
  approvalThreshold: true,
  approvalsRequired: true,
  allowedRecipients: true,
  alertThresholds: true,
  frozenAt: true,
} satisfies Prisma.SpendingPolicySelect;

type EnginePolicyRow = Prisma.SpendingPolicyGetPayload<{
  select: typeof ENGINE_POLICY_SELECT;
}>;

const unitsOrNull = (value: Prisma.Decimal | null): bigint | null => {
  const text = optionalAmountText(value);
  return text === null ? null : toUnits(text);
};

export const toEnginePolicy = (row: EnginePolicyRow): EnginePolicy => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  projectId: row.projectId,
  agentId: row.agentId,
  apiKeyId: row.apiKeyId,
  mode: row.mode,
  network: row.network,
  assetAddress: row.assetAddress,
  perPaymentLimit: unitsOrNull(row.perPaymentLimit),
  dailyLimit: unitsOrNull(row.dailyLimit),
  monthlyLimit: unitsOrNull(row.monthlyLimit),
  approvalThreshold: unitsOrNull(row.approvalThreshold),
  approvalsRequired: row.approvalsRequired,
  allowedRecipients: row.allowedRecipients,
  alertThresholds: row.alertThresholds,
  frozen: row.frozenAt !== null,
});

const SCOPE_ORDER = ["ORGANIZATION", "PROJECT", "AGENT", "API_KEY"];

export const lockSpend = (
  tx: Db,
  orgId: string,
  network: PaymentNetwork,
  assetAddress: string | null,
) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spend:${orgId}:${network}:${assetAddress ?? "native"}`}, 0))`;

export const loadPolicies = async (
  db: Pick<Db, "spendingPolicy">,
  orgId: string,
  network: PaymentNetwork,
  assetAddress: string | null,
): Promise<EnginePolicy[]> => {
  const rows = await db.spendingPolicy.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      enabled: true,
      OR: [{ network: null }, { network, assetAddress }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: ENGINE_POLICY_SELECT,
  });
  return rows
    .map(toEnginePolicy)
    .sort(
      (a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope),
    );
};

const USAGE_STATUSES: SpendAuthorizationStatus[] = [
  "CONSUMED",
  "RESERVED",
  "PENDING_APPROVAL",
];

const COUNTED_FOREVER = new Date(8_640_000_000_000_000);

interface UnmatchedPaymentRow {
  req_id: string | null;
  payer_address: string;
  today: boolean;
  amount: Prisma.Decimal;
}

const groupKey = (row: {
  projectId: string;
  agentId: string | null;
  apiKeyId: string | null;
  status: SpendAuthorizationStatus;
}) => [row.projectId, row.agentId, row.apiKeyId, row.status].join("|");

export const loadUsage = async (
  db: Pick<Db, "spendAuthorization" | "wallet" | "agent" | "$queryRaw">,
  orgId: string,
  network: PaymentNetwork,
  assetAddress: string | null,
  agentIds: string[],
  now: Date,
  options: { excludeId?: string; reqId?: string | null } = {},
): Promise<UsageData> => {
  const { excludeId, reqId = null } = options;
  const { dayStart, monthStart } = windowsAt(now);
  const counted = (since: Date) =>
    db.spendAuthorization.groupBy({
      by: ["projectId", "agentId", "apiKeyId", "status"],
      where: {
        organizationId: orgId,
        network,
        assetAddress,
        createdAt: { gte: since },
        OR: [
          { status: "CONSUMED" },
          {
            status: { in: ["RESERVED", "PENDING_APPROVAL"] },
            expiresAt: { gt: now },
          },
        ],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      _sum: { amount: true },
      orderBy: [{ projectId: "asc" }, { agentId: "asc" }, { apiKeyId: "asc" }],
    });

  const unmatchedPayments = (addresses: string[]) =>
    db.$queryRaw<UnmatchedPaymentRow[]>`
      SELECT u.payer_address,
             u.created_at >= ${dayStart} AS today,
             SUM(u.amount) AS amount,
             CASE WHEN u.req_id = ${reqId}::varchar THEN u.req_id END AS req_id
        FROM (
          SELECT DISTINCT ON (p.req_id) p.req_id, p.payer_address, p.amount, p.created_at
            FROM payments p
           WHERE p.payer_address IN (${Prisma.join(addresses)})
             AND p.network = ${network}::"PaymentNetwork"
             AND p.asset_address IS NOT DISTINCT FROM ${assetAddress}::varchar
             AND p.status <> 'FAILED'
             AND p.created_at >= ${monthStart}
             AND NOT EXISTS (
                   SELECT 1 FROM spend_authorizations a
                    WHERE a.organization_id = ${orgId}
                      AND a.req_id = p.req_id
                      AND a.network = ${network}::"PaymentNetwork"
                      AND a.asset_address IS NOT DISTINCT FROM ${assetAddress}::varchar
                      AND a.created_at >= ${monthStart}
                      AND a.amount >= p.amount
                      AND (a.status = 'CONSUMED'
                           OR (a.status IN ('RESERVED', 'PENDING_APPROVAL')
                               AND a.expires_at > ${now})))
           ORDER BY p.req_id, p.created_at, p.id
        ) u
       GROUP BY 1, 2, 4
    `;

  const [month, today, wallets, agents] = await Promise.all([
    counted(monthStart),
    counted(dayStart),
    db.wallet.findMany({
      where: { organizationId: orgId, network },
      select: { address: true },
    }),
    agentIds.length > 0
      ? db.agent.findMany({
          where: { id: { in: agentIds }, organizationId: orgId },
          select: {
            id: true,
            payerWallet: { select: { address: true, network: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const addresses = [...new Set(wallets.map((wallet) => wallet.address))];
  const unmatched =
    addresses.length > 0 ? await unmatchedPayments(addresses) : [];

  const todays = new Map(
    today.map((row) => [groupKey(row), toUnits(row._sum.amount ?? 0)]),
  );
  const authorizations = month.flatMap((row): UsageAuthorization[] => {
    const base = {
      reqId: null,
      status: row.status,
      expiresAt: COUNTED_FOREVER,
      projectId: row.projectId,
      agentId: row.agentId,
      apiKeyId: row.apiKeyId,
    };
    const key = groupKey(row);
    const day = todays.get(key) ?? 0n;
    const earlier = toUnits(row._sum.amount ?? 0) - day;
    return [
      { ...base, id: `today:${key}`, amount: day, createdAt: dayStart },
      { ...base, id: `month:${key}`, amount: earlier, createdAt: monthStart },
    ].filter((entry) => entry.amount > 0n);
  });

  return {
    authorizations,
    payments: unmatched.map(
      (row, index): UsagePayment => ({
        reqId: row.req_id ?? `unmatched:${index}`,
        amount: toUnits(row.amount),
        createdAt: row.today ? dayStart : monthStart,
        payerAddress: row.payer_address,
      }),
    ),
    agentWallets: Object.fromEntries(
      agents.map((agent) => [
        agent.id,
        agent.payerWallet && agent.payerWallet.network === network
          ? [agent.payerWallet.address]
          : [],
      ]),
    ),
  };
};

export const findPayerWallet = (
  orgId: string,
  address: string,
  network: PaymentNetwork,
) =>
  prisma.wallet.findFirst({
    where: {
      organizationId: orgId,
      address,
      network,
      status: "ACTIVE",
      role: { in: ["PAYER", "BOTH"] },
    },
    select: { id: true },
  });

export const findAgentInScope = (
  scope: { orgId: string; projectId: string; environmentId: string },
  agentId: string,
) =>
  prisma.agent.findFirst({
    where: {
      id: agentId,
      organizationId: scope.orgId,
      projectId: scope.projectId,
      environmentId: scope.environmentId,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });

export const findAgentName = (orgId: string, agentId: string) =>
  prisma.agent.findFirst({
    where: { id: agentId, organizationId: orgId },
    select: { name: true },
  });

export const approvalTtlHours = async (
  db: Pick<Db, "governanceSettings">,
  orgId: string,
): Promise<number> =>
  (
    await db.governanceSettings.findUnique({
      where: { organizationId: orgId },
      select: { approvalTtlHours: true },
    })
  )?.approvalTtlHours ?? 72;

export const AUTHORIZATION_SELECT = {
  id: true,
  organizationId: true,
  projectId: true,
  environment: true,
  apiKeyId: true,
  issuedByKeyId: true,
  issuedByKeyPrefix: true,
  serviceAccountId: true,
  agentId: true,
  network: true,
  assetAddress: true,
  payerAddress: true,
  recipientAddress: true,
  amount: true,
  authorizedAmount: true,
  settledAmount: true,
  reqId: true,
  status: true,
  deniedReason: true,
  policyId: true,
  approvalRequestId: true,
  paymentId: true,
  expiresAt: true,
  consumedAt: true,
  createdAt: true,
  approvalRequest: { select: { status: true, expiresAt: true } },
} satisfies Prisma.SpendAuthorizationSelect;

export type AuthorizationRow = Prisma.SpendAuthorizationGetPayload<{
  select: typeof AUTHORIZATION_SELECT;
}>;

export interface AuthorizationOwner {
  orgId: string;
  projectId: string;
  environment: EnvironmentKind;
  keyId: string;
  serviceAccountId: string | null;
  agentId: string | null;
}

export const ownedBy = (
  owner: AuthorizationOwner,
): Prisma.SpendAuthorizationWhereInput => ({
  organizationId: owner.orgId,
  projectId: owner.projectId,
  environment: owner.environment,
  ...(owner.serviceAccountId
    ? { serviceAccountId: owner.serviceAccountId }
    : { issuedByKeyId: owner.keyId }),
  ...(owner.agentId ? { agentId: owner.agentId } : {}),
});

export const authorizationOwner = (key: ApiKeyContext): AuthorizationOwner => ({
  orgId: key.orgId,
  projectId: key.projectId,
  environment: key.environment,
  keyId: key.id,
  serviceAccountId: key.serviceAccountId,
  agentId: key.agentId,
});

export const findAuthorization = (
  db: Pick<Db, "spendAuthorization">,
  id: string,
  scope: Prisma.SpendAuthorizationWhereInput,
) =>
  db.spendAuthorization.findFirst({
    where: { ...scope, id },
    select: AUTHORIZATION_SELECT,
  });

export interface PaymentIdentity {
  orgId: string;
  network: PaymentNetwork;
  assetAddress: string | null;
}

export const LIVE_REQ_ID_INDEX = "spend_authorizations_live_req_id_key";

export const reqIdInUse = async (
  db: Pick<Db, "spendAuthorization">,
  identity: PaymentIdentity,
  reqId: string,
  excludeId?: string,
): Promise<boolean> =>
  (await db.spendAuthorization.findFirst({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      organizationId: identity.orgId,
      network: identity.network,
      assetAddress: identity.assetAddress,
      reqId,
      reqIdConflict: null,
      status: { in: USAGE_STATUSES },
    },
    select: { id: true },
  })) !== null;

export const isReqIdConflict = (error: unknown): boolean => {
  const failure = error as { code?: unknown; meta?: unknown } | null;
  return (
    failure?.code === "P2002" &&
    JSON.stringify(failure.meta ?? {}).includes(LIVE_REQ_ID_INDEX)
  );
};

export const expireReservation = (
  db: Pick<Db, "spendAuthorization">,
  id: string,
  now: Date,
  scope: Prisma.SpendAuthorizationWhereInput,
) =>
  db.spendAuthorization.updateMany({
    where: { ...scope, id, status: "RESERVED", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

export const transitionAuthorization = (
  db: Pick<Db, "spendAuthorization">,
  id: string,
  from: SpendAuthorizationStatus[],
  data: Prisma.SpendAuthorizationUncheckedUpdateManyInput,
  scope: Prisma.SpendAuthorizationWhereInput,
) =>
  db.spendAuthorization.updateMany({
    where: { ...scope, id, status: { in: from } },
    data,
  });

export const cancelPendingApproval = (
  db: Pick<Db, "approvalRequest">,
  id: string,
) =>
  db.approvalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });

export const expirePendingApproval = (
  db: Pick<Db, "approvalRequest">,
  id: string,
  now: Date,
) =>
  db.approvalRequest.updateMany({
    where: { id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

export const findReportedPayment = (
  db: Pick<Db, "payment">,
  payerAddress: string,
  reqId: string,
) =>
  db.payment.findFirst({
    where: { payerAddress, reqId },
    select: { id: true },
  });

export interface ListAuthorizationsFilter {
  environment: "SANDBOX" | "PRODUCTION";
  projects: ProjectAccess;
  status?: SpendAuthorizationStatus;
  projectId?: string;
  agentId?: string;
  apiKeyId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

export const listAuthorizations = async (
  orgId: string,
  filter: ListAuthorizationsFilter,
) => {
  const rows = await prisma.spendAuthorization.findMany({
    where: {
      organizationId: orgId,
      environment: filter.environment,
      ...(filter.status ? { status: filter.status } : {}),
      AND: [
        projectIn(filter.projects),
        filter.projectId ? { projectId: filter.projectId } : {},
      ],
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.apiKeyId ? { issuedByKeyId: filter.apiKeyId } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lt: new Date(filter.to) } : {}),
            },
          }
        : {}),
      ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: filter.limit + 1,
    select: AUTHORIZATION_SELECT,
  });
  const items = rows.slice(0, filter.limit);
  return {
    items,
    nextCursor: rows.length > filter.limit ? (items.at(-1)?.id ?? null) : null,
  };
};

export const ownersOfPayerWallet = async (
  address: string,
  network: PaymentNetwork,
): Promise<string[]> => {
  const rows = await prisma.wallet.findMany({
    where: { address, network, status: "ACTIVE" },
    select: { organizationId: true },
  });
  return [...new Set(rows.map((row) => row.organizationId))];
};

export const hasEnforcingPolicy = async (
  db: Pick<Db, "spendingPolicy">,
  orgId: string,
): Promise<boolean> =>
  (await db.spendingPolicy.findFirst({
    where: {
      organizationId: orgId,
      mode: "ENFORCE",
      enabled: true,
      deletedAt: null,
    },
    select: { id: true },
  })) !== null;

export const runInTransaction = <T>(work: (tx: Db) => Promise<T>) =>
  prisma.$transaction(work);
