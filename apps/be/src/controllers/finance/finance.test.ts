import { Prisma } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { financeRoutes } from "@routes/finance";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { actAs, ORG_ID, OTHER_ORG_ID } from "@/test-support/tenancy";

const {
  authenticateRequest,
  getUser,
  upsert,
  tenancy,
  wallet,
  payment,
  spendAuthorization,
  project,
  agent,
  apiKey,
  apiListing,
  queryRaw,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  upsert: vi.fn(),
  tenancy: {
    membership: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  wallet: { findMany: vi.fn() },
  payment: { groupBy: vi.fn(), findMany: vi.fn() },
  spendAuthorization: { groupBy: vi.fn(), findMany: vi.fn() },
  project: { findMany: vi.fn() },
  agent: { findMany: vi.fn() },
  apiKey: { findMany: vi.fn() },
  apiListing: { findMany: vi.fn() },
  queryRaw: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", async () => {
  const { sqltag, join, empty, Decimal } = await import(
    "@prisma/client/runtime/client"
  );
  return {
    Prisma: { sql: sqltag, join, empty, Decimal },
    prisma: {
      ...tenancy,
      project: { ...tenancy.project, ...project },
      wallet,
      payment,
      spendAuthorization,
      agent,
      apiKey,
      apiListing,
      user: { findUnique: vi.fn(), upsert, update: vi.fn() },
      $queryRaw: queryRaw,
      $transaction: vi.fn(async (run: (tx: unknown) => unknown) =>
        run({ auditLog: tenancy.auditLog }),
      ),
    },
    disconnect: vi.fn(async () => {}),
  };
});

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const MY_WALLET = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const OTHER_WALLET = "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const PROJECT_A = "019fce62-0000-7000-8000-0000000000f1";
const AGENT_A = "019fce62-0000-7000-8000-0000000000f2";
const SANDBOX_NETWORKS = ["BASE_SEPOLIA", "ETHEREUM_SEPOLIA"];

