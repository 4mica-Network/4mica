import { clearUserCache } from "@auth/user-store";
import { spendRoutes } from "@routes/spend";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { initApp } from "@/server";
import type { SpendDb } from "@/test-support/spend-db";
import {
  actAs,
  ORG_ID,
  OTHER_ORG_ID,
  OTHER_PROJECT_ID,
  PROJECT_ID,
  SANDBOX_ENV_ID,
} from "@/test-support/tenancy";
import { onApprovalResolved } from "./approval-hook";
import { reconcileReportedPayment } from "./decide";

const h = vi.hoisted(() => {
  process.env.RATE_LIMIT_ENABLED = "false";
  return {
    db: null as unknown as SpendDb,
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    sendFinancialAlert: vi.fn(),
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: h.authenticateRequest,
    users: { getUser: h.getUser },
  })),
}));

vi.mock("@services/email", () => ({
  getEmailClient: () => ({ sendFinancialAlert: h.sendFinancialAlert }),
  resetEmailClient: vi.fn(),
}));

vi.mock("@4mica/db", async () => {
  const { createSpendDb } = await import("@/test-support/spend-db");
  h.db = createSpendDb();
  return {
    prisma: h.db.prisma,
    Prisma: {
      join: (values: unknown[]) => ({ values }),
      sql: (strings: TemplateStringsArray) => ({ strings }),
    },
    disconnect: vi.fn(async () => {}),
  };
});

const NOW = new Date("2026-11-27T12:00:00.000Z");
const USER_ID = "019fce62-0000-7000-8000-000000000000";
const AGENT_ID = "019fce62-0000-7000-8000-0000000000c1";
const OTHER_AGENT_ID = "019fce62-0000-7000-8000-0000000000c2";
const KEY_ID = "019fce62-0000-7000-8000-0000000000f1";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PAYER = "0x1111111111111111111111111111111111111111";
const AGENT_PAYER = "0x2222222222222222222222222222222222222222";
const RECIPIENT = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const KEY_AUTH = { authorization: "Bearer 4mica_sk_spendspendspend" };
const AUTH = { authorization: "Bearer good" };

const storedKey = (over: Record<string, unknown> = {}) => ({
  id: KEY_ID,
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  environmentId: SANDBOX_ENV_ID,
  environment: { kind: "SANDBOX" },
  project: { deletedAt: null, archivedAt: null },
  serviceAccountId: null,
  serviceAccount: null,
  scopes: ["SPEND_AUTHORIZE"],
  listingId: null,
  agentId: null,
  revokedAt: null,
  expiresAt: null,
  organization: { deletedAt: null },
  listing: null,
  agent: null,
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  amount: "10",
  payerAddress: PAYER,
  recipientAddress: RECIPIENT,
  ...over,
});

const orgPolicy = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG_ID,
  name: "Org budget",
  scope: "ORGANIZATION",
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  ...over,
});

const authRow = (over: Record<string, unknown> = {}) => ({
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  environment: "SANDBOX",
  apiKeyId: KEY_ID,
  agentId: null,
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  payerAddress: PAYER,
  recipientAddress: RECIPIENT,
  amount: "10",
  status: "RESERVED",
  expiresAt: new Date(NOW.getTime() + 600_000),
  serviceAccountId: null,
  ...over,
  issuedByKeyId: over.issuedByKeyId ?? over.apiKeyId ?? KEY_ID,
});

let app: Awaited<ReturnType<typeof initApp>>;

const post = (url: string, payload: unknown = {}) =>
  app.inject({
    method: "POST",
    url,
    headers: KEY_AUTH,
    payload: payload as object,
  });
const get = (url: string, headers: Record<string, string> = KEY_AUTH) =>
  app.inject({ method: "GET", url, headers });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  app = await initApp([{ plugin: spendRoutes }]);
});

afterAll(async () => {
  await app.close();
  vi.useRealTimers();
});

