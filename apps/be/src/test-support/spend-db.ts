import { vi } from "vitest";
import { memoryTable } from "./memory-table";
import { tenancyMocks } from "./tenancy";

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
  const apiKey = { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() };
  const user = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const organization = { findUnique: vi.fn() };
  const project = tenancy.project;
  const $executeRaw = vi.fn(async () => 0);

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
    $queryRaw: vi.fn(async () => []),
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
