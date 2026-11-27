import { clearUserCache } from "@auth/user-store";
import { spendingPolicyRoutes } from "@routes/spending-policies";
import { payloadHash } from "@utils/canonical";
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
} from "@/test-support/tenancy";

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

const NOW = new Date("2026-11-27T12:00:00.000Z");
const USER_ID = "019fce62-0000-7000-8000-000000000000";
const AGENT_ID = "019fce62-0000-7000-8000-0000000000c1";
const KEY_ID = "019fce62-0000-7000-8000-0000000000f1";
const APPROVAL_ID = "019fce62-9999-7000-8000-0000000000a1";
const USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const AUTH = { authorization: "Bearer good" };
const ACTION = "spending_policy.change";

let app: Awaited<ReturnType<typeof initApp>>;

const send = (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
  headers: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    headers: { ...AUTH, ...headers },
    ...(payload ? { payload } : {}),
  });

const valid = (over: Record<string, unknown> = {}) => ({
  name: "Research budget",
  scope: "ORGANIZATION",
  network: "BASE_SEPOLIA",
  assetAddress: USDC,
  dailyLimit: "100",
  ...over,
});

const governOn = () =>
  h.db.governanceSettings.seed({
    organizationId: ORG_ID,
    approvalsRequired: 1,
    governedActions: [ACTION],
  });

const approve = (payload: unknown) =>
  h.db.approvalRequest.seed({
    id: APPROVAL_ID,
    organizationId: ORG_ID,
    kind: "GOVERNANCE",
    action: ACTION,
    payloadHash: payloadHash(ACTION, payload),
    requestedById: USER_ID,
    status: "APPROVED",
    expiresAt: new Date(NOW.getTime() + 3_600_000),
  });

const seedPolicy = (over: Record<string, unknown> = {}) =>
  h.db.spendingPolicy.seed({
    organizationId: ORG_ID,
    name: "Existing",
    scope: "ORGANIZATION",
    network: "BASE_SEPOLIA",
    assetAddress: USDC,
    dailyLimit: "100",
    ...over,
  })[0] as Record<string, unknown>;

const actions = () =>
  h.db.auditLog.create.mock.calls.map(
    ([arg]) => (arg as { data: { action: string } }).data.action,
  );

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  app = await initApp([{ plugin: spendingPolicyRoutes }]);
});

afterAll(async () => {
  await app.close();
  vi.useRealTimers();
});

beforeEach(() => {
  h.db.reset();
  clearUserCache();
  actAs(h.db.tenancy, "FINANCE");
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
});