beforeEach(() => {
  const { db } = h;
  db.reset();
  vi.setSystemTime(NOW);
  clearUserCache();
  actAs(db.tenancy);
  h.authenticateRequest.mockReset();
  h.authenticateRequest.mockResolvedValue({
    isAuthenticated: true,
    status: "signed-in",
    reason: null,
    toAuth: () => ({
      tokenType: "session_token",
      userId: "user_123",
      sessionId: "sess_123",
      sessionClaims: { sub: "user_123", sid: "sess_123" },
    }),
  });
  db.user.upsert.mockResolvedValue({
    id: USER_ID,
    clerkUserId: "user_123",
    email: "ada@example.com",
    name: "Ada",
    avatarUrl: null,
    banned: false,
    locked: false,
    deletedAt: null,
  });
  db.apiKey.findUnique.mockResolvedValue(storedKey());
  db.apiKey.update.mockResolvedValue({});
  db.organization.findUnique.mockResolvedValue({
    name: "Northwind",
    handle: "nw",
  });
  db.membership.findMany.mockResolvedValue([
    {
      role: "FINANCE",
      customRole: null,
      user: {
        name: "Fin",
        email: "fin@example.com",
        emailVerified: true,
        deletedAt: null,
      },
    },
  ]);
  h.sendFinancialAlert.mockReset();
  h.sendFinancialAlert.mockResolvedValue({ id: "msg" });
  db.wallet.seed(
    {
      organizationId: ORG_ID,
      address: PAYER,
      network: "BASE_SEPOLIA",
      role: "PAYER",
    },
    { organizationId: ORG_ID, address: AGENT_PAYER, network: "BASE_SEPOLIA" },
  );
  db.agent.seed({
    id: AGENT_ID,
    name: "Scout",
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    environmentId: SANDBOX_ENV_ID,
    payerWallet: { address: AGENT_PAYER, network: "BASE_SEPOLIA" },
  });
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("POST /v1/spend/authorize", () => {
  it("needs the SPEND_AUTHORIZE scope", async () => {
    h.db.apiKey.findUnique.mockResolvedValue(
      storedKey({ scopes: ["PAYMENTS_WRITE"] }),
    );
    const res = await post("/v1/spend/authorize", body());
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("insufficient_scope");
    expect(h.db.spendAuthorization.rows).toEqual([]);
  });

  it("refuses a network outside the key's environment", async () => {
    const res = await post(
      "/v1/spend/authorize",
      body({ network: "BASE", assetAddress: null }),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("environment_mismatch");
    expect(h.db.spendAuthorization.rows).toEqual([]);
  });

  it("refuses a payer that is not an active payer wallet of the org on that network", async () => {
    h.db.wallet.seed(
      {
        organizationId: ORG_ID,
        address: "0x3333333333333333333333333333333333333333",
        network: "BASE_SEPOLIA",
        role: "RECIPIENT",
      },
      {
        organizationId: ORG_ID,
        address: "0x4444444444444444444444444444444444444444",
        network: "BASE_SEPOLIA",
        status: "PAUSED",
      },
      {
        organizationId: OTHER_ORG_ID,
        address: "0x5555555555555555555555555555555555555555",
        network: "BASE_SEPOLIA",
      },
      {
        organizationId: ORG_ID,
        address: "0x6666666666666666666666666666666666666666",
        network: "ETHEREUM_SEPOLIA",
      },
    );
    for (const payerAddress of [
      "0x3333333333333333333333333333333333333333",
      "0x4444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555",
      "0x6666666666666666666666666666666666666666",
    ]) {
      const res = await post("/v1/spend/authorize", body({ payerAddress }));
      expect(res.statusCode, payerAddress).toBe(403);
      expect(res.json().error).toBe("payer_not_owned");
    }
    expect(h.db.spendAuthorization.rows).toEqual([]);
  });

  it("404s an agent outside the key's project and environment", async () => {
    h.db.agent.seed({
      id: OTHER_AGENT_ID,
      name: "Elsewhere",
      organizationId: ORG_ID,
      projectId: OTHER_PROJECT_ID,
      environmentId: SANDBOX_ENV_ID,
    });
    const res = await post(
      "/v1/spend/authorize",
      body({ agentId: OTHER_AGENT_ID }),
    );
    expect(res.statusCode).toBe(404);
    expect(h.db.spendAuthorization.rows).toEqual([]);
  });

  it("takes the agent from an agent key and rejects a different body agent", async () => {
    h.db.apiKey.findUnique.mockResolvedValue(storedKey({ agentId: AGENT_ID }));
    const mismatch = await post(
      "/v1/spend/authorize",
      body({ agentId: OTHER_AGENT_ID }),
    );
    expect(mismatch.statusCode).toBe(400);

    const res = await post("/v1/spend/authorize", body());
    expect(res.statusCode).toBe(200);
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      agentId: AGENT_ID,
    });
  });

  it("reserves for ten minutes under the advisory lock when nothing objects", async () => {
    const res = await post("/v1/spend/authorize", body({ reqId: "0xABC" }));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: expect.any(String),
      status: "RESERVED",
      deniedReason: null,
      policyId: null,
      approvalRequestId: null,
      expiresAt: "2026-11-27T12:10:00.000Z",
      amount: "10",
      authorizedAmount: "10",
      settledAmount: null,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
    });
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      reqId: "0xabc",
      apiKeyId: KEY_ID,
      projectId: PROJECT_ID,
      environment: "SANDBOX",
    });
    expect(h.db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("refuses a reqId another live authorization holds", async () => {
    h.db.spendAuthorization.seed(authRow({ reqId: "0xabc" }));
    const res = await post("/v1/spend/authorize", body({ reqId: "0xabc" }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("req_id_in_use");
  });

  it("denies a frozen policy, audits it, and alerts once per policy per hour", async () => {
    const [policy] = h.db.spendingPolicy.seed(
      orgPolicy({ network: null, assetAddress: null, frozenAt: NOW }),
    );

    const first = await post("/v1/spend/authorize", body());
    expect(first.json()).toMatchObject({
      status: "DENIED",
      deniedReason: "frozen",
      policyId: policy?.id,
    });
    const second = await post("/v1/spend/authorize", body());
    expect(second.json().status).toBe("DENIED");
    await flush();

    expect(h.db.spendAuthorization.rows).toHaveLength(2);
    expect(
      h.db.auditLog.create.mock.calls.filter(
        ([arg]) =>
          (arg as { data: { action: string } }).data.action === "spend.denied",
      ),
    ).toHaveLength(2);
    expect(h.db.financialAlert.rows).toHaveLength(1);
    expect(h.db.financialAlert.rows[0]).toMatchObject({
      kind: "POLICY_DENIAL",
      dedupeKey: `denial:${policy?.id}:2026-11-27T12`,
    });
    expect(h.sendFinancialAlert).toHaveBeenCalledTimes(1);
    expect(h.sendFinancialAlert.mock.calls[0]?.[0]).toMatchObject({
      to: "fin@example.com",
      workspaceName: "Northwind",
    });
  });

  it("denies each limit in turn", async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, string][] =
      [
        [
          { allowedRecipients: ["0x9999999999999999999999999999999999999999"] },
          {},
          "recipient_not_allowed",
        ],
        [{ perPaymentLimit: "5" }, {}, "per_payment_limit"],
        [
          { dailyLimit: "15" },
          { createdAt: new Date("2026-11-27T01:00:00Z") },
          "daily_limit",
        ],
        [
          { monthlyLimit: "15" },
          { createdAt: new Date("2026-11-02T01:00:00Z") },
          "monthly_limit",
        ],
      ];
    for (const [limits, earlier, reason] of cases) {
      h.db.spendingPolicy.rows.length = 0;
      h.db.spendAuthorization.rows.length = 0;
      h.db.spendingPolicy.seed(orgPolicy(limits));
      h.db.spendAuthorization.seed(authRow({ status: "CONSUMED", ...earlier }));
      const res = await post("/v1/spend/authorize", body());
      expect(res.json(), reason).toMatchObject({
        status: "DENIED",
        deniedReason: reason,
      });
    }
  });

  it("does not count a reservation that expired, but counts a live pending approval", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ dailyLimit: "25" }));
    h.db.spendAuthorization.seed(
      authRow({ amount: "100", expiresAt: new Date(NOW.getTime() - 1) }),
    );
    expect((await post("/v1/spend/authorize", body())).json().status).toBe(
      "RESERVED",
    );

    h.db.spendAuthorization.seed(
      authRow({
        status: "PENDING_APPROVAL",
        amount: "10",
        expiresAt: new Date(NOW.getTime() + 3_600_000),
      }),
    );
    expect((await post("/v1/spend/authorize", body())).json()).toMatchObject({
      status: "DENIED",
      deniedReason: "daily_limit",
    });
  });

  it("counts reported payments that match no authorization toward an org limit", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ dailyLimit: "100" }));
    h.db.payment.seed({
      reqId: "0xrogue",
      payerAddress: AGENT_PAYER,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "95",
    });
    expect(
      (await post("/v1/spend/authorize", body())).json().deniedReason,
    ).toBe("daily_limit");
  });

  it("sums usage in the database instead of loading the month's rows", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ dailyLimit: "100" }));
    h.db.spendAuthorization.seed(authRow({ status: "CONSUMED", amount: "50" }));
    const rows = [
      vi.spyOn(h.db.spendAuthorization, "findMany"),
      vi.spyOn(h.db.payment, "findMany"),
    ];
    const groupBy = vi.spyOn(h.db.spendAuthorization, "groupBy");

    expect((await post("/v1/spend/authorize", body())).json().status).toBe(
      "RESERVED",
    );
    for (const spy of rows) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(groupBy.mock.calls[0]?.[0]).toMatchObject({
      by: ["projectId", "agentId", "apiKeyId", "status"],
      _sum: { amount: true },
    });
    groupBy.mockRestore();
  });

  it("lets the new authorization cover an earlier unmatched payment with its reqId when checking budgets", async () => {
    h.db.spendingPolicy.seed(
      orgPolicy({ dailyLimit: "10", alertThresholds: [100] }),
    );
    h.db.payment.seed({
      reqId: "0xabc",
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "5",
    });
    const res = await post(
      "/v1/spend/authorize",
      body({ amount: "5", reqId: "0xabc" }),
    );
    expect(res.json().status).toBe("RESERVED");
    expect(h.db.financialAlert.rows).toEqual([]);
  });

  it("does not let an authorization cover an earlier payment to another recipient", async () => {
    h.db.spendingPolicy.seed(
      orgPolicy({ dailyLimit: "10", alertThresholds: [100] }),
    );
    h.db.payment.seed({
      reqId: "0xabc",
      payerAddress: PAYER,
      recipientAddress: "0x9999999999999999999999999999999999999999",
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "5",
    });
    const res = await post(
      "/v1/spend/authorize",
      body({ amount: "5", reqId: "0xabc" }),
    );
    expect(res.json().status).toBe("RESERVED");
    expect(h.db.financialAlert.rows).toHaveLength(1);
  });

  it("counts two payers' payments that share a reqId separately", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ dailyLimit: "10" }));
    h.db.payment.seed(
      {
        reqId: "0xabc",
        payerAddress: PAYER,
        recipientAddress: RECIPIENT,
        network: "BASE_SEPOLIA",
        assetAddress: USDC,
        amount: "4",
      },
      {
        reqId: "0xabc",
        payerAddress: AGENT_PAYER,
        recipientAddress: RECIPIENT,
        network: "BASE_SEPOLIA",
        assetAddress: USDC,
        amount: "4",
      },
    );
    expect(
      (await post("/v1/spend/authorize", body({ amount: "3" }))).json(),
    ).toMatchObject({ status: "DENIED", deniedReason: "daily_limit" });
  });

  it("never denies under a MONITOR policy, and raises its budget alert once", async () => {
    const [policy] = h.db.spendingPolicy.seed(
      orgPolicy({
        mode: "MONITOR",
        dailyLimit: "10",
        perPaymentLimit: "1",
        frozenAt: NOW,
        alertThresholds: [100],
      }),
    );
    expect((await post("/v1/spend/authorize", body())).json().status).toBe(
      "RESERVED",
    );
    expect((await post("/v1/spend/authorize", body())).json().status).toBe(
      "RESERVED",
    );
    await flush();

    expect(h.db.financialAlert.rows).toHaveLength(1);
    expect(h.db.financialAlert.rows[0]).toMatchObject({
      kind: "BUDGET_THRESHOLD",
      policyId: policy?.id,
      dedupeKey: `budget:${policy?.id}:daily:2026-11-27:100`,
    });
    expect(h.sendFinancialAlert).toHaveBeenCalledTimes(1);
  });

  it("applies only the policies whose scope covers this key, agent and project", async () => {
    h.db.spendingPolicy.seed(
      orgPolicy({
        scope: "PROJECT",
        projectId: OTHER_PROJECT_ID,
        frozenAt: NOW,
      }),
      orgPolicy({ scope: "AGENT", agentId: OTHER_AGENT_ID, frozenAt: NOW }),
      orgPolicy({
        scope: "API_KEY",
        apiKeyId: "019fce62-0000-7000-8000-0000000000f9",
        frozenAt: NOW,
      }),
      orgPolicy({ network: "ETHEREUM_SEPOLIA", frozenAt: NOW }),
      orgPolicy({ enabled: false, frozenAt: NOW }),
      orgPolicy({ deletedAt: NOW, frozenAt: NOW }),
      orgPolicy({ organizationId: OTHER_ORG_ID, frozenAt: NOW }),
    );
    expect(
      (await post("/v1/spend/authorize", body({ agentId: AGENT_ID }))).json()
        .status,
    ).toBe("RESERVED");

    h.db.spendingPolicy.seed(
      orgPolicy({ scope: "AGENT", agentId: AGENT_ID, frozenAt: NOW }),
    );
    expect(
      (await post("/v1/spend/authorize", body({ agentId: AGENT_ID }))).json()
        .status,
    ).toBe("DENIED");
    h.db.spendingPolicy.rows.length = 0;
    h.db.spendingPolicy.seed(
      orgPolicy({ scope: "API_KEY", apiKeyId: KEY_ID, frozenAt: NOW }),
    );
    expect((await post("/v1/spend/authorize", body())).json().status).toBe(
      "DENIED",
    );
    h.db.spendingPolicy.rows.length = 0;
    h.db.spendingPolicy.seed(
      orgPolicy({ scope: "PROJECT", projectId: PROJECT_ID, frozenAt: NOW }),
    );
    expect((await post("/v1/spend/authorize", body())).json().status).toBe(
      "DENIED",
    );
  });

  it("holds a payment above the approval threshold for approval", async () => {
    h.db.governanceSettings.seed({
      organizationId: ORG_ID,
      approvalTtlHours: 24,
    });
    const [policy] = h.db.spendingPolicy.seed(
      orgPolicy({ approvalThreshold: "20", approvalsRequired: 2 }),
      orgPolicy({ approvalThreshold: "25", approvalsRequired: 3 }),
    );

    const res = await post(
      "/v1/spend/authorize",
      body({ amount: "25", agentId: AGENT_ID, reqId: "0x1" }),
    );
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json).toMatchObject({
      status: "PENDING_APPROVAL",
      policyId: policy?.id,
      expiresAt: "2026-11-28T12:00:00.000Z",
    });

    const [approval] = h.db.approvalRequest.rows;
    expect(json.approvalRequestId).toBe(approval?.id);
    expect(approval).toMatchObject({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      kind: "PAYMENT",
      requiredApprovals: 2,
      requestedByApiKeyId: KEY_ID,
      summary: "Agent Scout wants to pay 25 USDC to 0x6c5c…ebd5",
      payload: expect.objectContaining({
        authorizationId: json.id,
        amount: "25",
        network: "BASE_SEPOLIA",
        assetAddress: USDC,
        payerAddress: PAYER,
        recipientAddress: RECIPIENT,
        reqId: "0x1",
        agentId: AGENT_ID,
      }),
    });
    expect(h.db.financialAlert.rows.map((row) => row.kind)).toEqual([
      "APPROVAL_REQUESTED",
    ]);
  });
});

