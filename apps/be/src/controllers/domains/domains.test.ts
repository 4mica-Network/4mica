import { clearUserCache } from "@auth/user-store";
import { domainRoutes } from "@routes/domains";
import { organizationRoutes } from "@routes/organizations";
import { clearClerkUserCache } from "@services/clerk-users";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import {
  APPROVAL_HEADERS,
  approvedFor,
  governOff,
  governOn,
} from "@/test-support/governance";
import {
  actInOrg,
  clerkUser,
  HEADERS,
  type IdentityDb,
  resetIdentity,
  signedIn,
  USER_ID,
} from "@/test-support/identity-db";
import { ORG_ID, OTHER_ORG_ID } from "@/test-support/tenancy";
import { txtResolver } from "./dns";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  process.env.RATE_LIMIT_ENABLED = "false";
  return {
    store: null as unknown as IdentityDb,
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    saml: {
      createSamlConnection: vi.fn(),
      getSamlConnection: vi.fn(),
      updateSamlConnection: vi.fn(),
      deleteSamlConnection: vi.fn(),
    },
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: h.authenticateRequest,
    users: { getUser: h.getUser },
    samlConnections: h.saml,
  })),
}));

const { authenticateRequest, getUser, saml } = h;
const db = h.store.db;
const tables = h.store.tables;
const fake = h.store.fake;

vi.mock("@4mica/db", async () => {
  const { sqltag, join, empty } = await import("@prisma/client/runtime/client");
  const { createIdentityDb } = await import("@/test-support/identity-db");
  h.store = createIdentityDb();
  return {
    Prisma: { sql: sqltag, join, empty },
    prisma: h.store.db,
    disconnect: vi.fn(async () => {}),
  };
});

vi.mock("node:dns/promises", () => ({
  resolveTxt: vi.fn(async () => {
    throw new Error("real DNS must not be used in tests");
  }),
}));

const app = () => initApp([{ plugin: domainRoutes }]);

const auditActions = () => tables.auditLogs.map((row) => row.action);

beforeEach(() => {
  clearUserCache();
  clearClerkUserCache();
  authenticateRequest.mockReset();
  authenticateRequest.mockResolvedValue(signedIn());
  getUser.mockReset();
  getUser.mockResolvedValue(clerkUser());
  for (const fn of Object.values(saml)) {
    fn.mockReset();
  }
  resetIdentity(h.store);
  governOff(db);
  vi.spyOn(txtResolver, "resolveTxt").mockReset();
});

