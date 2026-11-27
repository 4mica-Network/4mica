import type { OrgRole } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { complianceReportRoutes } from "@routes/compliance-report";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { ORG_ID } from "@/test-support/tenancy";
import { buildReport, type ClerkIdentity } from "./report";
import type { ComplianceSnapshot } from "./repository";

const { authenticateRequest, getUserList, db } = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
  });
  return {
    authenticateRequest: vi.fn(),
    getUserList: vi.fn(),
    db: {
      organization: model(),
      membership: model(),
      customRole: model(),
      project: model(),
      apiKey: model(),
      cliSession: model(),
      scimToken: model(),
      ssoConnection: model(),
      spendingPolicy: model(),
      governanceSettings: model(),
      approvalRequest: model(),
      auditStream: model(),
      securitySettings: model(),
      auditLog: model(),
      user: model(),
    },
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUserList, getUser: vi.fn() },
  })),
}));

vi.mock("@4mica/db", () => ({ prisma: db, disconnect: vi.fn(async () => {}) }));

const NOW = new Date("2026-11-27T12:00:00Z");
const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

const member = (
  clerkUserId: string,
  role: OrgRole = "DEVELOPER",
  suspended = false,
) => ({
  role,
  suspendedAt: suspended ? daysAgo(1) : null,
  customRole: null,
  user: { id: `u-${clerkUserId}`, clerkUserId },
});

type KeyRow = ComplianceSnapshot["apiKeys"][number];

const key = (over: Partial<KeyRow> = {}): KeyRow => ({
  id: "key-1",
  name: "Checkout",
  scopes: ["PAYMENTS_WRITE"],
  createdAt: daysAgo(10),
  lastUsedAt: daysAgo(1),
  expiresAt: null,
  ipAllowlist: ["203.0.113.0/24"],
  environment: { kind: "PRODUCTION" },
  serviceAccount: null,
  ...over,
});