describe("GET /v1/spend/authorizations/:id", () => {
  it("404s another organization's authorization", async () => {
    const [row] = h.db.spendAuthorization.seed(
      authRow({ organizationId: OTHER_ORG_ID }),
    );
    const res = await get(`/v1/spend/authorizations/${row?.id}`);
    expect(res.statusCode).toBe(404);
    for (const action of ["consume", "release"]) {
      expect(
        (await post(`/v1/spend/authorizations/${row?.id}/${action}`))
          .statusCode,
      ).toBe(404);
    }
    expect(h.db.spendAuthorization.rows[0]?.status).toBe("RESERVED");
  });

  it("expires a reservation past its expiry", async () => {
    const [row] = h.db.spendAuthorization.seed(
      authRow({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    expect(
      (await get(`/v1/spend/authorizations/${row?.id}`)).json().status,
    ).toBe("EXPIRED");
  });

  it("turns an approved request into a fresh reservation, and a rejected one into a denial", async () => {
    const [approved, rejected] = h.db.approvalRequest.seed(
      { status: "APPROVED", expiresAt: new Date(NOW.getTime() + 3_600_000) },
      { status: "REJECTED", expiresAt: new Date(NOW.getTime() + 3_600_000) },
    );
    const [a, b] = h.db.spendAuthorization.seed(
      authRow({ status: "PENDING_APPROVAL", approvalRequestId: approved?.id }),
      authRow({ status: "PENDING_APPROVAL", approvalRequestId: rejected?.id }),
    );
    expect(
      (await get(`/v1/spend/authorizations/${a?.id}`)).json(),
    ).toMatchObject({
      status: "RESERVED",
      expiresAt: "2026-11-27T12:10:00.000Z",
    });
    expect(
      (await get(`/v1/spend/authorizations/${b?.id}`)).json(),
    ).toMatchObject({
      status: "DENIED",
      deniedReason: "approval_rejected",
    });
  });

  it("denies when the approval expires unanswered and persists the expiry", async () => {
    const [approval] = h.db.approvalRequest.seed({
      expiresAt: new Date(NOW.getTime() - 1),
    });
    const [row] = h.db.spendAuthorization.seed(
      authRow({
        status: "PENDING_APPROVAL",
        approvalRequestId: approval?.id,
        expiresAt: new Date(NOW.getTime() - 1),
      }),
    );
    expect(
      (await get(`/v1/spend/authorizations/${row?.id}`)).json(),
    ).toMatchObject({
      status: "DENIED",
      deniedReason: "approval_expired",
    });
    expect(h.db.approvalRequest.rows[0]?.status).toBe("EXPIRED");
  });

  it("leaves a still-pending approval pending", async () => {
    const [approval] = h.db.approvalRequest.seed({
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    const [row] = h.db.spendAuthorization.seed(
      authRow({ status: "PENDING_APPROVAL", approvalRequestId: approval?.id }),
    );
    expect(
      (await get(`/v1/spend/authorizations/${row?.id}`)).json().status,
    ).toBe("PENDING_APPROVAL");
  });
});

describe("consume and release", () => {
  it("consumes a reservation once, linking its reported payment", async () => {
    const [payment] = h.db.payment.seed({
      reqId: "0xfeed",
      payerAddress: PAYER,
      recipientAddress: RECIPIENT,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "10",
    });
    const [row] = h.db.spendAuthorization.seed(authRow());
    const res = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xFEED",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CONSUMED");
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      reqId: "0xfeed",
      paymentId: payment?.id,
      consumedAt: NOW,
    });

    const again = await post(`/v1/spend/authorizations/${row?.id}/consume`, {});
    expect(again.statusCode).toBe(409);
    expect(
      (await post(`/v1/spend/authorizations/${row?.id}/release`)).statusCode,
    ).toBe(409);
  });

  it("refuses to consume an expired reservation", async () => {
    const [row] = h.db.spendAuthorization.seed(
      authRow({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    expect(
      (await post(`/v1/spend/authorizations/${row?.id}/consume`, {}))
        .statusCode,
    ).toBe(409);
    expect(h.db.spendAuthorization.rows[0]?.status).toBe("EXPIRED");
  });

  it("refuses a reqId that differs from the authorized one", async () => {
    const [row] = h.db.spendAuthorization.seed(authRow({ reqId: "0x1" }));
    expect(
      (
        await post(`/v1/spend/authorizations/${row?.id}/consume`, {
          reqId: "0x2",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("refuses to consume pending, denied or released authorizations", async () => {
    for (const status of ["PENDING_APPROVAL", "DENIED", "RELEASED"]) {
      const [row] = h.db.spendAuthorization.seed(authRow({ status }));
      const res = await post(`/v1/spend/authorizations/${row?.id}/consume`, {});
      expect(res.statusCode, status).toBe(409);
    }
  });

  it("releases a reservation, and cancels the approval of a pending one", async () => {
    const [approval] = h.db.approvalRequest.seed({
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    const [reserved, pending] = h.db.spendAuthorization.seed(
      authRow(),
      authRow({ status: "PENDING_APPROVAL", approvalRequestId: approval?.id }),
    );
    expect(
      (await post(`/v1/spend/authorizations/${reserved?.id}/release`)).json()
        .status,
    ).toBe("RELEASED");
    expect(
      (await post(`/v1/spend/authorizations/${pending?.id}/release`)).json()
        .status,
    ).toBe("RELEASED");
    expect(h.db.approvalRequest.rows[0]?.status).toBe("CANCELLED");
    const again = await post(
      `/v1/spend/authorizations/${reserved?.id}/release`,
    );
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe("RELEASED");
  });

  it("answers a repeated consume with the same reqId idempotently and refuses a different one", async () => {
    const [row] = h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed" }));
    const first = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xfeed",
    });
    expect(first.statusCode).toBe(200);
    const consumedAt = h.db.spendAuthorization.rows[0]?.consumedAt;

    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const again = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xFEED",
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe("CONSUMED");
    expect(h.db.spendAuthorization.rows[0]?.consumedAt).toEqual(consumedAt);

    const other = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xbeef",
    });
    expect(other.statusCode).toBe(409);
    expect(other.json().error).toBe("invalid_transition");
  });
});

describe("canonical payment matching on consume", () => {
  const ELSEWHERE = "0x9999999999999999999999999999999999999999";
  const paymentRow = (over: Record<string, unknown> = {}) => ({
    reqId: "0xfeed",
    payerAddress: PAYER,
    recipientAddress: RECIPIENT,
    network: "BASE_SEPOLIA",
    assetAddress: USDC,
    amount: "10",
    status: "SETTLED",
    ...over,
  });
  const actions = () =>
    h.db.auditLog.create.mock.calls.map(
      ([arg]) => (arg as { data: { action: string } }).data.action,
    );

  const mismatches: [string, Record<string, unknown>][] = [
    ["recipient", { recipientAddress: ELSEWHERE }],
    ["payer", { payerAddress: AGENT_PAYER }],
    ["network", { network: "ETHEREUM_SEPOLIA" }],
    ["asset", { assetAddress: null }],
    ["amount", { amount: "10.000001" }],
    ["status", { status: "FAILED" }],
  ];

  for (const [field, over] of mismatches) {
    it(`never links a reported payment whose ${field} differs`, async () => {
      h.db.payment.seed(paymentRow(over));
      const [row] = h.db.spendAuthorization.seed(
        authRow({ authorizedAmount: "10" }),
      );
      const res = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
        reqId: "0xfeed",
      });
      expect(res.statusCode, field).toBe(200);
      expect(h.db.spendAuthorization.rows[0], field).toMatchObject({
        status: "CONSUMED",
        paymentId: null,
        settledAmount: null,
        amount: "10",
      });
      expect(actions(), field).toEqual(["spend.consumed"]);
    });
  }

  it("links the matching payment reported before consumption and settles it", async () => {
    const [, payment] = h.db.payment.seed(
      paymentRow({ recipientAddress: ELSEWHERE }),
      paymentRow({ amount: "6" }),
    );
    const [row] = h.db.spendAuthorization.seed(
      authRow({ authorizedAmount: "10" }),
    );
    await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xfeed",
    });
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "CONSUMED",
      paymentId: payment?.id,
      amount: "6",
      authorizedAmount: "10",
      settledAmount: "6",
      matchedAt: NOW,
    });
    expect(actions()).toEqual(["spend.consumed", "spend.reconciled"]);
  });

  it("links a payment reported after consumption through reconciliation", async () => {
    const [row] = h.db.spendAuthorization.seed(
      authRow({ authorizedAmount: "10" }),
    );
    await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xfeed",
    });
    expect(h.db.spendAuthorization.rows[0]?.paymentId).toBeNull();
    const [payment] = h.db.payment.seed(paymentRow());
    await reconcileReportedPayment(
      { ...paymentRow(), id: payment?.id as string } as never,
      null,
      NOW,
    );
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      paymentId: payment?.id,
      settledAmount: "10",
    });
    expect(actions()).toEqual(["spend.consumed", "spend.reconciled"]);
  });

  it("audits a release in the same transaction", async () => {
    const [row] = h.db.spendAuthorization.seed(authRow());
    await post(`/v1/spend/authorizations/${row?.id}/release`);
    expect(actions()).toEqual(["spend.released"]);
    expect(h.db.auditLog.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        actorApiKeyId: KEY_ID,
        targetId: row?.id,
        metadata: { from: "RESERVED" },
      },
    });
  });

  it("fails the consumption when its audit cannot be written", async () => {
    const [row] = h.db.spendAuthorization.seed(authRow());
    h.db.auditLog.create.mockRejectedValueOnce(new Error("audit down"));
    const res = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xfeed",
    });
    expect(res.statusCode).toBe(500);
  });
});

