import { clearUserCache } from "@auth/user-store";
import { SCIM_PREFIX, scimRoutes } from "@routes/scim";
import { scimGroupRoutes } from "@routes/scim-groups";
import { scimTokenRoutes } from "@routes/scim-tokens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { AUDIT_DOWN } from "@/test-support/audit";
import { scimDb } from "@/test-support/scim-db";

const clerkApi = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: clerkApi.authenticateRequest,
    users: { getUser: clerkApi.getUser },
  })),
}));

vi.mock("@4mica/db", async () => {
  const { scimDb: db } = await import("@/test-support/scim-db");
  return { prisma: db.prisma, disconnect: vi.fn(async () => {}) };
});

type Row = Record<string, unknown>;

const db = scimDb;
let app: Awaited<ReturnType<typeof initApp>>;
let org: Row;
let otherOrg: Row;
let personalOrg: Row;
let owner: Row;

const signedIn = (clerkUserId: string, fva: [number, number] | null) => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: clerkUserId,
    sessionId: "sess_1",
    sessionClaims: {
      sub: clerkUserId,
      sid: "sess_1",
      ...(fva ? { fva } : {}),
    },
  }),
});

const actAs = (clerkUserId: string, fva: [number, number] | null = [1, -1]) =>
  clerkApi.authenticateRequest.mockResolvedValue(signedIn(clerkUserId, fva));

const call = (
  method: "GET" | "POST" | "PATCH",
  url: string,
  payload?: Row,
  orgId: unknown = org.id,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: "Bearer session", "x-org-id": String(orgId) },
    ...(payload ? { payload } : {}),
  });

const audits = (action: string) =>
  db.rows("auditLog").filter((row) => row.action === action);

beforeEach(async () => {
  app = await initApp([
    { plugin: scimTokenRoutes },
    { plugin: scimGroupRoutes },
    { plugin: scimRoutes, prefix: SCIM_PREFIX },
  ]);
});

afterEach(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  clearUserCache();
  db.reset();
  [org, otherOrg, personalOrg] = db.seed(
    "organization",
    { name: "Acme" },
    { name: "Globex" },
    { name: "Personal", personal: true },
  ) as [Row, Row, Row];
  const [ownerUser, developer] = db.seed(
    "user",
    { clerkUserId: "user_owner", email: "owner@acme.com", name: "Owner" },
    { clerkUserId: "user_dev", email: "dev@acme.com", name: "Dev" },
  ) as [Row, Row];
  owner = ownerUser;
  db.seed(
    "membership",
    { organizationId: org.id, userId: owner.id, role: "OWNER" },
    { organizationId: personalOrg.id, userId: owner.id, role: "OWNER" },
    { organizationId: org.id, userId: developer.id, role: "ADMIN" },
  );
  actAs("user_owner");
});