const snapshot = (over: Partial<ComplianceSnapshot> = {}): ComplianceSnapshot =>
  ({
    organization: { id: ORG_ID, name: "Acme", handle: "acme", personal: false },
    memberships: [member("c1", "OWNER"), member("c2", "OWNER")],
    customRoles: [],
    projects: [],
    apiKeys: [key()],
    cliSessions: 2,
    scimTokens: 1,
    ssoConnections: [
      { clerkConnectionId: "saml_1", active: true, enforced: true },
    ],
    policies: [{ enabled: true, mode: "ENFORCE", frozenAt: null }],
    governance: {
      approvalsRequired: 1,
      governedActions: ["member.role_grant"],
      auditRetentionDays: null,
    },
    approvals: [
      { status: "APPROVED", _count: { _all: 3 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ],
    streams: [{ status: "ACTIVE" }],
    security: {
      requireMfa: true,
      sessionMaxAgeHours: 12,
      reauthWindowMinutes: 15,
      ipAllowlist: ["203.0.113.0/24"],
      enforceIpAllowlistForApiKeys: false,
    },
    ...over,
  }) as ComplianceSnapshot;

const strong = (): Map<string, ClerkIdentity> =>
  new Map([
    ["c1", { twoFactorEnabled: true, samlConnectionIds: ["saml_1"] }],
    ["c2", { twoFactorEnabled: true, samlConnectionIds: ["saml_1"] }],
  ]);

const statusOf = (report: ReturnType<typeof buildReport>, id: string) =>
  report.checks.find((check) => check.id === id)?.status;

describe("compliance checks", () => {
  it("passes every check for a well-run organization", () => {
    const report = buildReport(snapshot(), strong(), NOW);

    expect(report.checks.filter((check) => check.status !== "pass")).toEqual(
      [],
    );
    expect(report.identity.mfa).toEqual({
      enrolled: 2,
      unknown: 0,
      percent: 100,
    });
    expect(report.identity.sso.percent).toBe(100);
    expect(report.financial.approvalStats30d).toMatchObject({
      total: 4,
      approved: 3,
      rejected: 1,
    });
  });

  it("warns where controls are merely missing", () => {
    const report = buildReport(
      snapshot({
        memberships: [member("c1", "OWNER")],
        ssoConnections: [],
        policies: [],
        governance: null,
        streams: [],
        security: {
          requireMfa: false,
          sessionMaxAgeHours: null,
          reauthWindowMinutes: 15,
          ipAllowlist: [],
          enforceIpAllowlistForApiKeys: false,
        },
        apiKeys: [key({ ipAllowlist: [], createdAt: daysAgo(120) })],
      }),
      strong(),
      NOW,
    );

    for (const id of [
      "mfa_required",
      "sso_enforced",
      "owner_redundancy",
      "ip_allowlist",
      "session_max_age",
      "api_key_rotation",
      "api_key_ip_restriction",
      "governance",
      "spending_policies",
      "audit_streaming",
    ]) {
      expect(statusOf(report, id), id).toBe("warn");
    }
  });

  it("fails members without a second factor, ancient keys and dead streams", () => {
    const identities = strong();
    identities.set("c2", { twoFactorEnabled: false, samlConnectionIds: [] });

    const report = buildReport(
      snapshot({
        apiKeys: [key({ createdAt: daysAgo(400) })],
        streams: [{ status: "PAUSED" }, { status: "FAILING" }],
      } as Partial<ComplianceSnapshot>),
      identities,
      NOW,
    );

    expect(statusOf(report, "mfa_coverage")).toBe("fail");
    expect(statusOf(report, "api_key_rotation")).toBe("fail");
    expect(statusOf(report, "audit_streaming")).toBe("fail");
    expect(report.identity.mfa.percent).toBe(50);
    expect(report.identity.sso.percent).toBe(50);
  });

  it("marks MFA unknown, not failed, when Clerk could not answer", () => {
    const report = buildReport(snapshot(), new Map(), NOW);

    expect(report.identity.mfa).toEqual({
      enrolled: 0,
      unknown: 2,
      percent: null,
    });
    expect(statusOf(report, "mfa_coverage")).toBe("warn");
  });

  it("ignores suspended members for coverage and counts them apart", () => {
    const report = buildReport(
      snapshot({
        memberships: [
          member("c1", "OWNER"),
          member("c2", "OWNER"),
          member("c3", "VIEWER", true),
        ],
      }),
      strong(),
      NOW,
    );

    expect(report.identity.suspended).toBe(1);
    expect(report.identity.byRole).toMatchObject({ OWNER: 2, VIEWER: 1 });
    expect(statusOf(report, "mfa_coverage")).toBe("pass");
  });

  it("flags stale keys and shows key age and network restriction", () => {
    const report = buildReport(
      snapshot({
        apiKeys: [key({ createdAt: daysAgo(100), lastUsedAt: daysAgo(95) })],
      }),
      strong(),
      NOW,
    );

    expect(statusOf(report, "api_key_usage")).toBe("warn");
    expect(report.credentials.apiKeys[0]).toMatchObject({
      ageDays: 100,
      ipRestricted: true,
      environment: "PRODUCTION",
    });
  });
});

describe("compliance report routes", () => {
  const HEADERS = { authorization: "Bearer good", "x-org-id": ORG_ID };

  const actAs = (role: string) => {
    db.membership.findFirst.mockResolvedValue({
      role,
      suspendedAt: null,
      customRole: null,
      organization: { id: ORG_ID, personal: false },
    });
  };

  beforeEach(() => {
    for (const group of Object.values(db)) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    getUserList.mockReset();
    clearUserCache();
    authenticateRequest.mockResolvedValue({
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
      id: "019fce62-0000-7000-8000-000000000000",
      clerkUserId: "user_123",
      email: "ada@example.com",
      name: "Ada",
      avatarUrl: null,
      banned: false,
      locked: false,
      deletedAt: null,
    });
    db.auditLog.create.mockResolvedValue({ id: "audit" });
    actAs("ADMIN");

    db.organization.findUnique.mockResolvedValue({
      id: ORG_ID,
      name: "Acme",
      handle: "acme",
      personal: false,
    });
    db.membership.findMany.mockResolvedValue([
      member("c1", "OWNER"),
      member("c2", "ADMIN"),
    ]);
    db.customRole.findMany.mockResolvedValue([]);
    db.project.findMany.mockResolvedValue([]);
    db.apiKey.findMany.mockResolvedValue([key({ name: "=cmd|calc" })]);
    db.cliSession.count.mockResolvedValue(0);
    db.scimToken.count.mockResolvedValue(0);
    db.ssoConnection.findMany.mockResolvedValue([]);
    db.spendingPolicy.findMany.mockResolvedValue([]);
    db.governanceSettings.findUnique.mockResolvedValue(null);
    db.approvalRequest.groupBy.mockResolvedValue([]);
    db.auditStream.findMany.mockResolvedValue([]);
    db.securitySettings.findUnique.mockResolvedValue(null);
    getUserList.mockResolvedValue({
      data: [
        { id: "c1", twoFactorEnabled: true, samlAccounts: [] },
        { id: "c2", twoFactorEnabled: false, samlAccounts: [] },
      ],
      totalCount: 2,
    });
  });

  it("returns the report and records the export", async () => {
    const app = await initApp([{ plugin: complianceReportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/me/organization/compliance-report",
      headers: HEADERS,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.organization).toMatchObject({ id: ORG_ID, name: "Acme" });
    expect(body.identity.mfa).toEqual({ enrolled: 1, unknown: 0, percent: 50 });
    expect(
      body.checks.find((c: { id: string }) => c.id === "mfa_coverage").status,
    ).toBe("fail");
    expect(getUserList).toHaveBeenCalledWith({
      userId: ["c1", "c2"],
      limit: 100,
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "report.exported",
      targetId: "compliance",
      metadata: { report: "compliance", format: "json" },
    });
    await app.close();
  });

  it("asks Clerk in batches of 100 and treats a failed batch as unknown", async () => {
    db.membership.findMany.mockResolvedValue(
      Array.from({ length: 150 }, (_, i) => member(`c${i}`)),
    );
    getUserList
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => ({
          id: `c${i}`,
          twoFactorEnabled: true,
          samlAccounts: [],
        })),
        totalCount: 100,
      })
      .mockRejectedValueOnce(new Error("clerk down"));
    const app = await initApp([{ plugin: complianceReportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/me/organization/compliance-report",
      headers: HEADERS,
    });

    expect(getUserList).toHaveBeenCalledTimes(2);
    expect(getUserList.mock.calls[1][0].userId).toHaveLength(50);
    expect(res.json().identity.mfa).toEqual({
      enrolled: 100,
      unknown: 50,
      percent: 100,
    });
    await app.close();
  });

  it("exports the checks and key inventory as CSV", async () => {
    const app = await initApp([{ plugin: complianceReportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/me/organization/compliance-report.csv",
      headers: HEADERS,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = res.body.trim().split("\r\n");
    expect(lines[0]).toBe(
      "record,id,name,status,detail,environment,scopes,service_account,created_at,last_used_at,expires_at,age_days,ip_restricted",
    );
    expect(lines.some((line) => line.startsWith("check,mfa_required,"))).toBe(
      true,
    );
    const keyLine = lines.find((line) => line.startsWith("api_key,"));
    expect(keyLine).toContain("'=cmd|calc");
    expect(keyLine).toContain(",PRODUCTION,PAYMENTS_WRITE,");
    expect(db.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
      format: "csv",
    });
    await app.close();
  });

  it("is closed to roles without compliance.read", async () => {
    actAs("DEVELOPER");
    const app = await initApp([{ plugin: complianceReportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/me/organization/compliance-report",
      headers: HEADERS,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().permission).toBe("compliance.read");
    await app.close();
  });
});