describe("request id uniqueness", () => {
  const uniqueViolation = () =>
    Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: {
        driverAdapterError: {
          cause: {
            originalMessage:
              'duplicate key value violates unique constraint "spend_authorizations_live_req_id_key"',
          },
        },
      },
    });

  it("scopes a held reqId to its network and asset", async () => {
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xabc", status: "CONSUMED" }),
    );
    const otherAsset = await post(
      "/v1/spend/authorize",
      body({ reqId: "0xabc", assetAddress: null }),
    );
    expect(otherAsset.statusCode).toBe(200);
    expect(otherAsset.json().status).toBe("RESERVED");

    const sameAsset = await post(
      "/v1/spend/authorize",
      body({ reqId: "0xabc" }),
    );
    expect(sameAsset.statusCode).toBe(409);
    expect(sameAsset.json().error).toBe("req_id_in_use");
  });

  it("lets a terminal or superseded holder release its reqId", async () => {
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xabc", status: "RELEASED" }),
      authRow({ reqId: "0xabc", status: "EXPIRED" }),
      authRow({ reqId: "0xabc", status: "DENIED" }),
      authRow({
        reqId: "0xabc",
        status: "CONSUMED",
        reqIdConflict: "duplicate_req_id",
      }),
    );
    const res = await post("/v1/spend/authorize", body({ reqId: "0xabc" }));
    expect(res.statusCode).toBe(200);
  });

  it("consumes under the same advisory lock as authorization", async () => {
    const [row] = h.db.spendAuthorization.seed(authRow());
    await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xfeed",
    });
    expect(h.db.$executeRaw).toHaveBeenCalledTimes(1);
    const [, lockKey] = h.db.$executeRaw.mock.calls[0] as unknown as [
      unknown,
      string,
    ];
    expect(lockKey).toBe(`spend:${ORG_ID}:BASE_SEPOLIA:${USDC}`);
  });

  it("refuses to attach a reqId another authorization of the same identity holds", async () => {
    const [, otherAsset, row] = h.db.spendAuthorization.seed(
      authRow({ reqId: "0xfeed", status: "CONSUMED" }),
      authRow({ assetAddress: null }),
      authRow(),
    );
    const res = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
      reqId: "0xfeed",
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("req_id_in_use");
    expect(h.db.spendAuthorization.rows[2]?.status).toBe("RESERVED");

    const elsewhere = await post(
      `/v1/spend/authorizations/${otherAsset?.id}/consume`,
      { reqId: "0xfeed" },
    );
    expect(elsewhere.statusCode).toBe(200);
  });

  it("maps a lost race on the database index to req_id_in_use when authorizing", async () => {
    const spy = vi
      .spyOn(h.db.spendAuthorization, "create")
      .mockRejectedValueOnce(uniqueViolation());
    try {
      const res = await post("/v1/spend/authorize", body({ reqId: "0xabc" }));
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("req_id_in_use");
    } finally {
      spy.mockRestore();
    }
  });

  it("maps a lost race on the database index to req_id_in_use when consuming", async () => {
    const [row] = h.db.spendAuthorization.seed(authRow());
    const spy = vi
      .spyOn(h.db.spendAuthorization, "updateMany")
      .mockRejectedValueOnce(uniqueViolation());
    try {
      const res = await post(`/v1/spend/authorizations/${row?.id}/consume`, {
        reqId: "0xfeed",
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("req_id_in_use");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("authorization ownership", () => {
  const SERVICE_ACCOUNT_ID = "019fce62-0000-7000-8000-0000000000aa";
  const ROTATED_KEY_ID = "019fce62-0000-7000-8000-0000000000f2";
  const OTHER_KEY_ID = "019fce62-0000-7000-8000-0000000000f3";
  const OTHER_SERVICE_ACCOUNT_ID = "019fce62-0000-7000-8000-0000000000ab";

  const seedTargets = (over: Record<string, unknown>) => {
    const [approved] = h.db.approvalRequest.seed({
      status: "APPROVED",
      expiresAt: new Date(NOW.getTime() + 3_600_000),
    });
    const [lapsed] = h.db.approvalRequest.seed({
      expiresAt: new Date(NOW.getTime() - 1),
    });
    return h.db.spendAuthorization.seed(
      authRow(over),
      authRow({ ...over, expiresAt: new Date(NOW.getTime() - 1) }),
      authRow({
        ...over,
        status: "PENDING_APPROVAL",
        approvalRequestId: approved?.id,
      }),
      authRow({
        ...over,
        status: "PENDING_APPROVAL",
        approvalRequestId: lapsed?.id,
      }),
    );
  };

  const writes = () => [
    vi.spyOn(h.db.spendAuthorization, "updateMany"),
    vi.spyOn(h.db.spendAuthorization, "update"),
    vi.spyOn(h.db.approvalRequest, "updateMany"),
    vi.spyOn(h.db.approvalRequest, "update"),
  ];

  const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["another project of the same org", { projectId: OTHER_PROJECT_ID }, {}],
    ["the other environment", { environment: "PRODUCTION" }, {}],
    ["another key of the same project", { apiKeyId: OTHER_KEY_ID }, {}],
    [
      "a key of another service account",
      { apiKeyId: OTHER_KEY_ID, serviceAccountId: OTHER_SERVICE_ACCOUNT_ID },
      { serviceAccountId: SERVICE_ACCOUNT_ID },
    ],
    [
      "a plain key's authorization, from a service account key",
      {},
      { id: ROTATED_KEY_ID, serviceAccountId: SERVICE_ACCOUNT_ID },
    ],
    [
      "another agent's authorization",
      { agentId: OTHER_AGENT_ID },
      { agentId: AGENT_ID },
    ],
    [
      "an attacker who only knows the id",
      {},
      {
        id: OTHER_KEY_ID,
        organizationId: OTHER_ORG_ID,
        projectId: OTHER_PROJECT_ID,
      },
    ],
  ];

  for (const [label, rowOver, keyOver] of cases) {
    it(`404s ${label} on read, consume and release without side effects`, async () => {
      h.db.apiKey.findUnique.mockResolvedValue(storedKey(keyOver));
      const targets = seedTargets({ reqId: "0xfeed", ...rowOver });
      const before = structuredClone([
        h.db.spendAuthorization.rows,
        h.db.approvalRequest.rows,
      ]);
      const spies = writes();

      for (const target of targets) {
        const url = `/v1/spend/authorizations/${target.id}`;
        expect((await get(url)).statusCode, label).toBe(404);
        expect(
          (await post(`${url}/consume`, { reqId: "0xfeed" })).statusCode,
          label,
        ).toBe(404);
        expect((await post(`${url}/release`)).statusCode, label).toBe(404);
      }

      for (const spy of spies) {
        expect(spy, label).not.toHaveBeenCalled();
        spy.mockRestore();
      }
      expect([h.db.spendAuthorization.rows, h.db.approvalRequest.rows]).toEqual(
        before,
      );
    });
  }

  it("lets any key of the owning service account use an authorization after rotation", async () => {
    h.db.apiKey.findUnique.mockResolvedValue(
      storedKey({ id: ROTATED_KEY_ID, serviceAccountId: SERVICE_ACCOUNT_ID }),
    );
    const [row] = h.db.spendAuthorization.seed(
      authRow({ apiKeyId: KEY_ID, serviceAccountId: SERVICE_ACCOUNT_ID }),
    );
    expect((await get(`/v1/spend/authorizations/${row?.id}`)).statusCode).toBe(
      200,
    );
    expect(
      (await post(`/v1/spend/authorizations/${row?.id}/consume`, {})).json()
        .status,
    ).toBe("CONSUMED");
  });

  it("keeps a service account's authorization usable after the issuing key is deleted", async () => {
    h.db.apiKey.findUnique.mockResolvedValue(
      storedKey({ id: ROTATED_KEY_ID, serviceAccountId: SERVICE_ACCOUNT_ID }),
    );
    const [row] = h.db.spendAuthorization.seed(
      authRow({
        apiKeyId: null,
        issuedByKeyId: KEY_ID,
        issuedByKeyPrefix: "4mica_sk_test_ab",
        serviceAccountId: SERVICE_ACCOUNT_ID,
      }),
    );
    expect((await get(`/v1/spend/authorizations/${row?.id}`)).statusCode).toBe(
      200,
    );
    expect(
      (await post(`/v1/spend/authorizations/${row?.id}/release`)).json().status,
    ).toBe("RELEASED");
  });

  it("records who asked, stably, when authorizing", async () => {
    h.db.apiKey.findUnique.mockResolvedValue(
      storedKey({
        prefix: "4mica_sk_test_ab",
        serviceAccountId: SERVICE_ACCOUNT_ID,
      }),
    );
    expect((await post("/v1/spend/authorize", body())).statusCode).toBe(200);
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      apiKeyId: KEY_ID,
      issuedByKeyId: KEY_ID,
      issuedByKeyPrefix: "4mica_sk_test_ab",
      serviceAccountId: SERVICE_ACCOUNT_ID,
    });
  });

  it("lets an agent key use its own agent's authorization", async () => {
    h.db.apiKey.findUnique.mockResolvedValue(storedKey({ agentId: AGENT_ID }));
    const [row] = h.db.spendAuthorization.seed(authRow({ agentId: AGENT_ID }));
    expect(
      (await post(`/v1/spend/authorizations/${row?.id}/release`)).json().status,
    ).toBe("RELEASED");
  });
});

describe("onApprovalResolved", () => {
  const pending = (over: Record<string, unknown> = {}) => {
    const [approval] = h.db.approvalRequest.seed({
      expiresAt: new Date(NOW.getTime() + 60_000),
      ...over,
    });
    const [row] = h.db.spendAuthorization.seed(
      authRow({
        status: "PENDING_APPROVAL",
        amount: "30",
        approvalRequestId: approval?.id,
      }),
    );
    return { approval, row };
  };
  const resolve = (id: unknown, status: string, kind = "PAYMENT") =>
    onApprovalResolved(h.db.prisma as never, {
      id: id as string,
      organizationId: ORG_ID,
      kind: kind as never,
      status: status as never,
    });

  it("reserves an approved payment, ignoring the threshold that held it", async () => {
    h.db.spendingPolicy.seed(
      orgPolicy({ approvalThreshold: "20", dailyLimit: "100" }),
    );
    const { approval } = pending();
    await resolve(approval?.id, "APPROVED");
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "RESERVED",
      expiresAt: new Date(NOW.getTime() + 600_000),
    });
  });

  it("denies with limit_changed when limits now fail", async () => {
    const [policy] = h.db.spendingPolicy.seed(
      orgPolicy({ approvalThreshold: "20", dailyLimit: "50" }),
    );
    const { approval } = pending();
    h.db.spendAuthorization.seed(authRow({ status: "CONSUMED", amount: "25" }));
    await resolve(approval?.id, "APPROVED");
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "DENIED",
      deniedReason: "limit_changed",
      policyId: policy?.id,
    });
  });

  it("denies rejected and expired approvals and releases cancelled ones", async () => {
    for (const [status, expected] of [
      ["REJECTED", { status: "DENIED", deniedReason: "approval_rejected" }],
      ["EXPIRED", { status: "DENIED", deniedReason: "approval_expired" }],
      ["CANCELLED", { status: "RELEASED" }],
    ] as const) {
      h.db.spendAuthorization.rows.length = 0;
      const { approval } = pending();
      await resolve(approval?.id, status);
      expect(h.db.spendAuthorization.rows[0], status).toMatchObject(expected);
    }
  });

  it("ignores other kinds and other organizations", async () => {
    const { approval } = pending();
    await resolve(approval?.id, "APPROVED", "GOVERNANCE");
    await onApprovalResolved(h.db.prisma as never, {
      id: approval?.id as string,
      organizationId: OTHER_ORG_ID,
      kind: "PAYMENT",
      status: "REJECTED",
    });
    expect(h.db.spendAuthorization.rows[0]?.status).toBe("PENDING_APPROVAL");
  });
});

