import { fromUnits, toUnits } from "@utils/units";
import { vi } from "vitest";
import { memoryTable } from "./memory-table";
import { tenancyMocks, visibilityRows } from "./tenancy";

type Row = Record<string, unknown>;

export const createSpendDb = () => {
  const approvalRequest = memoryTable<Row>(() => ({
    status: "PENDING",
    projectId: null,
    requestedById: null,
    requestedByApiKeyId: null,
    decidedAt: null,
    executedAt: null,
  }));

  const spendAuthorization = memoryTable<Row>(
    () => ({
      apiKeyId: null,
      agentId: null,
      assetAddress: null,
      reqId: null,
      deniedReason: null,
      policyId: null,
      approvalRequestId: null,
      paymentId: null,
      consumedAt: null,
    }),
    {
      decorate: (row) => {
        const approval = approvalRequest.rows.find(
          (entry) => entry.id === row.approvalRequestId,
        );
        return {
          ...row,
          approvalRequest: approval
            ? { status: approval.status, expiresAt: approval.expiresAt }
            : null,
        };
      },
      order: (a, b) =>
        (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
    },
  );

  const spendingPolicy = memoryTable<Row>(
    () => ({
      projectId: null,
      agentId: null,
      apiKeyId: null,
      mode: "ENFORCE",
      network: null,
      assetAddress: null,
      perPaymentLimit: null,
      dailyLimit: null,
      monthlyLimit: null,
      approvalThreshold: null,
      approvalsRequired: 1,
      allowedRecipients: [],
      alertThresholds: [80, 100],
      frozenAt: null,
      enabled: true,
      createdById: null,
      deletedAt: null,
    }),
    { decorate: (row) => ({ ...row, createdBy: null }) },
  );

  const financialAlert = memoryTable<Row>(
    () => ({
      projectId: null,
      policyId: null,
      dedupeKey: null,
      acknowledgedAt: null,
      acknowledgedById: null,
    }),
    { unique: [["organizationId", "dedupeKey"]] },
  );

  const wallet = memoryTable<Row>(() => ({
    status: "ACTIVE",
    role: "BOTH",
  }));
  const agent = memoryTable<Row>(() => ({
    deletedAt: null,
    payerWallet: null,
  }));
  const payment = memoryTable<Row>(() => ({
    assetAddress: null,
    status: "SETTLED",
  }));
  const governanceSettings = memoryTable<Row>(() => ({
    approvalsRequired: 0,
    governedActions: [],
    approvalTtlHours: 72,
    financeRecipientIds: [],
  }));

  const tenancy = tenancyMocks();
  const membership = { ...tenancy.membership, findMany: vi.fn() };
  const apiKey = {
    findUnique: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const organization = { findUnique: vi.fn() };
  const project = tenancy.project;
  const $executeRaw = vi.fn(async () => 0);

  const unmatchedPayments = (values: unknown[]) => {
    const [dayStart, reqId, list, network, assetAddress, monthStart, orgId] =
      values as [
        Date,
        string | null,
        { values: string[] },
        string,
        string | null,
        Date,
        string,
      ];
    const addresses: unknown[] = list.values;
    const now = values[10] as Date;
    const covers = (row: Row, reqId: unknown, amount: bigint) =>
      row.organizationId === orgId &&
      row.reqId === reqId &&
      row.network === network &&
      (row.assetAddress ?? null) === assetAddress &&
      (row.createdAt as Date) >= monthStart &&
      toUnits(row.amount as string) >= amount &&
      (row.status === "CONSUMED" ||
        ((row.status === "RESERVED" || row.status === "PENDING_APPROVAL") &&
          (row.expiresAt as Date) > now));
    const first = new Map<unknown, Row>();
    for (const row of payment.rows
      .filter(
        (entry) =>
          addresses.includes(entry.payerAddress) &&
          entry.network === network &&
          (entry.assetAddress ?? null) === assetAddress &&
          entry.status !== "FAILED" &&
          (entry.createdAt as Date) >= monthStart &&
          !spendAuthorization.rows.some((authorization) =>
            covers(authorization, entry.reqId, toUnits(entry.amount as string)),
          ),
      )
      .sort(
        (a, b) =>
          (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
      )) {
      if (!first.has(row.reqId)) {
        first.set(row.reqId, row);
      }
    }
    const totals = new Map<string, bigint>();
    for (const row of first.values()) {
      const key = `${row.payerAddress}|${(row.createdAt as Date) >= dayStart}|${row.reqId === reqId ? row.reqId : ""}`;
      totals.set(key, (totals.get(key) ?? 0n) + toUnits(row.amount as string));
    }
    return [...totals].map(([key, total]) => {
      const [payerAddress, today, matched] = key.split("|");
      return {
        req_id: matched || null,
        payer_address: payerAddress,
        today: today === "true",
        amount: fromUnits(total),
      };
    });
  };

  const $queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.join("?").includes("FROM payments p")
        ? unmatchedPayments(values)
        : ((await visibilityRows(tenancy, strings, values)) ?? []),
  );

  const prisma: Record<string, unknown> = {
    approvalRequest,
    spendAuthorization,
    spendingPolicy,
    financialAlert,
    wallet,
    agent,
    payment,
    governanceSettings,
    membership,
    auditLog: tenancy.auditLog,
    project,
    apiKey,
    user,
    organization,
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    $executeRaw,
    $queryRaw,
  };
  prisma.$transaction = vi.fn(async (work: unknown) =>
    typeof work === "function"
      ? (work as (tx: unknown) => unknown)(prisma)
      : Promise.all(work as Promise<unknown>[]),
  );

  const tables = [
    approvalRequest,
    spendAuthorization,
    spendingPolicy,
    financialAlert,
    wallet,
    agent,
    payment,
    governanceSettings,
  ];

  return {
    prisma,
    approvalRequest,
    spendAuthorization,
    spendingPolicy,
    financialAlert,
    wallet,
    agent,
    payment,
    governanceSettings,
    membership,
    auditLog: tenancy.auditLog,
    project,
    apiKey,
    user,
    organization,
    $executeRaw,
    tenancy: { membership, auditLog: tenancy.auditLog, project },
    reset: () => {
      for (const table of tables) {
        table.rows.length = 0;
      }
      for (const group of [apiKey, user, organization]) {
        for (const fn of Object.values(group)) {
          fn.mockReset();
        }
      }
      membership.findMany.mockReset();
      $executeRaw.mockClear();
    },
  };
};

export type SpendDb = ReturnType<typeof createSpendDb>;