const AUTH_USER = {
  id: USER_ID,
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const signedIn = () => ({
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

const signedOut = () => ({
  isAuthenticated: false,
  status: "signed-out",
  reason: "session-token-missing",
  toAuth: () => ({ tokenType: null, userId: null }),
});

const AUTH = { authorization: "Bearer good" };

const decimal = (value: string) => new Prisma.Decimal(value);

let accessRows: { id: string; restricted: boolean; members: unknown[] }[] = [];
let labelRows: { id: string; name: string }[] = [];

const labelLookups = () =>
  project.findMany.mock.calls.filter(([arg]) => arg.where.id !== undefined);

const ROUTES = [
  "/me/finance/summary",
  "/me/finance/usage",
  "/me/finance/reconciliation",
  "/me/finance/export/payments.csv",
  "/me/finance/export/usage.csv",
];

const app = () => initApp([{ plugin: financeRoutes }]);

const get = async (url: string, headers: Record<string, string> = {}) => {
  const instance = await app();
  const res = await instance.inject({
    method: "GET",
    url,
    headers: { ...AUTH, ...headers },
  });
  await instance.close();
  return res;
};

const rawCall = (index = 0) => {
  const [strings, ...values] = queryRaw.mock.calls[index] as [
    TemplateStringsArray,
    ...unknown[],
  ];
  return Prisma.sql(strings, ...values);
};

const exported = () =>
  tenancy.auditLog.create.mock.calls
    .map(([arg]) => arg.data)
    .filter((data) => data.action === "report.exported");

const storedAuthorization = (over: Record<string, unknown> = {}) => ({
  id: "auth_1",
  status: "CONSUMED",
  deniedReason: null,
  policyId: null,
  approvalRequestId: null,
  expiresAt: new Date("2026-11-20T00:10:00Z"),
  amount: decimal("2.5"),
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  payerAddress: MY_WALLET,
  recipientAddress: OTHER_WALLET,
  reqId: "0x01",
  projectId: PROJECT_A,
  agentId: null,
  apiKeyId: null,
  createdAt: new Date("2026-11-20T00:00:00Z"),
  ...over,
});

const storedPayment = (over: Record<string, unknown> = {}) => ({
  id: "pay_1",
  created_at: new Date("2026-11-20T00:00:00Z"),
  settled_at: new Date("2026-11-20T00:00:05Z"),
  status: "SETTLED",
  network: "BASE_SEPOLIA",
  asset_address: USDC,
  amount: decimal("1.5"),
  payer_address: MY_WALLET,
  recipient_address: OTHER_WALLET,
  req_id: "0xabc",
  tx_hash: null,
  project_id: PROJECT_A,
  agent_id: null,
  listing_id: null,
  api_key_id: null,
  description: "=cmd|' /C calc'!A0",
  resource: "https://api.example.com/a,b",
  failure_reason: null,
  ...over,
});

describe("finance routes", () => {
  beforeEach(() => {
    for (const fn of [authenticateRequest, getUser, upsert, queryRaw]) {
      fn.mockReset();
    }
    for (const group of [
      wallet,
      payment,
      spendAuthorization,
      project,
      agent,
      apiKey,
      apiListing,
    ]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();
    actAs(tenancy, "FINANCE");

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    wallet.findMany.mockResolvedValue([{ address: MY_WALLET }]);
    payment.groupBy.mockResolvedValue([]);
    payment.findMany.mockResolvedValue([]);
    spendAuthorization.groupBy.mockResolvedValue([]);
    spendAuthorization.findMany.mockResolvedValue([]);
    for (const model of [agent, apiKey, apiListing]) {
      model.findMany.mockResolvedValue([]);
    }
    accessRows = [];
    labelRows = [];
    project.findMany.mockImplementation(
      async (arg: { select: { restricted?: boolean } }) =>
        arg.select.restricted ? accessRows : labelRows,
    );
    queryRaw.mockResolvedValue([]);
  });

  describe("access", () => {
    it("requires authentication", async () => {
      authenticateRequest.mockResolvedValue(signedOut());

      for (const url of ROUTES) {
        const res = await get(url);
        expect(res.statusCode, url).toBe(401);
      }
    });

    it("404s and reads nothing for an organization the caller is not in", async () => {
      for (const url of ROUTES) {
        const res = await get(url, { "x-org-id": OTHER_ORG_ID });
        expect(res.statusCode, url).toBe(404);
      }

      expect(wallet.findMany).not.toHaveBeenCalled();
      expect(payment.groupBy).not.toHaveBeenCalled();
      expect(payment.findMany).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it("404s an unknown environment", async () => {
      for (const url of ROUTES) {
        const res = await get(url, { "x-environment": "staging" });
        expect(res.statusCode, url).toBe(404);
        expect(res.json()).toMatchObject({ error: "not_found" });
      }

      expect(wallet.findMany).not.toHaveBeenCalled();
    });

    it.each([
      "VIEWER",
      "DEVELOPER",
    ] as const)("lets a %s read the reports but not export them", async (role) => {
      actAs(tenancy, role);

      expect((await get("/me/finance/summary")).statusCode).toBe(200);

      for (const url of [
        "/me/finance/export/payments.csv",
        "/me/finance/export/usage.csv",
      ]) {
        const res = await get(url);
        expect(res.statusCode, url).toBe(403);
        expect(res.json()).toMatchObject({ permission: "reports.export" });
      }

      expect(payment.findMany).not.toHaveBeenCalled();
      expect(exported()).toEqual([]);
    });

    it.each([
      "FINANCE",
      "ADMIN",
      "OWNER",
    ] as const)("lets a %s export both finance reports", async (role) => {
      actAs(tenancy, role);

      for (const url of [
        "/me/finance/export/payments.csv",
        "/me/finance/export/usage.csv",
      ]) {
        const res = await get(url);
        expect(res.statusCode, url).toBe(200);
      }
    });
  });

  describe("date range", () => {
    it("defaults to the last 30 days", async () => {
      const before = Date.now();
      await get("/me/finance/summary");

      const { createdAt } = payment.groupBy.mock.calls[0][0].where;
      const span = createdAt.lt.getTime() - createdAt.gte.getTime();
      expect(span).toBe(30 * 24 * 60 * 60 * 1000);
      expect(createdAt.lt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("includes the whole of a date-only end day", async () => {
      await get("/me/finance/summary?from=2026-11-01&to=2026-11-30");

      expect(payment.groupBy.mock.calls[0][0].where.createdAt).toEqual({
        gte: new Date("2026-11-01T00:00:00.000Z"),
        lt: new Date("2026-12-01T00:00:00.000Z"),
      });
    });

    it("takes timestamps as given", async () => {
      await get(
        "/me/finance/summary?from=2026-11-01T06:00:00Z&to=2026-11-02T06:00:00%2B02:00",
      );

      expect(payment.groupBy.mock.calls[0][0].where.createdAt).toEqual({
        gte: new Date("2026-11-01T06:00:00.000Z"),
        lt: new Date("2026-11-02T04:00:00.000Z"),
      });
    });

    it.each([
      ["from=2026-12-01&to=2026-11-01", "from"],
      ["from=2026-11-01&to=2026-11-01T00:00:00Z", "from"],
      ["from=2025-01-01&to=2026-11-01", "to"],
      ["from=last-week", "from"],
      ["from=2026-02-30", "from"],
      ["to=1700000000", "to"],
    ])("refuses %s", async (query, path) => {
      const res = await get(`/me/finance/summary?${query}`);

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe(path);
      expect(payment.groupBy).not.toHaveBeenCalled();
    });

    it("accepts exactly 366 days", async () => {
      const res = await get(
        "/me/finance/summary?from=2025-01-01&to=2026-01-01",
      );

      expect(res.statusCode).toBe(200);
    });
  });

  describe("summary", () => {
    it("totals sent and received payments per asset in the active environment", async () => {
      queryRaw.mockResolvedValue([
        {
          network: "BASE_SEPOLIA",
          asset_address: USDC,
          amount: decimal("12.5"),
          count: 3n,
        },
      ]);
      payment.groupBy.mockResolvedValue([
        {
          network: "BASE_SEPOLIA",
          assetAddress: null,
          _sum: { amount: decimal("0.001") },
          _count: { _all: 1 },
        },
      ]);

      const res = await get("/me/finance/summary");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        sent: [
          {
            network: "BASE_SEPOLIA",
            assetAddress: USDC,
            amount: "12.5",
            count: 3,
          },
        ],
        received: [
          {
            network: "BASE_SEPOLIA",
            assetAddress: null,
            amount: "0.001",
            count: 1,
          },
        ],
      });

      expect(wallet.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
        network: { in: SANDBOX_NETWORKS },
      });
      const sent = rawCall();
      expect(sent.sql).toContain("p.payer_address IN (?)");
      expect(sent.sql).toContain("p.status <> 'FAILED'");
      expect(sent.sql).not.toContain("p.organization_id");
      expect(sent.values).toEqual(
        expect.arrayContaining([MY_WALLET, ...SANDBOX_NETWORKS]),
      );
      expect(payment.groupBy).toHaveBeenCalledTimes(1);
      const received = payment.groupBy.mock.calls[0][0].where;
      expect(received).toMatchObject({
        organizationId: ORG_ID,
        network: { in: SANDBOX_NETWORKS },
        status: { not: "FAILED" },
      });
      expect(received.payerAddress).toBeUndefined();
    });

    it("reads only production networks in production", async () => {
      await get("/me/finance/summary", { "x-environment": "production" });

      expect(wallet.findMany.mock.calls[0][0].where.network).toEqual({
        in: ["BASE"],
      });
      for (const [arg] of payment.groupBy.mock.calls) {
        expect(arg.where.network).toEqual({ in: ["BASE"] });
      }
      expect(rawCall().values).toEqual(expect.arrayContaining(["BASE"]));
      expect(rawCall().values).not.toContain("BASE_SEPOLIA");
      for (const [arg] of spendAuthorization.groupBy.mock.calls) {
        expect(arg.where).toMatchObject({
          organizationId: ORG_ID,
          environment: "PRODUCTION",
        });
      }
    });

    it("reports nothing sent without a wallet in the environment", async () => {
      wallet.findMany.mockResolvedValue([]);

      const res = await get("/me/finance/summary");

      expect(res.json().sent).toEqual([]);
      expect(payment.groupBy).toHaveBeenCalledTimes(1);
      expect(payment.groupBy.mock.calls[0][0].where.organizationId).toBe(
        ORG_ID,
      );
    });

    it("counts lapsed reservations as expired", async () => {
      spendAuthorization.groupBy.mockImplementation(async ({ where }) =>
        where.expiresAt
          ? [
              { status: "RESERVED", _count: { _all: 2 } },
              { status: "PENDING_APPROVAL", _count: { _all: 1 } },
            ]
          : [
              { status: "RESERVED", _count: { _all: 5 } },
              { status: "PENDING_APPROVAL", _count: { _all: 1 } },
              { status: "CONSUMED", _count: { _all: 7 } },
              { status: "DENIED", _count: { _all: 2 } },
              { status: "RELEASED", _count: { _all: 1 } },
              { status: "EXPIRED", _count: { _all: 4 } },
            ],
      );

      const res = await get("/me/finance/summary");

      expect(res.json().authorizations).toEqual({
        reserved: 3,
        pendingApproval: 0,
        consumed: 7,
        denied: 2,
        released: 1,
        expired: 7,
      });
      const lapsed = spendAuthorization.groupBy.mock.calls.find(
        ([arg]) => arg.where.expiresAt,
      )?.[0].where;
      expect(lapsed).toMatchObject({
        organizationId: ORG_ID,
        environment: "SANDBOX",
        status: { in: ["RESERVED", "PENDING_APPROVAL"] },
      });
    });
  });

  describe("usage", () => {
    it("groups received payments by the payment's agent", async () => {
      queryRaw.mockResolvedValue([
        {
          key: AGENT_A,
          network: "BASE_SEPOLIA",
          asset_address: USDC,
          amount: decimal("9"),
          count: 3n,
        },
        {
          key: null,
          network: "BASE_SEPOLIA",
          asset_address: USDC,
          amount: decimal("1"),
          count: 1n,
        },
        {
          key: "019fce62-0000-7000-8000-0000000000ff",
          network: "BASE_SEPOLIA",
          asset_address: null,
          amount: decimal("0.5"),
          count: 2n,
        },
      ]);
      agent.findMany.mockResolvedValue([{ id: AGENT_A, name: "Scout" }]);

      const res = await get(
        "/me/finance/usage?groupBy=agent&direction=received",
      );

      expect(res.statusCode).toBe(200);
      expect(res.json().items).toEqual([
        {
          key: AGENT_A,
          label: "Scout",
          network: "BASE_SEPOLIA",
          assetAddress: USDC,
          amount: "9",
          count: 3,
        },
        {
          key: null,
          label: "Unattributed",
          network: "BASE_SEPOLIA",
          assetAddress: USDC,
          amount: "1",
          count: 1,
        },
        {
          key: "019fce62-0000-7000-8000-0000000000ff",
          label: "019fce62-0000-7000-8000-0000000000ff",
          network: "BASE_SEPOLIA",
          assetAddress: null,
          amount: "0.5",
          count: 2,
        },
      ]);

      const query = rawCall();
      expect(query.sql).toContain("SELECT p.agent_id AS key");
      expect(query.sql).toContain("p.organization_id = ?");
      expect(query.sql).toContain("p.status <> 'FAILED'");
      expect(query.sql).not.toContain("spend_authorizations");
      expect(query.values).toEqual(
        expect.arrayContaining([ORG_ID, ...SANDBOX_NETWORKS]),
      );
      expect(wallet.findMany).not.toHaveBeenCalled();
      expect(agent.findMany.mock.calls[0][0].where).toEqual({
        id: { in: [AGENT_A, "019fce62-0000-7000-8000-0000000000ff"] },
        organizationId: ORG_ID,
      });
    });

    it.each([
      ["project", "p.project_id"],
      ["api_key", "p.api_key_id"],
      ["listing", "p.listing_id"],
      ["recipient", "p.payer_address"],
    ])("groups received payments by %s", async (groupBy, column) => {
      await get(`/me/finance/usage?groupBy=${groupBy}&direction=received`);

      expect(rawCall().sql).toContain(`SELECT ${column} AS key`);
    });

    it("attributes sent payments to the authorization they were matched to", async () => {
      queryRaw.mockResolvedValue([
        {
          key: PROJECT_A,
          network: "BASE_SEPOLIA",
          asset_address: USDC,
          amount: decimal("4"),
          count: 2n,
        },
        {
          key: null,
          network: "BASE_SEPOLIA",
          asset_address: USDC,
          amount: decimal("3"),
          count: 1n,
        },
      ]);
      labelRows = [{ id: PROJECT_A, name: "Checkout" }];

      const res = await get("/me/finance/usage?groupBy=project&direction=sent");

      expect(
        res.json().items.map((item: { label: string }) => item.label),
      ).toEqual(["Checkout", "Unattributed"]);

      const query = rawCall();
      expect(query.sql).toContain("SELECT a.project_id AS key");
      expect(query.sql).toContain("LEFT JOIN LATERAL");
      expect(query.sql).toContain("a.organization_id = ?");
      expect(query.sql).toContain("a.payment_id = p.id OR a.req_id = p.req_id");
      expect(query.sql).toContain("p.payer_address IN (?)");
      expect(query.values).toEqual(
        expect.arrayContaining([ORG_ID, MY_WALLET, ...SANDBOX_NETWORKS]),
      );
      expect(labelLookups()[0]?.[0].where).toEqual({
        id: { in: [PROJECT_A] },
        organizationId: ORG_ID,
      });
    });

    it.each([
      ["agent", "a.agent_id"],
      ["api_key", "a.issued_by_key_id"],
      ["recipient", "p.recipient_address"],
    ])("groups sent payments by %s", async (groupBy, column) => {
      await get(`/me/finance/usage?groupBy=${groupBy}&direction=sent`);

      expect(rawCall().sql).toContain(`SELECT ${column} AS key`);
    });

    it("labels a recipient with its address and looks nothing up", async () => {
      queryRaw.mockResolvedValue([
        {
          key: OTHER_WALLET,
          network: "BASE_SEPOLIA",
          asset_address: null,
          amount: decimal("1"),
          count: 1n,
        },
      ]);

      const res = await get("/me/finance/usage?groupBy=recipient");

      expect(res.json().items[0]).toMatchObject({
        key: OTHER_WALLET,
        label: OTHER_WALLET,
      });
      for (const model of [agent, apiKey, apiListing]) {
        expect(model.findMany).not.toHaveBeenCalled();
      }
      expect(labelLookups()).toEqual([]);
    });

    it("refuses listing grouping for sent payments", async () => {
      const res = await get("/me/finance/usage?groupBy=listing&direction=sent");

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("groupBy");
    });

    it("reports nothing sent without a wallet in the environment", async () => {
      wallet.findMany.mockResolvedValue([]);

      const res = await get("/me/finance/usage");

      expect(res.json()).toEqual({ items: [] });
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("reconciliation", () => {
    it("splits matched, unreported and unauthorized spend", async () => {
      spendAuthorization.findMany.mockResolvedValue([
        storedAuthorization(),
        storedAuthorization({
          id: "auth_2",
          status: "RESERVED",
          expiresAt: new Date("2020-01-01T00:00:00Z"),
        }),
      ]);
      queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join("?").includes("AS matched")
          ? [{ matched: 4n }]
          : [
              {
                id: "pay_9",
                req_id: "0x09",
                network: "BASE_SEPOLIA",
                asset_address: USDC,
                amount: decimal("7"),
                payer_address: MY_WALLET,
                recipient_address: OTHER_WALLET,
                status: "SETTLED",
                created_at: new Date("2026-11-21T00:00:00Z"),
              },
            ],
      );

      const res = await get("/me/finance/reconciliation");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.matched).toBe(4);
      expect(body.authorizedNotReported).toMatchObject([
        { id: "auth_1", status: "CONSUMED", amount: "2.5" },
        { id: "auth_2", status: "EXPIRED" },
      ]);
      expect(body.reportedNotAuthorized).toEqual([
        {
          id: "pay_9",
          reqId: "0x09",
          network: "BASE_SEPOLIA",
          assetAddress: USDC,
          amount: "7",
          payerAddress: MY_WALLET,
          recipientAddress: OTHER_WALLET,
          status: "SETTLED",
          createdAt: "2026-11-21T00:00:00.000Z",
        },
      ]);

      const where = spendAuthorization.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        organizationId: ORG_ID,
        environment: "SANDBOX",
        paymentId: null,
        OR: [{ status: "CONSUMED" }, { status: "RESERVED" }],
      });
      expect(where.OR[1].expiresAt.lt).toBeInstanceOf(Date);

      const unauthorized = queryRaw.mock.calls.findIndex(([strings]) =>
        (strings as TemplateStringsArray).join("?").includes("NOT EXISTS"),
      );
      const query = rawCall(unauthorized);
      expect(query.sql).toContain("p.payer_address IN (?)");
      expect(query.values).toEqual(
        expect.arrayContaining([ORG_ID, MY_WALLET, ...SANDBOX_NETWORKS, 500]),
      );
    });

    it("still lists unreported authorizations without a wallet", async () => {
      wallet.findMany.mockResolvedValue([]);
      spendAuthorization.findMany.mockResolvedValue([storedAuthorization()]);

      const res = await get("/me/finance/reconciliation");

      expect(res.json()).toMatchObject({
        matched: 0,
        authorizedNotReported: [{ id: "auth_1" }],
        reportedNotAuthorized: [],
      });
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe("payments export", () => {
    it("streams the environment's payments as an escaped CSV attachment", async () => {
      queryRaw.mockResolvedValue([
        storedPayment(),
        storedPayment({
          id: "pay_2",
          payer_address: OTHER_WALLET,
          recipient_address: MY_WALLET,
          description: "+SUM(1)",
          resource: null,
          settled_at: null,
          status: "PENDING",
        }),
      ]);

      const res = await get(
        "/me/finance/export/payments.csv?from=2026-11-01&to=2026-11-30",
      );

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(res.headers["content-disposition"]).toBe(
        'attachment; filename="payments-sandbox-2026-11-01-2026-11-30.csv"',
      );
      expect(res.headers["x-truncated"]).toBe("false");

      const lines = res.body.split("\r\n");
      expect(lines[0]).toBe(
        "id,created_at,settled_at,direction,status,network,asset_address,amount,payer_address,recipient_address,req_id,tx_hash,project_id,agent_id,listing_id,api_key_id,description,resource,failure_reason",
      );
      expect(lines[1]).toBe(
        `pay_1,2026-11-20T00:00:00.000Z,2026-11-20T00:00:05.000Z,sent,SETTLED,BASE_SEPOLIA,${USDC},1.5,${MY_WALLET},${OTHER_WALLET},0xabc,,${PROJECT_A},,,,'=cmd|' /C calc'!A0,"https://api.example.com/a,b",`,
      );
      expect(lines[2]).toContain(",received,PENDING,");
      expect(lines[2]).toContain(",'+SUM(1),,");
      expect(lines[3]).toBe("");

      const query = rawCall();
      expect(query.sql).toContain("p.payer_address IN (?)");
      expect(query.sql).toContain("p.organization_id = ?");
      expect(query.sql).toContain(" OR ");
      expect(query.sql).toContain("ORDER BY p.created_at ASC, p.id ASC");
      expect(query.sql).not.toContain("FAILED");
      expect(query.values).toEqual(
        expect.arrayContaining([
          ORG_ID,
          MY_WALLET,
          ...SANDBOX_NETWORKS,
          new Date("2026-11-01T00:00:00.000Z"),
          new Date("2026-12-01T00:00:00.000Z"),
        ]),
      );
    });

    it("withholds the CSV when its audit entry cannot be saved", async () => {
      queryRaw.mockResolvedValue([storedPayment()]);
      tenancy.auditLog.create.mockRejectedValue(new Error("audit down"));

      const res = await get(
        "/me/finance/export/payments.csv?from=2026-11-01&to=2026-11-30&direction=sent",
        { "x-environment": "production" },
      );

      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain(MY_WALLET);
    });

    it("records the export with its filters", async () => {
      queryRaw.mockResolvedValue([storedPayment()]);

      await get(
        "/me/finance/export/payments.csv?from=2026-11-01&to=2026-11-30&direction=sent",
        { "x-environment": "production" },
      );

      expect(exported()).toEqual([
        expect.objectContaining({
          organizationId: ORG_ID,
          actorUserId: USER_ID,
          action: "report.exported",
          targetType: "report",
          targetId: "payments",
          metadata: {
            report: "payments",
            environment: "PRODUCTION",
            filters: {
              from: "2026-11-01T00:00:00.000Z",
              to: "2026-12-01T00:00:00.000Z",
              direction: "sent",
            },
            rows: 1,
            truncated: false,
          },
        }),
      ]);
      const query = rawCall();
      expect(query.sql).toContain("p.payer_address IN (?)");
      expect(query.sql).not.toContain("p.organization_id = ?");
      expect(query.values).toEqual(expect.arrayContaining(["BASE", MY_WALLET]));
    });

    it("exports received payments by the reporting organization only", async () => {
      await get("/me/finance/export/payments.csv?direction=received");

      const query = rawCall();
      expect(query.sql).toContain("p.organization_id = ?");
      expect(query.sql).not.toContain("payer_address IN");
      expect(wallet.findMany).not.toHaveBeenCalled();
    });

    it("stops at 50,000 rows and says so", async () => {
      queryRaw.mockImplementation(async (...args: unknown[]) => {
        const take = args.at(-1) as number;
        return Array.from({ length: take }, (_, index) =>
          storedPayment({
            id: `pay_${index}`,
            description: null,
            created_at: new Date(Date.UTC(2026, 10, 20, 0, 0, index % 60)),
          }),
        );
      });

      const res = await get("/me/finance/export/payments.csv");

      expect(res.headers["x-truncated"]).toBe("true");
      expect(res.body.split("\r\n").filter(Boolean)).toHaveLength(50_001);
      expect(queryRaw).toHaveBeenCalledTimes(11);
      expect(rawCall(0).sql).not.toContain("(p.created_at, p.id) >");
      const second = rawCall(1);
      expect(second.sql).toContain("(p.created_at, p.id) > (?, ?)");
      expect(second.values).toEqual(expect.arrayContaining(["pay_4999"]));
      expect(exported()[0].metadata).toMatchObject({
        rows: 50_000,
        truncated: true,
      });
    });
  });

  describe("restricted projects", () => {
    const HIDDEN = "019fce62-0000-7000-8000-0000000000f9";
    const sqlOf = (marker: string) =>
      queryRaw.mock.calls
        .map((_, index) => rawCall(index))
        .find((query) => query.sql.includes(marker));
    const restrict = () => {
      accessRows = [
        { id: PROJECT_A, restricted: false, members: [] },
        { id: HIDDEN, restricted: true, members: [] },
      ];
    };

    it("filters received payments by project and keeps unattributed ones", async () => {
      restrict();
      await get("/me/finance/usage?groupBy=agent&direction=received");
      await get("/me/finance/summary");

      const usage = rawCall(0);
      expect(usage.sql).toContain(
        "(p.project_id IS NULL OR p.project_id IN (?))",
      );
      expect(usage.values).toContain(PROJECT_A);
      expect(usage.values).not.toContain(HIDDEN);

      const received = payment.groupBy.mock.calls[0][0].where;
      expect(received.AND).toEqual([
        { OR: [{ projectId: null }, { projectId: { in: [PROJECT_A] } }] },
      ]);
    });

    it("drops sent payments matched to an authorization of a hidden project", async () => {
      restrict();
      queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join("?").includes("AS matched") ? [{ matched: 0n }] : [],
      );
      await get("/me/finance/usage?groupBy=project&direction=sent");
      await get("/me/finance/summary");
      await get("/me/finance/reconciliation");

      for (const marker of [
        "LEFT JOIN LATERAL",
        "GROUP BY 1, 2\n",
        "AS matched",
      ]) {
        const query = sqlOf(marker);
        expect(query?.sql, marker).toContain("a.project_id NOT IN (?)");
        expect(query?.values, marker).toContain(PROJECT_A);
        expect(query?.values, marker).not.toContain(HIDDEN);
      }
    });

    it("counts and lists only visible authorizations", async () => {
      restrict();
      await get("/me/finance/summary");
      await get("/me/finance/reconciliation");

      for (const [arg] of spendAuthorization.groupBy.mock.calls) {
        expect(arg.where.projectId).toEqual({ in: [PROJECT_A] });
      }
      expect(
        spendAuthorization.findMany.mock.calls[0][0].where.projectId,
      ).toEqual({ in: [PROJECT_A] });
    });

    it("applies the same filter to both CSV exports", async () => {
      actAs(tenancy, "FINANCE");
      restrict();
      await get("/me/finance/export/payments.csv");
      await get(
        "/me/finance/export/usage.csv?groupBy=agent&direction=received",
      );

      const payments = sqlOf("p.failure_reason");
      expect(payments?.sql).toContain(
        "p.project_id IS NULL OR p.project_id IN (?)",
      );
      expect(payments?.sql).toContain("a.project_id NOT IN (?)");
      expect(payments?.values).not.toContain(HIDDEN);
      const usage = sqlOf("SELECT p.agent_id AS key");
      expect(usage?.sql).toContain(
        "p.project_id IS NULL OR p.project_id IN (?)",
      );
    });

    it("leaves a caller with no visible project only unattributed rows", async () => {
      accessRows = [{ id: HIDDEN, restricted: true, members: [] }];
      await get("/me/finance/usage?groupBy=agent&direction=received");

      expect(rawCall().sql).toContain("p.project_id IS NULL");
      expect(rawCall().values).not.toContain(HIDDEN);
    });

    it.each([
      "OWNER",
      "ADMIN",
    ] as const)("shows a plain %s every project", async (role) => {
      actAs(tenancy, role);
      restrict();
      await get("/me/finance/usage?groupBy=agent&direction=received");
      await get("/me/finance/usage?groupBy=project&direction=sent");

      for (const index of [0, 1]) {
        expect(rawCall(index).sql).not.toContain("project_id IN");
        expect(rawCall(index).sql).not.toContain("project_id NOT IN");
      }
      expect(
        project.findMany.mock.calls.filter(([arg]) => arg.select.restricted),
      ).toEqual([]);
    });
  });

  describe("usage export", () => {
    it("exports the grouped spend and records the export", async () => {
      queryRaw.mockResolvedValue([
        {
          key: null,
          network: "BASE_SEPOLIA",
          asset_address: null,
          amount: decimal("3"),
          count: 1n,
        },
      ]);

      const res = await get(
        "/me/finance/export/usage.csv?groupBy=agent&direction=received&from=2026-11-01&to=2026-11-07",
      );

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-disposition"]).toBe(
        'attachment; filename="usage-received-by-agent-sandbox-2026-11-01-2026-11-07.csv"',
      );
      expect(res.body).toBe(
        "key,label,network,asset_address,amount,count\r\n,Unattributed,BASE_SEPOLIA,,3,1\r\n",
      );
      expect(exported()[0]).toMatchObject({
        targetId: "usage",
        metadata: {
          report: "usage",
          filters: { groupBy: "agent", direction: "received" },
          rows: 1,
        },
      });
    });
  });
});