describe("reconcileReportedPayment", () => {
  const reported = (over: Record<string, unknown> = {}) => ({
    id: "019fce62-5555-7000-8000-000000000001",
    reqId: "0xfeed",
    payerAddress: PAYER,
    recipientAddress: RECIPIENT,
    network: "BASE_SEPOLIA" as const,
    assetAddress: USDC,
    amount: "10",
    status: "SETTLED",
    ...over,
  });
  const email = () => ({ sendFinancialAlert: h.sendFinancialAlert }) as never;

  it("consumes the authorization with the same reqId", async () => {
    h.db.spendingPolicy.seed(orgPolicy());
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xfeed", expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await reconcileReportedPayment(reported(), email(), NOW);
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "CONSUMED",
      paymentId: "019fce62-5555-7000-8000-000000000001",
    });
    expect(h.db.financialAlert.rows).toEqual([]);
  });

  it("alerts once on an unmatched payment when the org enforces a policy", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ network: null, assetAddress: null }));
    await reconcileReportedPayment(reported(), email(), NOW);
    await reconcileReportedPayment(reported(), email(), NOW);
    await flush();
    expect(h.db.financialAlert.rows).toHaveLength(1);
    expect(h.db.financialAlert.rows[0]).toMatchObject({
      kind: "UNAUTHORIZED_SPEND",
      dedupeKey: "unauthorized:019fce62-5555-7000-8000-000000000001",
    });
    expect(h.sendFinancialAlert).toHaveBeenCalledTimes(1);
  });

  it("never consumes an authorization for a payment to a different recipient", async () => {
    h.db.spendingPolicy.seed(orgPolicy());
    const [row] = h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed" }));
    const elsewhere = "0x9999999999999999999999999999999999999999";
    await reconcileReportedPayment(
      reported({ recipientAddress: elsewhere }),
      email(),
      NOW,
    );
    await flush();
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "RESERVED",
      paymentId: null,
      consumedAt: null,
    });
    expect(h.db.financialAlert.rows).toHaveLength(1);
    expect(h.db.financialAlert.rows[0]).toMatchObject({
      kind: "UNAUTHORIZED_SPEND",
      dedupeKey: "unauthorized:019fce62-5555-7000-8000-000000000001",
    });
    expect(h.db.financialAlert.rows[0]?.detail).toMatchObject({
      reason: "recipient_mismatch",
      recipientAddress: elsewhere,
      authorizationId: row?.id,
    });
    expect(h.sendFinancialAlert).toHaveBeenCalledTimes(1);
  });

  it("consumes only the paid part of a larger authorization and frees the rest", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ dailyLimit: "100" }));
    h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed", amount: "90" }));
    await reconcileReportedPayment(reported({ amount: "4" }), email(), NOW);
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "CONSUMED",
      amount: "4",
      paymentId: "019fce62-5555-7000-8000-000000000001",
    });
    expect(
      (await post("/v1/spend/authorize", body({ amount: "96" }))).json().status,
    ).toBe("RESERVED");
  });

  it("keeps the authorized amount when a smaller payment settles it", async () => {
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xfeed", amount: "90", authorizedAmount: "90" }),
    );
    await reconcileReportedPayment(reported({ amount: "4" }), email(), NOW);
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "CONSUMED",
      amount: "4",
      authorizedAmount: "90",
      settledAmount: "4",
    });
    const id = h.db.spendAuthorization.rows[0]?.id;
    expect((await get(`/v1/spend/authorizations/${id}`)).json()).toMatchObject({
      amount: "4",
      authorizedAmount: "90",
      settledAmount: "4",
    });
  });

  it("settles once however often the same payment is reported", async () => {
    h.db.spendingPolicy.seed(orgPolicy());
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xfeed", amount: "10", authorizedAmount: "10" }),
    );
    await reconcileReportedPayment(reported({ amount: "6" }), email(), NOW);
    const update = vi.spyOn(h.db.spendAuthorization, "updateMany");
    try {
      await reconcileReportedPayment(reported({ amount: "6" }), email(), NOW);
      expect(update).not.toHaveBeenCalled();
    } finally {
      update.mockRestore();
    }
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      amount: "6",
      authorizedAmount: "10",
      settledAmount: "6",
    });
    expect(h.db.financialAlert.rows).toEqual([]);
  });

  it("never re-settles a settled authorization with a second payment", async () => {
    h.db.spendingPolicy.seed(orgPolicy());
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xfeed", amount: "10", authorizedAmount: "10" }),
    );
    await reconcileReportedPayment(reported({ amount: "4" }), email(), NOW);
    await reconcileReportedPayment(
      reported({ id: "019fce62-5555-7000-8000-000000000002", amount: "4" }),
      email(),
      NOW,
    );
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      amount: "4",
      authorizedAmount: "10",
      settledAmount: "4",
      paymentId: "019fce62-5555-7000-8000-000000000001",
    });
    expect(h.db.financialAlert.rows).toHaveLength(1);
    expect(h.db.financialAlert.rows[0]?.dedupeKey).toBe(
      "unauthorized:019fce62-5555-7000-8000-000000000002",
    );
  });

  it("checks a payment against the granted amount, not the amount left committed", async () => {
    h.db.spendAuthorization.seed(
      authRow({ reqId: "0xfeed", amount: "2", authorizedAmount: "10" }),
    );
    await reconcileReportedPayment(reported({ amount: "8" }), email(), NOW);
    expect(h.db.spendAuthorization.rows[0]).toMatchObject({
      status: "CONSUMED",
      settledAmount: "8",
      authorizedAmount: "10",
    });
  });

  it("treats a payment larger than its authorization as unauthorized", async () => {
    h.db.spendingPolicy.seed(orgPolicy());
    h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed", amount: "1" }));
    await reconcileReportedPayment(reported(), email(), NOW);
    expect(h.db.spendAuthorization.rows[0]?.status).toBe("RESERVED");
    expect(h.db.financialAlert.rows[0]?.detail).toMatchObject({
      reason: "exceeds_authorization",
    });
  });

  it("does not alert without an enforcing policy, nor for failed payments or foreign payers", async () => {
    h.db.spendingPolicy.seed(orgPolicy({ mode: "MONITOR" }));
    await reconcileReportedPayment(reported(), email(), NOW);
    h.db.spendingPolicy.seed(orgPolicy());
    await reconcileReportedPayment(
      reported({ status: "FAILED" }),
      email(),
      NOW,
    );
    await reconcileReportedPayment(
      reported({ payerAddress: "0x7777777777777777777777777777777777777777" }),
      email(),
      NOW,
    );
    expect(h.db.financialAlert.rows).toEqual([]);
  });

  it("marks the payment reconciled in the transaction that settles it", async () => {
    const [stored] = h.db.payment.seed({
      ...reported(),
      reconciliationState: "PENDING",
    });
    h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed" }));
    expect(
      await reconcileReportedPayment(
        reported({ id: stored?.id }),
        email(),
        NOW,
      ),
    ).toBe("reconciled");
    expect(h.db.payment.rows[0]).toMatchObject({
      reconciliationState: "RECONCILED",
      reconciledAt: NOW,
      reconcileError: null,
    });
    expect(String(h.db.$queryRaw.mock.calls[0]?.[0])).toContain("FOR UPDATE");
  });

  it("skips a payment another worker already reconciled", async () => {
    h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed" }));
    h.db.$queryRaw.mockResolvedValueOnce([{ state: "RECONCILED" }] as never);
    expect(await reconcileReportedPayment(reported(), email(), NOW)).toBe(
      "skipped",
    );
    expect(h.db.spendAuthorization.rows[0]?.status).toBe("RESERVED");
  });

  it("records a failed attempt for retry instead of only logging it", async () => {
    h.db.spendAuthorization.seed(authRow({ reqId: "0xfeed" }));
    const spy = vi
      .spyOn(h.db.spendAuthorization, "findMany")
      .mockRejectedValueOnce(new Error("connection reset"));
    try {
      expect(await reconcileReportedPayment(reported(), email(), NOW)).toBe(
        "failed",
      );
    } finally {
      spy.mockRestore();
    }
    const failure = h.db.$queryRaw.mock.calls.find(([strings]) =>
      strings.join("?").includes("UPDATE payments"),
    );
    expect(failure).toBeDefined();
    expect(failure).toContain("connection reset");
    expect(h.db.spendAuthorization.rows[0]?.status).toBe("RESERVED");
  });

  it("re-evaluates budgets after the payment lands", async () => {
    const [policy] = h.db.spendingPolicy.seed(
      orgPolicy({ dailyLimit: "10", alertThresholds: [100] }),
    );
    h.db.payment.seed({
      reqId: "0xfeed",
      payerAddress: PAYER,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "10",
    });
    await reconcileReportedPayment(reported(), email(), NOW);
    expect(h.db.financialAlert.rows.map((row) => row.dedupeKey).sort()).toEqual(
      [
        `budget:${policy?.id}:daily:2026-11-27:100`,
        "unauthorized:019fce62-5555-7000-8000-000000000001",
      ],
    );
  });
});

