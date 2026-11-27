import { clearUserCache } from "@auth/user-store";
import { financeAlertRoutes } from "@routes/finance-alerts";
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
import { actAs, ORG_ID, OTHER_ORG_ID } from "@/test-support/tenancy";
import { notifyFinance } from "./notify";
import { raiseAlerts } from "./repository";

const h = vi.hoisted(() => {
  process.env.RATE_LIMIT_ENABLED = "false";
  return {
    db: null as unknown as SpendDb,
    authenticateRequest: vi.fn(),
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: h.authenticateRequest,
    users: { getUser: vi.fn() },
  })),
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

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const AUTH = { authorization: "Bearer good" };

let app: Awaited<ReturnType<typeof initApp>>;

const alert = (over: Record<string, unknown> = {}) => ({
  orgId: ORG_ID,
  kind: "BUDGET_THRESHOLD" as const,
  title: "Daily budget 80% used: Org",
  detail: { lines: ["Spent today: 80 of 100 USDC"] },
  dedupeKey: "budget:p:daily:2026-11-27:80",
  ...over,
});

beforeAll(async () => {
  app = await initApp([{ plugin: financeAlertRoutes }]);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  h.db.reset();
  clearUserCache();
  actAs(h.db.tenancy, "VIEWER");
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
  h.db.user.upsert.mockResolvedValue({
    id: USER_ID,
    clerkUserId: "user_123",
    email: "ada@example.com",
    name: "Ada",
    avatarUrl: null,
    banned: false,
    locked: false,
    deletedAt: null,
  });
  h.db.user.findMany.mockResolvedValue([{ id: USER_ID, name: "Ada" }]);
});

describe("raiseAlerts", () => {
  it("dedupes on organization and key", async () => {
    const db = h.db.prisma as never;
    expect(await raiseAlerts(db, [alert()])).toHaveLength(1);
    expect(await raiseAlerts(db, [alert()])).toEqual([]);
    expect(
      await raiseAlerts(db, [alert({ orgId: OTHER_ORG_ID })]),
    ).toHaveLength(1);
    expect(
      await raiseAlerts(db, [
        alert({ dedupeKey: "budget:p:daily:2026-11-28:80" }),
      ]),
    ).toHaveLength(1);
    expect(h.db.financialAlert.rows).toHaveLength(3);
  });
});

describe("notifyFinance", () => {
  const send = vi.fn();
  const email = { sendFinancialAlert: send } as never;

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ id: "msg" });
    h.db.organization.findUnique.mockResolvedValue({
      name: "Northwind",
      handle: "nw",
    });
    h.db.membership.findMany.mockResolvedValue([
      {
        user: {
          name: "Fin",
          email: "fin@example.com",
          emailVerified: true,
          deletedAt: null,
        },
      },
      {
        user: {
          name: "Unverified",
          email: "u@example.com",
          emailVerified: false,
          deletedAt: null,
        },
      },
    ]);
  });

  it("emails verified finance managers when no recipients are chosen", async () => {
    const rows = await raiseAlerts(h.db.prisma as never, [alert()]);
    await notifyFinance(email, ORG_ID, rows);

    expect(h.db.membership.findMany.mock.calls[0]?.[0].where).toEqual({
      organizationId: ORG_ID,
      role: { in: ["OWNER", "ADMIN", "FINANCE"] },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: "fin@example.com",
      workspaceName: "Northwind",
      title: "Daily budget 80% used: Org",
      lines: ["Spent today: 80 of 100 USDC"],
      dashboardUrl: "http://app.test/finance/alerts",
    });
  });

  it("uses the chosen finance recipients when set", async () => {
    h.db.governanceSettings.seed({
      organizationId: ORG_ID,
      financeRecipientIds: [USER_ID],
    });
    await notifyFinance(
      email,
      ORG_ID,
      await raiseAlerts(h.db.prisma as never, [alert()]),
    );
    expect(h.db.membership.findMany.mock.calls[0]?.[0].where).toEqual({
      organizationId: ORG_ID,
      userId: { in: [USER_ID] },
    });
  });

  it("never throws", async () => {
    send.mockRejectedValue(new Error("down"));
    await expect(
      notifyFinance(
        email,
        ORG_ID,
        await raiseAlerts(h.db.prisma as never, [alert()]),
      ),
    ).resolves.toBeUndefined();
    await expect(notifyFinance(null, ORG_ID, [])).resolves.toBeUndefined();
  });
});

describe("alert routes", () => {
  it("lists the org's alerts newest first with filters", async () => {
    h.db.financialAlert.seed(
      {
        id: "019fce62-0000-7000-8000-000000000a01",
        organizationId: ORG_ID,
        kind: "POLICY_DENIAL",
        title: "a",
        detail: {},
      },
      {
        id: "019fce62-0000-7000-8000-000000000a02",
        organizationId: ORG_ID,
        kind: "BUDGET_THRESHOLD",
        title: "b",
        detail: {},
        acknowledgedAt: new Date(),
        acknowledgedById: USER_ID,
      },
      {
        id: "019fce62-0000-7000-8000-000000000a03",
        organizationId: OTHER_ORG_ID,
        kind: "POLICY_DENIAL",
        title: "c",
        detail: {},
      },
    );

    const all = await app.inject({
      method: "GET",
      url: "/me/finance/alerts",
      headers: AUTH,
    });
    expect(all.statusCode).toBe(200);
    expect(
      all
        .json()
        .items.map((a: { title: string }) => a.title)
        .sort(),
    ).toEqual(["a", "b"]);

    const open = await app.inject({
      method: "GET",
      url: "/me/finance/alerts?acknowledged=false",
      headers: AUTH,
    });
    expect(open.json().items.map((a: { title: string }) => a.title)).toEqual([
      "a",
    ]);

    const acked = await app.inject({
      method: "GET",
      url: "/me/finance/alerts?acknowledged=true",
      headers: AUTH,
    });
    expect(acked.json().items[0].acknowledgedBy).toEqual({
      id: USER_ID,
      name: "Ada",
    });
  });

  it("acknowledges for finance managers only, and 404s foreign alerts", async () => {
    const [mine, foreign] = h.db.financialAlert.seed(
      { organizationId: ORG_ID, kind: "POLICY_DENIAL", title: "a", detail: {} },
      {
        organizationId: OTHER_ORG_ID,
        kind: "POLICY_DENIAL",
        title: "c",
        detail: {},
      },
    );
    const ack = (id: unknown) =>
      app.inject({
        method: "POST",
        url: `/me/finance/alerts/${id}/acknowledge`,
        headers: AUTH,
      });

    expect((await ack(mine?.id)).statusCode).toBe(403);

    actAs(h.db.tenancy, "FINANCE");
    const res = await ack(mine?.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().acknowledgedBy).toEqual({ id: USER_ID, name: "Ada" });
    expect((await ack(foreign?.id)).statusCode).toBe(404);
    expect(h.db.financialAlert.rows[1]?.acknowledgedAt).toBeNull();
  });
});