describe("SCIM token management", () => {
  it("creates a token once, lists it without the secret and revokes it", async () => {
    const created = await call("POST", "/me/organization/scim-tokens", {
      name: "Okta",
    });

    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.secret).toMatch(/^4mica_scim_/);
    expect(body).toMatchObject({ name: "Okta", revokedAt: null });
    expect(body.prefix).toBe(body.secret.slice(0, body.prefix.length));
    expect(JSON.stringify(db.rows("scimToken"))).not.toContain(body.secret);
    expect(audits("scim_token.created")[0]).toMatchObject({
      organizationId: org.id,
      actorUserId: owner.id,
      targetId: body.id,
    });

    const works = await app.inject({
      method: "GET",
      url: `${SCIM_PREFIX}/Users`,
      headers: { authorization: `Bearer ${body.secret}` },
    });
    expect(works.statusCode).toBe(200);

    const list = (await call("GET", "/me/organization/scim-tokens")).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].secret).toBeUndefined();
    expect(list.items[0].createdBy).toEqual({ id: owner.id, name: "Owner" });

    const revoked = await call(
      "POST",
      `/me/organization/scim-tokens/${body.id}/revoke`,
    );
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().revokedAt).not.toBeNull();
    expect(audits("scim_token.revoked")).toHaveLength(1);

    const refused = await app.inject({
      method: "GET",
      url: `${SCIM_PREFIX}/Users`,
      headers: { authorization: `Bearer ${body.secret}` },
    });
    expect(refused.statusCode).toBe(401);
  });

  it("does not create a token when its audit entry cannot be written", async () => {
    const transaction = db.prisma.$transaction;
    const create = vi.fn(async () => ({
      id: "019fce62-0000-7000-8000-00000000cafe",
      name: "Okta",
      prefix: "4mica_scim_ab12",
    }));
    db.prisma.$transaction = async (input: unknown) =>
      (input as (tx: unknown) => Promise<unknown>)({
        scimToken: { create },
        auditLog: { create: vi.fn().mockRejectedValue(AUDIT_DOWN) },
      });

    try {
      const res = await call("POST", "/me/organization/scim-tokens", {
        name: "Okta",
      });

      expect(res.statusCode).toBe(500);
      expect(res.body).not.toMatch(/4mica_scim_[a-z0-9]{8,}/i);
      expect(create).toHaveBeenCalledOnce();
      expect(db.rows("scimToken")).toEqual([]);
      expect(audits("scim_token.created")).toEqual([]);
    } finally {
      db.prisma.$transaction = transaction;
    }
  });

  it("requires a recent sign-in to create a token", async () => {
    actAs("user_owner", [60, -1]);

    const stale = await call("POST", "/me/organization/scim-tokens", {
      name: "Okta",
    });

    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({
      error: "reauth_required",
      reauthWithinMinutes: 15,
    });
    expect(db.rows("scimToken")).toEqual([]);
  });

  it("needs security.manage", async () => {
    actAs("user_dev");

    for (const res of [
      await call("GET", "/me/organization/scim-tokens"),
      await call("POST", "/me/organization/scim-tokens", { name: "Okta" }),
      await call("GET", "/me/organization/scim-groups"),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().permission).toBe("security.manage");
    }
  });

  it("refuses personal organizations", async () => {
    const res = await call(
      "POST",
      "/me/organization/scim-tokens",
      { name: "Okta" },
      personalOrg.id,
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("personal_organization");
  });

  it("validates the name", async () => {
    const res = await call("POST", "/me/organization/scim-tokens", {
      name: "",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("answers 404 for another organization's token", async () => {
    const [foreign] = db.seed("scimToken", {
      organizationId: otherOrg.id,
      name: "Theirs",
      hashedToken: "x",
    }) as [Row];

    const res = await call(
      "POST",
      `/me/organization/scim-tokens/${foreign.id}/revoke`,
    );

    expect(res.statusCode).toBe(404);
    expect(foreign.revokedAt).toBeNull();
  });
});

describe("SCIM group mapping", () => {
  const seedGroup = (over: Row = {}) => {
    const [group] = db.seed("scimGroup", {
      organizationId: org.id,
      displayName: "Admins",
      ...over,
    }) as [Row];
    return group;
  };

  const seedScimMember = (email: string, role = "VIEWER") => {
    const [user] = db.seed("user", {
      clerkUserId: `user_${email}`,
      email,
    }) as [Row];
    db.seed("membership", {
      organizationId: org.id,
      userId: user.id,
      role,
      source: "SCIM",
    });
    return user;
  };

  const roleOf = (userId: unknown) =>
    db
      .rows("membership")
      .find((row) => row.organizationId === org.id && row.userId === userId);

  it("lists groups with their mapping and member count", async () => {
    const group = seedGroup({ role: "ADMIN", priority: 4 });
    const ada = seedScimMember("ada@acme.com");
    db.seed("scimGroupMember", { groupId: group.id, userId: ada.id });
    db.seed("scimGroup", {
      organizationId: otherOrg.id,
      displayName: "Theirs",
    });

    const res = await call("GET", "/me/organization/scim-groups");

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([
      expect.objectContaining({
        id: group.id,
        displayName: "Admins",
        role: "ADMIN",
        customRole: null,
        priority: 4,
        memberCount: 1,
      }),
    ]);
  });

  it("holds a mapping that grants admin for approval when governance covers role grants", async () => {
    const group = seedGroup();
    const ada = seedScimMember("ada@acme.com");
    db.seed("scimGroupMember", { groupId: group.id, userId: ada.id });
    db.seed("governanceSettings", {
      organizationId: org.id,
      approvalsRequired: 1,
      governedActions: ["member.role_grant"],
      approvalTtlHours: 72,
    });

    const res = await call(
      "PATCH",
      `/me/organization/scim-groups/${group.id}`,
      {
        role: "ADMIN",
        priority: 10,
      },
    );

    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("approval_required");
    expect(roleOf(ada.id)?.role).not.toBe("ADMIN");
    expect(audits("scim_group.mapping_updated")).toHaveLength(0);
  });

  it("maps a group to a role and recomputes its members", async () => {
    const group = seedGroup();
    const ada = seedScimMember("ada@acme.com");
    const boss = seedScimMember("boss@acme.com", "OWNER");
    db.seed(
      "scimGroupMember",
      { groupId: group.id, userId: ada.id },
      { groupId: group.id, userId: boss.id },
    );

    const res = await call(
      "PATCH",
      `/me/organization/scim-groups/${group.id}`,
      {
        role: "ADMIN",
        priority: 10,
      },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ role: "ADMIN", priority: 10 });
    expect(roleOf(ada.id)?.role).toBe("ADMIN");
    expect(roleOf(boss.id)?.role).toBe("OWNER");
    expect(audits("scim_group.mapping_updated")[0]).toMatchObject({
      actorUserId: owner.id,
      targetId: group.id,
    });
    expect(audits("member.role_changed")[0]).toMatchObject({
      actorUserId: owner.id,
      targetId: ada.id,
      metadata: expect.objectContaining({ to: "ADMIN", scimGroupId: group.id }),
    });

    await call("PATCH", `/me/organization/scim-groups/${group.id}`, {
      role: null,
    });
    expect(roleOf(ada.id)?.role).toBe("VIEWER");
  });

  it("maps a group to one of the organization's custom roles", async () => {
    const group = seedGroup();
    const ada = seedScimMember("ada@acme.com");
    db.seed("scimGroupMember", { groupId: group.id, userId: ada.id });
    const [role] = db.seed("customRole", {
      organizationId: org.id,
      name: "Auditor",
    }) as [Row];
    const [foreign] = db.seed("customRole", {
      organizationId: otherOrg.id,
      name: "Theirs",
    }) as [Row];

    const refused = await call(
      "PATCH",
      `/me/organization/scim-groups/${group.id}`,
      { customRoleId: foreign.id },
    );
    expect(refused.statusCode).toBe(404);

    const res = await call(
      "PATCH",
      `/me/organization/scim-groups/${group.id}`,
      {
        customRoleId: role.id,
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().customRole).toEqual({ id: role.id, name: "Auditor" });
    expect(roleOf(ada.id)).toMatchObject({
      role: "VIEWER",
      customRoleId: role.id,
    });
  });

  it("refuses OWNER and a role together with a custom role", async () => {
    const group = seedGroup();

    for (const payload of [
      { role: "OWNER" },
      { role: "ADMIN", customRoleId: "019fce62-0000-7000-8000-0000000000c1" },
      { priority: 1.5 },
    ]) {
      const res = await call(
        "PATCH",
        `/me/organization/scim-groups/${group.id}`,
        payload,
      );
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(group.role).toBeNull();
  });

  it("answers 404 for another organization's group", async () => {
    const [foreign] = db.seed("scimGroup", {
      organizationId: otherOrg.id,
      displayName: "Theirs",
    }) as [Row];

    const res = await call(
      "PATCH",
      `/me/organization/scim-groups/${foreign.id}`,
      { role: "ADMIN" },
    );

    expect(res.statusCode).toBe(404);
    expect(foreign.role).toBeNull();
  });
});