describe("GET /me/spend/authorizations", () => {
  const RESTRICTED_ID = "019fce62-0000-7000-8000-0000000000d3";
  const projects = (memberOf: string[] = []) => {
    const rows = [PROJECT_ID, OTHER_PROJECT_ID, RESTRICTED_ID].map((id) => ({
      id,
      restricted: id !== PROJECT_ID,
      members: memberOf.includes(id) ? [{ role: "VIEWER" }] : [],
    }));
    h.db.project.findMany.mockImplementation(
      async ({ where }: { where: { organizationId: string } }) =>
        where.organizationId === ORG_ID ? rows : [],
    );
    h.db.project.findFirst.mockImplementation(
      async ({ where }: { where: { organizationId: string; id: string } }) =>
        where.organizationId === ORG_ID
          ? (rows.find((row) => row.id === where.id) ?? null)
          : null,
    );
  };
  const seedSpread = () =>
    h.db.spendAuthorization.seed(
      authRow({
        projectId: OTHER_PROJECT_ID,
        createdAt: new Date("2026-11-27T11:00:00Z"),
      }),
      authRow({
        projectId: RESTRICTED_ID,
        createdAt: new Date("2026-11-27T10:00:00Z"),
      }),
      authRow({ createdAt: new Date("2026-11-27T09:00:00Z") }),
    );
  const listed = async (query = "") => {
    const res = await get(`/me/spend/authorizations${query}`, AUTH);
    expect(res.statusCode).toBe(200);
    return res.json() as {
      items: { projectId: string }[];
      nextCursor: string | null;
    };
  };

  it("hides restricted projects the caller is not a member of, in the query itself", async () => {
    actAs(h.db.tenancy, "FINANCE");
    projects();
    seedSpread();
    const findMany = vi.spyOn(h.db.spendAuthorization, "findMany");

    const page = await listed("?limit=1");
    expect(page.items.map((item) => item.projectId)).toEqual([PROJECT_ID]);
    expect(page.nextCursor).toBeNull();
    expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      AND: [{ projectId: { in: [PROJECT_ID] } }, {}],
    });
    expect(h.db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID },
        select: expect.objectContaining({
          members: { where: { userId: USER_ID }, select: { role: true } },
        }),
      }),
    );
    findMany.mockRestore();
  });

  it("finds a deleted key's authorizations by the key that issued them", async () => {
    actAs(h.db.tenancy, "FINANCE");
    projects();
    h.db.spendAuthorization.seed(
      authRow({ apiKeyId: null, issuedByKeyId: KEY_ID }),
      authRow({
        apiKeyId: null,
        issuedByKeyId: "019fce62-0000-7000-8000-0000000000f3",
      }),
    );

    const page = await listed(`?apiKeyId=${KEY_ID}`);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      apiKeyId: null,
      issuedByKeyId: KEY_ID,
    });
  });

  it("shows a restricted project to its members, with and without a project filter", async () => {
    actAs(h.db.tenancy, "VIEWER");
    projects([OTHER_PROJECT_ID]);
    seedSpread();

    expect((await listed()).items.map((item) => item.projectId).sort()).toEqual(
      [PROJECT_ID, OTHER_PROJECT_ID].sort(),
    );
    expect(
      (await listed(`?projectId=${OTHER_PROJECT_ID}`)).items.map(
        (item) => item.projectId,
      ),
    ).toEqual([OTHER_PROJECT_ID]);
    expect(
      (await get(`/me/spend/authorizations?projectId=${RESTRICTED_ID}`, AUTH))
        .statusCode,
    ).toBe(404);
  });

  it("applies a custom role's project access like effectiveProjectRole does", async () => {
    actAs(h.db.tenancy, "ADMIN");
    h.db.tenancy.membership.findFirst.mockResolvedValue({
      role: "ADMIN",
      suspendedAt: null,
      customRole: {
        id: "019fce62-0000-7000-8000-0000000000cc",
        permissions: ["finance.read"],
        projectRole: "VIEWER",
        deletedAt: null,
      },
      organization: { id: ORG_ID, personal: true },
    });
    projects();
    seedSpread();

    expect((await listed()).items.map((item) => item.projectId)).toEqual([
      PROJECT_ID,
    ]);
  });

  it("shows every project to an owner without loading the project list", async () => {
    actAs(h.db.tenancy, "OWNER");
    projects();
    seedSpread();

    const page = await listed("?limit=2");
    expect(page.items.map((item) => item.projectId)).toEqual([
      OTHER_PROJECT_ID,
      RESTRICTED_ID,
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(
      (await listed(`?projectId=${RESTRICTED_ID}`)).items.map(
        (item) => item.projectId,
      ),
    ).toEqual([RESTRICTED_ID]);
    expect(h.db.project.findMany).not.toHaveBeenCalled();
  });

  it("lists the org's authorizations in the active environment", async () => {
    actAs(h.db.tenancy, "VIEWER");
    h.db.spendAuthorization.seed(
      authRow(),
      authRow({ organizationId: OTHER_ORG_ID }),
      authRow({ environment: "PRODUCTION", network: "BASE" }),
    );
    const res = await get("/me/spend/authorizations", AUTH);
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0]).toMatchObject({
      payerAddress: PAYER,
      projectId: PROJECT_ID,
    });
  });

  it("404s a project the caller cannot see", async () => {
    const res = await get(
      `/me/spend/authorizations?projectId=${OTHER_PROJECT_ID}`,
      AUTH,
    );
    expect(res.statusCode).toBe(404);
  });

  it("does not answer for an organization the caller is not in", async () => {
    h.db.spendAuthorization.seed(authRow());
    const res = await get("/me/spend/authorizations", {
      ...AUTH,
      "x-org-id": OTHER_ORG_ID,
    });
    expect(res.statusCode).toBe(404);
  });
});