describe("claiming a domain", () => {
  it("adds a lowercased domain with its TXT record", async () => {
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: "/me/organization/domains",
      headers: HEADERS,
      payload: { domain: "  Acme.COM. " },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      domain: "acme.com",
      verified: false,
      autoJoin: false,
      verificationRecord: {
        type: "TXT",
        name: "_4mica-verification.acme.com",
      },
    });
    expect(body.verificationRecord.value).toMatch(
      /^4mica-verification=[0-9a-f]{48}$/,
    );
    expect(auditActions()).toContain("domain.added");
  });

  it.each([
    "localhost",
    "acme",
    "10.0.0.1",
    "printer.local",
    "-bad.com",
    `${"a".repeat(64)}.com`,
  ])("rejects %s", async (domain) => {
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: "/me/organization/domains",
      headers: HEADERS,
      payload: { domain },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a domain another organization has verified", async () => {
    fake.domain({ organizationId: OTHER_ORG_ID, verifiedAt: new Date() });
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: "/me/organization/domains",
      headers: HEADERS,
      payload: { domain: "acme.com" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("domain_taken");
  });

  it("refuses the same domain twice in one organization", async () => {
    fake.domain();
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: "/me/organization/domains",
      headers: HEADERS,
      payload: { domain: "acme.com" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("domain_exists");
  });

  it("refuses personal organizations", async () => {
    actInOrg(db, "OWNER", true);
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: "/me/organization/domains",
      headers: HEADERS,
      payload: { domain: "acme.com" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("personal_organization");
  });

  it("needs security.manage", async () => {
    actInOrg(db, "ADMIN");
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: "/me/organization/domains",
      headers: HEADERS,
      payload: { domain: "acme.com" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists only this organization's domains to members.manage", async () => {
    fake.domain();
    fake.domain({ organizationId: OTHER_ORG_ID, domain: "other.com" });
    actInOrg(db, "ADMIN");
    const instance = await app();
    const res = await instance.inject({
      method: "GET",
      url: "/me/organization/domains",
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((d: Row) => d.domain)).toEqual(["acme.com"]);
  });
});

describe("verifying a domain", () => {
  it("verifies when the TXT record matches", async () => {
    const domain = fake.domain();
    vi.mocked(txtResolver.resolveTxt).mockResolvedValue([
      ["unrelated"],
      ["4mica-verification=", "tok123"],
    ]);
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: `/me/organization/domains/${domain.id}/verify`,
      headers: HEADERS,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().verified).toBe(true);
    expect(txtResolver.resolveTxt).toHaveBeenCalledWith(
      "_4mica-verification.acme.com",
    );
    expect(auditActions()).toContain("domain.verified");
  });

  it("answers 422 with what was found when the record is missing", async () => {
    const domain = fake.domain();
    vi.mocked(txtResolver.resolveTxt).mockResolvedValue([
      ["4mica-verification=nope"],
    ]);
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: `/me/organization/domains/${domain.id}/verify`,
      headers: HEADERS,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      error: "domain_unverified",
      found: ["4mica-verification=nope"],
      expected: { value: "4mica-verification=tok123" },
    });
    expect(tables.organizationDomain[0]?.verifiedAt).toBeNull();
    expect(tables.organizationDomain[0]?.lastCheckedAt).toBeInstanceOf(Date);
  });

  it("treats NXDOMAIN as nothing found", async () => {
    const domain = fake.domain();
    vi.mocked(txtResolver.resolveTxt).mockRejectedValue(
      Object.assign(new Error("nx"), { code: "ENOTFOUND" }),
    );
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: `/me/organization/domains/${domain.id}/verify`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().found).toEqual([]);
  });

  it("refuses when another organization verified it first", async () => {
    const domain = fake.domain();
    fake.domain({ organizationId: OTHER_ORG_ID, verifiedAt: new Date() });
    vi.mocked(txtResolver.resolveTxt).mockResolvedValue([
      ["4mica-verification=tok123"],
    ]);
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: `/me/organization/domains/${domain.id}/verify`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("domain_taken");
    expect(tables.organizationDomain[0]?.verifiedAt).toBeNull();
  });

  it("answers 404 for another organization's domain", async () => {
    const domain = fake.domain({ organizationId: OTHER_ORG_ID });
    const instance = await app();
    const res = await instance.inject({
      method: "POST",
      url: `/me/organization/domains/${domain.id}/verify`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(404);
    expect(txtResolver.resolveTxt).not.toHaveBeenCalled();
  });
});

describe("auto-join settings", () => {
  it("refuses auto-join on an unverified domain", async () => {
    const domain = fake.domain();
    const instance = await app();
    const res = await instance.inject({
      method: "PATCH",
      url: `/me/organization/domains/${domain.id}`,
      headers: HEADERS,
      payload: { autoJoin: true },
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses OWNER as the auto-join role", async () => {
    const domain = fake.domain({ verifiedAt: new Date() });
    const instance = await app();
    const res = await instance.inject({
      method: "PATCH",
      url: `/me/organization/domains/${domain.id}`,
      headers: HEADERS,
      payload: { autoJoin: true, autoJoinRole: "OWNER" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("governs ADMIN as the auto-join role", async () => {
    const domain = fake.domain({ verifiedAt: new Date() });
    governOn(db, "member.role_grant");
    const instance = await app();
    const payload = { autoJoin: true, autoJoinRole: "ADMIN" };

    const first = await instance.inject({
      method: "PATCH",
      url: `/me/organization/domains/${domain.id}`,
      headers: HEADERS,
      payload,
    });
    expect(first.statusCode).toBe(202);

    approvedFor(db, "member.role_grant", {
      kind: "domain_auto_join",
      domainId: domain.id,
      role: "ADMIN",
    });
    const second = await instance.inject({
      method: "PATCH",
      url: `/me/organization/domains/${domain.id}`,
      headers: { ...HEADERS, ...APPROVAL_HEADERS },
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      autoJoin: true,
      autoJoinRole: "ADMIN",
    });
  });
});

describe("deleting a domain", () => {
  it("needs a recent sign-in", async () => {
    const domain = fake.domain();
    authenticateRequest.mockResolvedValue(signedIn([120, -1]));
    const instance = await app();
    const res = await instance.inject({
      method: "DELETE",
      url: `/me/organization/domains/${domain.id}`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("reauth_required");
    expect(tables.organizationDomain).toHaveLength(1);
  });

  it("removes its Clerk SAML connections first", async () => {
    const domain = fake.domain({ verifiedAt: new Date() });
    fake.connection({ domainId: domain.id, clerkConnectionId: "samlc_9" });
    saml.deleteSamlConnection.mockResolvedValue({});
    const instance = await app();
    const res = await instance.inject({
      method: "DELETE",
      url: `/me/organization/domains/${domain.id}`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(204);
    expect(saml.deleteSamlConnection).toHaveBeenCalledWith("samlc_9");
    expect(tables.organizationDomain).toHaveLength(0);
    expect(auditActions()).toContain("domain.removed");
  });

  it("keeps the domain when Clerk cannot remove its connection", async () => {
    const domain = fake.domain({ verifiedAt: new Date() });
    fake.connection({ domainId: domain.id });
    saml.deleteSamlConnection.mockRejectedValue(new Error("down"));
    const instance = await app();
    const res = await instance.inject({
      method: "DELETE",
      url: `/me/organization/domains/${domain.id}`,
      headers: HEADERS,
    });
    expect(res.statusCode).toBe(502);
    expect(tables.organizationDomain).toHaveLength(1);
  });
});

describe("joining through a verified identity", () => {
  const list = async () => {
    const instance = await initApp([{ plugin: organizationRoutes }]);
    db.membership.findMany.mockClear();
    return instance.inject({
      method: "GET",
      url: "/me/organizations",
      headers: { authorization: "Bearer good" },
    });
  };

  beforeEach(() => {
    db.membership.findMany.mockImplementation(
      async ({ where }: { where: Row }) =>
        "organizationId" in where
          ? tables.memberships.filter((row) => matchesMembership(row, where))
          : [],
    );
  });

  const matchesMembership = (row: Row, where: Row) =>
    row.userId === where.userId &&
    ((where.organizationId as { in: string[] }).in ?? []).includes(
      row.organizationId as string,
    );

  it("joins orgs whose verified auto-join domain matches a verified email", async () => {
    const domain = fake.domain({
      verifiedAt: new Date(),
      autoJoin: true,
      autoJoinRole: "DEVELOPER",
    });

    expect((await list()).statusCode).toBe(200);

    expect(tables.memberships).toEqual([
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        role: "DEVELOPER",
        source: "DOMAIN",
      }),
    ]);
    expect(tables.auditLogs).toEqual([
      expect.objectContaining({
        action: "member.joined",
        organizationId: ORG_ID,
        metadata: expect.objectContaining({
          source: "DOMAIN",
          via: "domain",
          domainId: domain.id,
        }),
      }),
    ]);

    await list();
    expect(tables.memberships).toHaveLength(1);
  });

  it("ignores unverified Clerk emails", async () => {
    fake.domain({ verifiedAt: new Date(), autoJoin: true });
    getUser.mockResolvedValue(
      clerkUser({
        emailAddresses: [
          {
            id: "idn_1",
            emailAddress: "ada@acme.com",
            verification: { status: "unverified" },
          },
        ],
      }),
    );
    await list();
    expect(tables.memberships).toEqual([]);
  });

  it("ignores unverified domains and domains without auto-join", async () => {
    fake.domain({ autoJoin: true });
    fake.domain({
      organizationId: OTHER_ORG_ID,
      verifiedAt: new Date(),
      autoJoin: false,
    });
    await list();
    expect(tables.memberships).toEqual([]);
  });

  it("never touches an existing membership", async () => {
    fake.domain({
      verifiedAt: new Date(),
      autoJoin: true,
      autoJoinRole: "ADMIN",
    });
    tables.memberships.push({
      organizationId: ORG_ID,
      userId: USER_ID,
      role: "VIEWER",
      suspendedAt: new Date(),
    });
    await list();
    expect(tables.memberships).toEqual([
      expect.objectContaining({ role: "VIEWER" }),
    ]);
    expect(db.membership.create).not.toHaveBeenCalled();
  });

  it("does not re-add someone who was removed", async () => {
    fake.domain({ verifiedAt: new Date(), autoJoin: true });
    tables.auditLogs.push({
      organizationId: ORG_ID,
      action: "member.removed",
      targetType: "user",
      targetId: USER_ID,
    });
    await list();
    expect(tables.memberships).toEqual([]);
  });

  it("provisions through an active JIT SSO connection the user signed in with", async () => {
    const domain = fake.domain({
      organizationId: OTHER_ORG_ID,
      domain: "corp.example",
      verifiedAt: new Date(),
    });
    const connection = fake.connection({
      organizationId: OTHER_ORG_ID,
      domainId: domain.id,
      clerkConnectionId: "samlc_corp",
      defaultRole: "DEVELOPER",
    });
    getUser.mockResolvedValue(
      clerkUser({
        emailAddresses: [],
        samlAccounts: [{ active: true, samlConnection: { id: "samlc_corp" } }],
      }),
    );

    await list();

    expect(tables.memberships).toEqual([
      expect.objectContaining({
        organizationId: OTHER_ORG_ID,
        role: "DEVELOPER",
        source: "DOMAIN",
      }),
    ]);
    expect(tables.auditLogs[0]?.metadata).toMatchObject({
      via: "sso",
      ssoConnectionId: connection.id,
    });
  });

  it("skips inactive or non-JIT connections", async () => {
    const domain = fake.domain({ verifiedAt: new Date() });
    fake.connection({ domainId: domain.id, active: false });
    fake.connection({
      domainId: domain.id,
      clerkConnectionId: "samlc_2",
      jitProvisioning: false,
    });
    getUser.mockResolvedValue(
      clerkUser({
        emailAddresses: [],
        samlAccounts: [
          { active: true, samlConnection: { id: "samlc_1" } },
          { active: true, samlConnection: { id: "samlc_2" } },
        ],
      }),
    );
    await list();
    expect(tables.memberships).toEqual([]);
  });

  it("reads the Clerk user once per five minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await list();
      await list();
      expect(getUser).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
      await list();
      expect(getUser).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still lists organizations when Clerk is down", async () => {
    getUser.mockRejectedValue(new Error("down"));
    const res = await list();
    expect(res.statusCode).toBe(200);
  });
});
