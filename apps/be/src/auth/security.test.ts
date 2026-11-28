import type { SecuritySettingsRow } from "@controllers/security/repository";
import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enforceAccessPolicy, requireRecentAuth } from "./security";
import type { Tenant } from "./tenant";

const { findSecuritySettings, ssoRequirement } = vi.hoisted(() => ({
  findSecuritySettings: vi.fn(),
  ssoRequirement: vi.fn(),
}));

vi.mock("@controllers/security/repository", async (original) => ({
  ...(await original<object>()),
  findSecuritySettings,
}));

vi.mock("@controllers/sso/enforcement", () => ({ ssoRequirement }));

const SETTINGS: SecuritySettingsRow = {
  requireMfa: false,
  sessionMaxAgeHours: null,
  reauthWindowMinutes: 15,
  ipAllowlist: [],
  enforceIpAllowlistForApiKeys: false,
};

const TENANT: Tenant = {
  orgId: "019fce62-0000-7000-8000-0000000000a1",
  userId: "019fce62-0000-7000-8000-000000000000",
  role: "OWNER",
  personal: false,
  custom: null,
  suspended: false,
};

interface Caller {
  fva?: unknown;
  cli?: boolean | { mfaVerified?: boolean; ageMinutes?: number };
  ip?: string;
}

const cliOf = (cli: Caller["cli"]) => {
  const { mfaVerified = false, ageMinutes = 0 } =
    typeof cli === "object" ? cli : {};
  return {
    id: "cli_1",
    kind: "TOKEN",
    name: "laptop",
    scopes: [],
    organizationId: TENANT.orgId,
    mfaVerified,
    createdAt: new Date(Date.now() - ageMinutes * 60_000),
    expiresAt: new Date(Date.now() + 86_400_000),
  };
};

const requestOf = ({ fva, cli = false, ip = "203.0.113.10" }: Caller = {}) =>
  ({
    ip,
    auth: cli
      ? null
      : {
          tokenType: "session_token",
          clerkUserId: "user_1",
          sessionId: "sess_1",
          claims: fva === undefined ? {} : { fva },
        },
    cliSession: cli ? cliOf(cli) : null,
    apiKey: null,
  }) as unknown as FastifyRequest;

