import { type OrgRole, prisma } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { securityRoutes } from "@routes/security";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import {
  AUDIT_DOWN,
  failAuditInTransaction,
  runTransactionsOn,
} from "@/test-support/audit";
import { actAs, membershipRow, ORG_ID } from "@/test-support/tenancy";

const { authenticateRequest, $transaction, db } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  $transaction: vi.fn(),
  db: {
    membership: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    securitySettings: { findUnique: vi.fn(), upsert: vi.fn() },
    ssoConnection: { findMany: vi.fn() },
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest })),
}));

vi.mock("@4mica/db", () => ({
  prisma: { ...db, $transaction },
  disconnect: vi.fn(),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const CALLER_IP = "203.0.113.10";
const TEAM = { authorization: "Bearer good", "x-org-id": ORG_ID };

const DEFAULTS = {
  requireMfa: false,
  sessionMaxAgeHours: null,
  reauthWindowMinutes: 15,
  ipAllowlist: [],
  enforceIpAllowlistForApiKeys: false,
};

const signedIn = (fva: unknown = [1, -1]) => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: { sub: "user_123", sid: "sess_123", fva },
  }),
});

const actInTeam = (role: OrgRole, personal = false) => {
  actAs(db, role);
  db.membership.findFirst.mockResolvedValue(
    membershipRow(role, ORG_ID, personal),
  );
};

const request = (
  method: "GET" | "PUT",
  payload?: Record<string, unknown>,
  remoteAddress = CALLER_IP,
) =>
  initApp([{ plugin: securityRoutes }]).then((app) =>
    app.inject({
      method,
      url: "/me/organization/security",
      headers: TEAM,
      remoteAddress,
      ...(payload ? { payload } : {}),
    }),
  );

describe("security settings routes", () => {
  beforeEach(() => {
    for (const group of Object.values(db)) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();
    runTransactionsOn(prisma);
    authenticateRequest.mockReset();
    authenticateRequest.mockResolvedValue(signedIn());
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
    db.securitySettings.findUnique.mockResolvedValue(null);
    db.securitySettings.upsert.mockImplementation(
      async ({ update }: { update: object }) => update,
    );
    db.ssoConnection.findMany.mockResolvedValue([]);
    actInTeam("OWNER");
  });

  describe("GET", () => {
    it("returns the defaults when nothing is set", async () => {
      const res = await request("GET");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(DEFAULTS);
    });

    it("is readable by an admin", async () => {
      actInTeam("ADMIN");

      expect((await request("GET")).statusCode).toBe(200);
    });

    it.each([
      "FINANCE",
      "DEVELOPER",
      "VIEWER",
    ] as const)("is refused to %s", async (role) => {
      actInTeam(role);

      const res = await request("GET");

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: "forbidden" });
    });
  });

  describe("PUT", () => {
    it("leaves the policy unchanged when its audit entry cannot be written", async () => {
      const tx = failAuditInTransaction(prisma, {
        securitySettings: {
          upsert: vi.fn(async ({ update }: { update: object }) => update),
        },
      });

      const res = await request("PUT", { requireMfa: true });

      expect(res.statusCode).toBe(500);
      expect(tx.securitySettings.upsert).toHaveBeenCalledOnce();
      expect(db.securitySettings.upsert).not.toHaveBeenCalled();
      await expect($transaction.mock.results[0].value).rejects.toBe(AUDIT_DOWN);
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it("normalizes and saves the policy, and audits it", async () => {
      const res = await request("PUT", {
        requireMfa: true,
        sessionMaxAgeHours: 12,
        ipAllowlist: ["203.0.113.77/24", "2001:DB8::/32", "203.0.113.0/24"],
        enforceIpAllowlistForApiKeys: true,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        ...DEFAULTS,
        requireMfa: true,
        sessionMaxAgeHours: 12,
        ipAllowlist: ["203.0.113.0/24", "2001:db8::/32"],
        enforceIpAllowlistForApiKeys: true,
      });
      expect(db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "security.updated" }),
        }),
      );
    });

    it("refuses an allowlist that would lock the caller out", async () => {
      const res = await request("PUT", { ipAllowlist: ["198.51.100.0/24"] });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        error: "would_lock_out",
        ip: CALLER_IP,
      });
      expect(db.securitySettings.upsert).not.toHaveBeenCalled();
    });

    it("checks the caller's IPv6 address against the list", async () => {
      const ok = await request(
        "PUT",
        { ipAllowlist: ["2001:db8::/32"] },
        "2001:db8::42",
      );
      const locked = await request(
        "PUT",
        { ipAllowlist: ["2001:db8::/32"] },
        "2001:db9::42",
      );

      expect(ok.statusCode).toBe(200);
      expect(locked.statusCode).toBe(409);
    });

    it("rejects entries that are not addresses or ranges", async () => {
      const res = await request("PUT", {
        ipAllowlist: ["203.0.113.0/40", "office"],
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues).toHaveLength(2);
    });

    it.each([
      { sessionMaxAgeHours: 0 },
      { sessionMaxAgeHours: 721 },
      { reauthWindowMinutes: 0 },
      { reauthWindowMinutes: 241 },
      { ipAllowlist: Array.from({ length: 101 }, (_, i) => `10.0.0.${i}`) },
    ])("rejects %o", async (body) => {
      expect((await request("PUT", body)).statusCode).toBe(400);
    });

    it("asks for a recent sign-in", async () => {
      authenticateRequest.mockResolvedValue(signedIn([60, -1]));

      const res = await request("PUT", { requireMfa: true });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: "reauth_required",
        reauthWithinMinutes: 15,
      });
      expect(db.securitySettings.upsert).not.toHaveBeenCalled();
    });

    it("is refused to an admin", async () => {
      actInTeam("ADMIN");

      const res = await request("PUT", { requireMfa: true });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ permission: "security.manage" });
    });

    it("has nothing to set on a personal workspace", async () => {
      actInTeam("OWNER", true);

      const res = await request("PUT", { requireMfa: true });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "personal_organization" });
    });
  });

  describe("enforcement on the policy's own routes", () => {
    it("locks out an address the saved allowlist excludes", async () => {
      db.securitySettings.findUnique.mockResolvedValue({
        ...DEFAULTS,
        ipAllowlist: ["198.51.100.0/24"],
      });

      const res = await request("GET");

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: "ip_not_allowed" });
    });

    it("turns away a member without MFA when the organization requires it", async () => {
      db.securitySettings.findUnique.mockResolvedValue({
        ...DEFAULTS,
        requireMfa: true,
      });

      const res = await request("GET");

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: "mfa_required" });
    });
  });
});