describe("spending policy CRUD", () => {
  it("creates a policy for a finance member and audits it", async () => {
    const res = await send("POST", "/me/spending-policies", valid());
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: "Research budget",
      scope: "ORGANIZATION",
      mode: "ENFORCE",
      dailyLimit: "100",
      approvalsRequired: 1,
      alertThresholds: [80, 100],
      frozen: false,
      usage: {
        asset: { network: "BASE_SEPOLIA", assetAddress: USDC },
        spentToday: "0",
        spentThisMonth: "0",
        reserved: "0",
      },
    });
    expect(h.db.spendingPolicy.rows[0]).toMatchObject({
      organizationId: ORG_ID,
      createdById: USER_ID,
    });
    expect(actions()).toContain("spending_policy.created");
  });

  it("forbids viewers and developers from writing", async () => {
    for (const role of ["VIEWER", "DEVELOPER"] as const) {
      actAs(h.db.tenancy, role);
      expect(
        (await send("POST", "/me/spending-policies", valid())).statusCode,
      ).toBe(403);
    }
    expect(h.db.spendingPolicy.rows).toEqual([]);
  });

  it("requires a network for amount limits and a target for scoped policies", async () => {
    const noNetwork = await send(
      "POST",
      "/me/spending-policies",
      valid({ network: null, assetAddress: null }),
    );
    expect(noNetwork.statusCode).toBe(400);
    expect(noNetwork.json().issues).toEqual([
      expect.objectContaining({ path: "dailyLimit" }),
    ]);

    const noTarget = await send(
      "POST",
      "/me/spending-policies",
      valid({ scope: "AGENT" }),
    );
    expect(noTarget.statusCode).toBe(400);
    expect(noTarget.json().issues[0].path).toBe("agentId");

    const stray = await send(
      "POST",
      "/me/spending-policies",
      valid({ projectId: PROJECT_ID }),
    );
    expect(stray.statusCode).toBe(400);
    expect(h.db.spendingPolicy.rows).toEqual([]);
  });

  it("404s targets outside the organization or invisible to the caller", async () => {
    h.db.agent.seed({
      id: AGENT_ID,
      organizationId: OTHER_ORG_ID,
      projectId: OTHER_PROJECT_ID,
      project: { restricted: false, members: [] },
    });
    h.db.apiKey.findFirst.mockResolvedValue(null);
    for (const body of [
      valid({ scope: "PROJECT", projectId: OTHER_PROJECT_ID }),
      valid({ scope: "AGENT", agentId: AGENT_ID }),
      valid({ scope: "API_KEY", apiKeyId: KEY_ID }),
    ]) {
      expect(
        (await send("POST", "/me/spending-policies", body)).statusCode,
      ).toBe(404);
    }

    h.db.apiKey.findFirst.mockResolvedValue({
      id: KEY_ID,
      projectId: PROJECT_ID,
      project: { restricted: true, members: [] },
    });
    expect(
      (
        await send(
          "POST",
          "/me/spending-policies",
          valid({ scope: "API_KEY", apiKeyId: KEY_ID }),
        )
      ).statusCode,
    ).toBe(404);
    expect(h.db.spendingPolicy.rows).toEqual([]);
  });

  it("stores an agent policy with the agent's project", async () => {
    h.db.agent.seed({
      id: AGENT_ID,
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      project: { restricted: false, members: [] },
    });
    const res = await send(
      "POST",
      "/me/spending-policies",
      valid({ scope: "AGENT", agentId: AGENT_ID }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      agentId: AGENT_ID,
      projectId: PROJECT_ID,
      apiKeyId: null,
    });
  });

  it("lists with usage and filters, for any member", async () => {
    actAs(h.db.tenancy, "VIEWER");
    seedPolicy({ name: "A" });
    seedPolicy({ name: "B", mode: "MONITOR" });
    seedPolicy({ name: "gone", deletedAt: NOW });
    seedPolicy({ name: "foreign", organizationId: OTHER_ORG_ID });
    h.db.spendAuthorization.seed({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      amount: "7",
      status: "RESERVED",
      expiresAt: new Date(NOW.getTime() + 60_000),
    });

    const all = await send("GET", "/me/spending-policies");
    expect(all.json().items.map((p: { name: string }) => p.name)).toEqual([
      "A",
      "B",
    ]);
    expect(all.json().items[0].usage).toMatchObject({
      spentToday: "7",
      reserved: "7",
    });

    const monitor = await send("GET", "/me/spending-policies?mode=MONITOR");
    expect(monitor.json().items.map((p: { name: string }) => p.name)).toEqual([
      "B",
    ]);
  });

  it("updates, rejecting a change that leaves limits without a network", async () => {
    const policy = seedPolicy();
    const bad = await send("PATCH", `/me/spending-policies/${policy.id}`, {
      network: null,
    });
    expect(bad.statusCode).toBe(400);

    const ok = await send("PATCH", `/me/spending-policies/${policy.id}`, {
      dailyLimit: "50",
      allowedRecipients: ["0x6c5CC69E4C4863DbC3439Ab2673806ea7715eBD5"],
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      dailyLimit: "50",
      allowedRecipients: ["0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5"],
    });
  });

  it("soft-deletes and 404s a foreign or deleted policy", async () => {
    const foreign = seedPolicy({ organizationId: OTHER_ORG_ID });
    expect(
      (await send("DELETE", `/me/spending-policies/${foreign.id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await send("PATCH", `/me/spending-policies/${foreign.id}`, {
          name: "x",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await send("POST", `/me/spending-policies/${foreign.id}/freeze`))
        .statusCode,
    ).toBe(404);

    const policy = seedPolicy();
    expect(
      (await send("DELETE", `/me/spending-policies/${policy.id}`)).statusCode,
    ).toBe(204);
    expect(
      h.db.spendingPolicy.rows.find((row) => row.id === policy.id)?.deletedAt,
    ).toEqual(NOW);
    expect(
      (await send("DELETE", `/me/spending-policies/${policy.id}`)).statusCode,
    ).toBe(404);
  });
});

describe("governance", () => {
  it("returns 202 and changes nothing when spending_policy.change is governed", async () => {
    governOn();
    const res = await send("POST", "/me/spending-policies", valid());
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({
      status: "approval_required",
      approvalRequest: {
        kind: "GOVERNANCE",
        action: ACTION,
        status: "PENDING",
      },
    });
    expect(h.db.spendingPolicy.rows).toEqual([]);
  });

  it("applies the change with a valid X-Approval-Id, once", async () => {
    governOn();
    approve({
      op: "create",
      name: "Research budget",
      scope: "ORGANIZATION",
      projectId: null,
      agentId: null,
      apiKeyId: null,
      mode: "ENFORCE",
      network: "BASE_SEPOLIA",
      assetAddress: USDC,
      perPaymentLimit: null,
      dailyLimit: "100",
      monthlyLimit: null,
      approvalThreshold: null,
      approvalsRequired: 1,
      allowedRecipients: [],
      alertThresholds: [80, 100],
      enabled: true,
    });
    const headers = { "x-approval-id": APPROVAL_ID };

    const different = await send(
      "POST",
      "/me/spending-policies",
      valid({ dailyLimit: "1000" }),
      headers,
    );
    expect(different.statusCode).toBe(409);
    expect(different.json().error).toBe("approval_invalid");

    const res = await send("POST", "/me/spending-policies", valid(), headers);
    expect(res.statusCode).toBe(201);
    expect(h.db.spendingPolicy.rows).toHaveLength(1);

    const replay = await send(
      "POST",
      "/me/spending-policies",
      valid(),
      headers,
    );
    expect(replay.statusCode).toBe(409);
    expect(h.db.spendingPolicy.rows).toHaveLength(1);
  });

  it("governs updates, deletes and unfreezes, but freezes immediately", async () => {
    governOn();
    const policy = seedPolicy();

    expect(
      (
        await send("PATCH", `/me/spending-policies/${policy.id}`, {
          dailyLimit: "1",
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (await send("DELETE", `/me/spending-policies/${policy.id}`)).statusCode,
    ).toBe(202);

    const frozen = await send(
      "POST",
      `/me/spending-policies/${policy.id}/freeze`,
    );
    expect(frozen.statusCode).toBe(200);
    expect(frozen.json()).toMatchObject({
      frozen: true,
      frozenAt: NOW.toISOString(),
    });
    expect(actions()).toContain("spending_policy.frozen");

    expect(
      (await send("POST", `/me/spending-policies/${policy.id}/unfreeze`))
        .statusCode,
    ).toBe(202);
    expect(h.db.spendingPolicy.rows[0]).toMatchObject({
      dailyLimit: "100",
      deletedAt: null,
      frozenAt: NOW,
    });

    approve({ op: "unfreeze", policyId: policy.id });
    const unfrozen = await send(
      "POST",
      `/me/spending-policies/${policy.id}/unfreeze`,
      undefined,
      {
        "x-approval-id": APPROVAL_ID,
      },
    );
    expect(unfrozen.statusCode).toBe(200);
    expect(unfrozen.json().frozen).toBe(false);
  });
});