const replyOf = () => {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const reply = {
    code(status: number) {
      sent.status = status;
      return reply;
    },
    send(body: Record<string, unknown>) {
      sent.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
};

const withSettings = (over: Partial<SecuritySettingsRow>) =>
  findSecuritySettings.mockResolvedValue({ ...SETTINGS, ...over });

const enforce = async (caller: Caller, tenant: Tenant = TENANT) => {
  const { reply, sent } = replyOf();
  const ok = await enforceAccessPolicy(requestOf(caller), reply, tenant);
  return { ok, ...sent };
};

const reauth = async (caller: Caller) => {
  const { reply, sent } = replyOf();
  const ok = await requireRecentAuth(requestOf(caller), reply, TENANT);
  return { ok, ...sent };
};

describe("enforceAccessPolicy", () => {
  beforeEach(() => {
    findSecuritySettings.mockReset();
    ssoRequirement.mockReset();
    ssoRequirement.mockResolvedValue(null);
    withSettings({});
  });

  it("lets a caller through when the organization sets no policy", async () => {
    expect(await enforce({ fva: [5, -1] })).toMatchObject({ ok: true });
  });

  it("refuses a suspended member before reading any policy", async () => {
    const result = await enforce({}, { ...TENANT, suspended: true });

    expect(result).toMatchObject({
      ok: false,
      status: 403,
      body: { error: "member_suspended" },
    });
    expect(findSecuritySettings).not.toHaveBeenCalled();
  });

  it("never reads a policy for a personal workspace", async () => {
    withSettings({ requireMfa: true, ipAllowlist: ["192.0.2.1"] });

    expect(await enforce({}, { ...TENANT, personal: true })).toMatchObject({
      ok: true,
    });
    expect(findSecuritySettings).not.toHaveBeenCalled();
  });

  describe("IP allowlist", () => {
    beforeEach(() => withSettings({ ipAllowlist: ["203.0.113.0/24"] }));

    it("admits an address inside the allowlist", async () => {
      expect(await enforce({ ip: "203.0.113.99" })).toMatchObject({
        ok: true,
      });
    });

    it("refuses a session from outside it", async () => {
      expect(await enforce({ ip: "198.51.100.1" })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "ip_not_allowed" },
      });
    });

    it("refuses a CLI token from outside it too", async () => {
      expect(await enforce({ cli: true, ip: "198.51.100.1" })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "ip_not_allowed" },
      });
    });

    it("works with IPv6 ranges", async () => {
      withSettings({ ipAllowlist: ["2001:db8::/32"] });

      expect(await enforce({ ip: "2001:db8:1::5" })).toMatchObject({
        ok: true,
      });
      expect(await enforce({ ip: "2001:db9::5" })).toMatchObject({
        ok: false,
        body: { error: "ip_not_allowed" },
      });
    });
  });

  describe("requireMfa", () => {
    beforeEach(() => withSettings({ requireMfa: true }));

    it("admits a session that verified a second factor", async () => {
      expect(await enforce({ fva: [30, 30] })).toMatchObject({ ok: true });
    });

    it("refuses a session without a second factor", async () => {
      expect(await enforce({ fva: [30, -1] })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "mfa_required" },
      });
    });

    it.each([
      ["missing", undefined],
      ["malformed", "30,30"],
      ["short", [30]],
      ["non-numeric", ["30", "30"]],
    ])("fails closed when the fva claim is %s", async (_label, fva) => {
      expect(await enforce({ fva })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "mfa_required" },
      });
    });

    it("admits a CLI session issued from a browser session that used MFA", async () => {
      expect(await enforce({ cli: { mfaVerified: true } })).toMatchObject({
        ok: true,
      });
    });

    it("refuses a CLI session issued without MFA", async () => {
      expect(await enforce({ cli: { mfaVerified: false } })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "mfa_required" },
      });
    });
  });

  describe("sessionMaxAgeHours", () => {
    beforeEach(() => withSettings({ sessionMaxAgeHours: 8 }));

    it("admits a session signed in within the limit", async () => {
      expect(await enforce({ fva: [8 * 60, -1] })).toMatchObject({
        ok: true,
      });
    });

    it("refuses an older session with 401 so the client signs in again", async () => {
      expect(await enforce({ fva: [8 * 60 + 1, -1] })).toMatchObject({
        ok: false,
        status: 401,
        body: { error: "session_too_old" },
      });
    });

    it("fails closed when the fva claim is missing", async () => {
      expect(await enforce({})).toMatchObject({
        ok: false,
        status: 401,
        body: { error: "session_too_old" },
      });
    });

    it("admits a CLI session issued within the limit", async () => {
      expect(await enforce({ cli: { ageMinutes: 8 * 60 - 1 } })).toMatchObject({
        ok: true,
      });
    });

    it("refuses a CLI session issued longer ago than the limit", async () => {
      expect(await enforce({ cli: { ageMinutes: 8 * 60 + 1 } })).toMatchObject({
        ok: false,
        status: 401,
        body: { error: "session_too_old" },
      });
    });
  });

  describe("single sign-on", () => {
    it("refuses a session that skipped the enforced connection", async () => {
      ssoRequirement.mockResolvedValue({ domain: "acme.com" });

      expect(await enforce({ fva: [1, -1] })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "sso_required", domain: "acme.com" },
      });
    });

    it("is not consulted when an earlier rule already refused", async () => {
      withSettings({ ipAllowlist: ["192.0.2.1"] });
      ssoRequirement.mockResolvedValue({ domain: "acme.com" });

      expect(await enforce({ fva: [1, -1] })).toMatchObject({
        body: { error: "ip_not_allowed" },
      });
      expect(ssoRequirement).not.toHaveBeenCalled();
    });

    it("applies to CLI sessions too", async () => {
      ssoRequirement.mockResolvedValue({ domain: "acme.com" });

      expect(await enforce({ cli: true })).toMatchObject({
        ok: false,
        status: 403,
        body: { error: "sso_required", domain: "acme.com" },
      });
      expect(ssoRequirement).toHaveBeenCalledOnce();
    });
  });

  it("reads the policy once per request", async () => {
    const request = requestOf({ fva: [1, 1] });
    const { reply } = replyOf();

    await enforceAccessPolicy(request, reply, TENANT);
    await requireRecentAuth(request, reply, TENANT);

    expect(findSecuritySettings).toHaveBeenCalledTimes(1);
  });
});

describe("requireRecentAuth", () => {
  beforeEach(() => {
    findSecuritySettings.mockReset();
    withSettings({ reauthWindowMinutes: 10 });
  });

  it("accepts a sign-in inside the window", async () => {
    expect(await reauth({ fva: [10, -1] })).toMatchObject({ ok: true });
  });

  it("asks for a fresh sign-in outside the window", async () => {
    expect(await reauth({ fva: [11, -1] })).toMatchObject({
      ok: false,
      status: 403,
      body: { error: "reauth_required", reauthWithinMinutes: 10 },
    });
  });

  it("fails closed without an fva claim", async () => {
    expect(await reauth({})).toMatchObject({
      ok: false,
      body: { error: "reauth_required" },
    });
  });

  it("needs a recent second factor too when MFA is required", async () => {
    withSettings({ reauthWindowMinutes: 10, requireMfa: true });

    expect(await reauth({ fva: [2, 2] })).toMatchObject({ ok: true });
    expect(await reauth({ fva: [2, 60] })).toMatchObject({
      ok: false,
      body: { error: "reauth_required" },
    });
    expect(await reauth({ fva: [2, -1] })).toMatchObject({
      ok: false,
      body: { error: "reauth_required" },
    });
  });

  it("refuses CLI tokens however fresh", async () => {
    expect(
      await reauth({ cli: { mfaVerified: true, ageMinutes: 0 }, fva: [0, 0] }),
    ).toMatchObject({
      ok: false,
      status: 403,
      body: { error: "reauth_required" },
    });
  });
});
