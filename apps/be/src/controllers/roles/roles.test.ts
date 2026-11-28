import type { OrgRole, ProjectRole } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { requireProject, requireTenant } from "@controllers/shared";
import { organizationRoutes } from "@routes/organizations";
import { roleRoutes } from "@routes/roles";
import type { FastifyPluginCallback } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { AUDIT_DOWN, failAuditInTransaction } from "@/test-support/audit";
import { APPROVAL_ID, governOff, governOn } from "@/test-support/governance";
import { ORG_ID, projectRow } from "@/test-support/tenancy";

const { authenticateRequest, getUser, db, claims } = vi.hoisted(() => {
  const db = {
    membership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    customRole: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    scimGroup: { updateMany: vi.fn() },
    project: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    securitySettings: { findUnique: vi.fn() },
    ssoConnection: { findMany: vi.fn() },
    governanceSettings: { findUnique: vi.fn() },
    approvalRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return {
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    db,
    claims: { fva: [1, -1] as number[] | undefined },
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", async () => {
  const { sqltag, join, empty } = await import("@prisma/client/runtime/client");
  return {
    Prisma: { sql: sqltag, join, empty },
    prisma: db,
    disconnect: vi.fn(async () => {}),
  };
});

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const OTHER_USER_ID = "019fce62-0000-7000-8000-000000000001";
const ROLE_ID = "019fce62-0000-7000-8000-0000000000f1";

const AUTH_USER = {
  id: USER_ID,
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const HEADERS = { authorization: "Bearer good", "x-org-id": ORG_ID };

interface Custom {
  permissions: string[];
  projectRole?: ProjectRole;
}

const actAs = (role: OrgRole, custom: Custom | null = null) => {
  db.membership.findFirst.mockResolvedValue({
    role,
    suspendedAt: null,
    customRole: custom && {
      id: ROLE_ID,
      name: "Custom",
      permissions: custom.permissions,
      projectRole: custom.projectRole ?? "VIEWER",
      deletedAt: null,
    },
    organization: { id: ORG_ID, personal: false },
  });
};

const roleRow = (over: Record<string, unknown> = {}) => ({
  id: ROLE_ID,
  name: "Treasury",
  description: null,
  permissions: ["payments.read"],
  projectRole: "VIEWER",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  _count: { memberships: 0 },
  ...over,
});

const memberRow = (role: string, customRole: unknown = null) => ({
  role,
  source: "INVITATION",
  suspendedAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  customRole,
  user: {
    id: OTHER_USER_ID,
    name: "Grace",
    username: "grace",
    email: "grace@example.com",
    avatarUrl: null,
  },
});

const probe: FastifyPluginCallback = (app, _opts, done) => {
  const base = {
    onRequest: [app.authenticate],
    preHandler: [app.getUserData],
  };
  app.get("/probe/payments", base, async (request, reply) =>
    (await requireTenant(request, reply, "payments.read"))
      ? reply.send({ ok: true })
      : reply,
  );
  app.post("/probe/wallets", base, async (request, reply) =>
    (await requireTenant(request, reply, "wallets.manage"))
      ? reply.send({ ok: true })
      : reply,
  );
  app.post("/probe/resources", base, async (request, reply) => {
    const scope = await requireProject(request, reply, "resources.write");
    return scope ? reply.send({ role: scope.role }) : reply;
  });
  done();
};

const app = () =>
  initApp([
    { plugin: roleRoutes },
    { plugin: organizationRoutes },
    { plugin: probe },
  ]);

const auditActions = () =>
  db.auditLog.create.mock.calls.map(
    ([arg]) => (arg as { data: { action: string } }).data.action,
  );

describe("custom roles", () => {
  beforeEach(() => {
    for (const group of Object.values(db)) {
      if (typeof group === "function") {
        (group as ReturnType<typeof vi.fn>).mockReset();
        continue;
      }
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();
    claims.fva = [1, -1];
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      status: "signed-in",
      reason: null,
      toAuth: () => ({
        tokenType: "session_token",
        userId: "user_123",
        sessionId: "sess_123",
        sessionClaims: {
          sub: "user_123",
          sid: "sess_123",
          ...(claims.fva ? { fva: claims.fva } : {}),
        },
      }),
    });
    db.user.upsert.mockResolvedValue(AUTH_USER);
    db.auditLog.create.mockResolvedValue({ id: "audit" });
    db.securitySettings.findUnique.mockResolvedValue(null);
    db.ssoConnection.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValue([{ id: "owner" }]);
    db.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[]),
    );
    governOff(db);
    actAs("OWNER");
  });

  describe("permission resolution", () => {
    it("lets a custom role with only payments.read read payments but not manage wallets", async () => {
      actAs("VIEWER", { permissions: ["payments.read"] });
      const instance = await app();

      const read = await instance.inject({
        method: "GET",
        url: "/probe/payments",
        headers: HEADERS,
      });
      const write = await instance.inject({
        method: "POST",
        url: "/probe/wallets",
        headers: HEADERS,
      });

      expect(read.statusCode).toBe(200);
      expect(write.statusCode).toBe(403);
      expect(write.json()).toMatchObject({
        error: "forbidden",
        permission: "wallets.manage",
      });
      await instance.close();
    });

    it("replaces the base role's permissions rather than adding to them", async () => {
      actAs("ADMIN", { permissions: ["payments.read"] });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/probe/wallets",
        headers: HEADERS,
      });

      expect(res.statusCode).toBe(403);
      await instance.close();
    });

    it("never grants owner-only permissions even if they were stored", async () => {
      actAs("VIEWER", { permissions: ["roles.manage", "security.manage"] });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: { name: "Sneaky", permissions: [] },
      });

      expect(res.statusCode).toBe(403);
      await instance.close();
    });

    it("applies the custom project role on unrestricted projects only", async () => {
      actAs("VIEWER", {
        permissions: ["resources.read"],
        projectRole: "DEVELOPER",
      });
      db.project.findFirst.mockResolvedValue(projectRow());
      const instance = await app();

      const open = await instance.inject({
        method: "POST",
        url: "/probe/resources",
        headers: HEADERS,
      });
      expect(open.statusCode).toBe(200);
      expect(open.json()).toEqual({ role: "DEVELOPER" });

      db.project.findFirst.mockResolvedValue(projectRow({ restricted: true }));
      const restricted = await instance.inject({
        method: "POST",
        url: "/probe/resources",
        headers: HEADERS,
      });
      expect(restricted.statusCode).toBe(404);

      await instance.close();
    });

    it("reports the custom role's permissions on the organization", async () => {
      const customRole = {
        id: ROLE_ID,
        name: "Analyst",
        permissions: ["resources.read", "payments.read", "roles.manage"],
        projectRole: "VIEWER",
        deletedAt: null,
      };
      db.membership.findFirst
        .mockResolvedValueOnce({
          role: "VIEWER",
          suspendedAt: null,
          customRole,
          organization: { id: ORG_ID, personal: false },
        })
        .mockResolvedValueOnce({
          role: "VIEWER",
          customRole,
          organization: {
            id: ORG_ID,
            handle: "acme",
            name: "Acme",
            avatarUrl: null,
            personal: false,
            createdAt: new Date("2026-11-01T00:00:00Z"),
            _count: { memberships: 3 },
          },
        });
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organization",
        headers: HEADERS,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        role: "VIEWER",
        customRole: { id: ROLE_ID, name: "Analyst" },
        permissions: ["resources.read", "payments.read"],
      });
      await instance.close();
    });
  });

  describe("managing roles", () => {
    it("lists roles with the permissions that can be assigned", async () => {
      actAs("ADMIN");
      db.customRole.findMany.mockResolvedValue([roleRow()]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organization/roles",
        headers: HEADERS,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().items[0]).toMatchObject({
        id: ROLE_ID,
        name: "Treasury",
        permissions: ["payments.read"],
        memberCount: 0,
      });
      expect(res.json().assignablePermissions).not.toContain("roles.manage");
      expect(res.json().assignablePermissions).toContain("members.manage");
      await instance.close();
    });

    it("refuses owner-only permissions at create", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: {
          name: "Too much",
          permissions: ["payments.read", "governance.manage"],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("permissions");
      expect(db.customRole.create).not.toHaveBeenCalled();
      await instance.close();
    });

    it("creates a role for an owner who signed in recently", async () => {
      db.customRole.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) =>
          roleRow({ ...data }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: {
          name: " Treasury ",
          permissions: ["finance.read", "payments.read", "payments.read"],
          projectRole: "DEVELOPER",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(db.customRole.create.mock.calls[0][0].data).toMatchObject({
        name: "Treasury",
        permissions: ["finance.read", "payments.read"],
        projectRole: "DEVELOPER",
        organizationId: ORG_ID,
        createdById: USER_ID,
      });
      expect(auditActions()).toContain("role.created");
      await instance.close();
    });

    it("creates no role when its audit entry cannot be written", async () => {
      const tx = failAuditInTransaction(db, {
        customRole: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
            roleRow({ ...data }),
          ),
        },
      });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: { name: "Treasury", permissions: ["finance.read"] },
      });

      expect(res.statusCode).toBe(500);
      expect(tx.customRole.create).toHaveBeenCalledOnce();
      expect(db.customRole.create).not.toHaveBeenCalled();
      await expect(db.$transaction.mock.results.at(-1)?.value).rejects.toBe(
        AUDIT_DOWN,
      );
      expect(auditActions()).not.toContain("role.created");
      await instance.close();
    });

    it("asks for a fresh sign-in before creating a role", async () => {
      claims.fva = undefined;
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: { name: "Treasury", permissions: [] },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: "reauth_required" });
      await instance.close();
    });

    it("refuses an admin, who cannot manage roles", async () => {
      actAs("ADMIN");
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: { name: "Treasury", permissions: [] },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().permission).toBe("roles.manage");
      await instance.close();
    });

    it("answers 409 when the name is taken", async () => {
      db.customRole.create.mockRejectedValue(
        Object.assign(new Error("dup"), { code: "P2002" }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/roles",
        headers: HEADERS,
        payload: { name: "Treasury", permissions: [] },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("role_name_taken");
      await instance.close();
    });

    it("needs approval to widen a role that people hold", async () => {
      governOn(db, "member.role_grant");
      db.customRole.findFirst.mockResolvedValue(
        roleRow({ _count: { memberships: 2 } }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/roles/${ROLE_ID}`,
        headers: HEADERS,
        payload: { permissions: ["payments.read", "members.manage"] },
      });

      expect(res.statusCode).toBe(202);
      expect(db.customRole.updateMany).not.toHaveBeenCalled();
      await instance.close();
    });

    it("deletes a role and drops its members to viewer", async () => {
      db.customRole.findFirst.mockResolvedValue({
        id: ROLE_ID,
        name: "Treasury",
      });
      db.membership.updateMany.mockResolvedValue({ count: 3 });
      db.scimGroup.updateMany.mockResolvedValue({ count: 0 });
      db.customRole.update.mockResolvedValue({});
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/organization/roles/${ROLE_ID}`,
        headers: HEADERS,
      });

      expect(res.statusCode).toBe(204);
      expect(db.membership.updateMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, customRoleId: ROLE_ID },
        data: { customRoleId: null, role: "VIEWER" },
      });
      expect(db.customRole.update.mock.calls[0][0].data).toMatchObject({
        deletedAt: expect.any(Date),
        name: `deleted:${ROLE_ID}`,
      });
      expect(db.auditLog.create.mock.calls.at(-1)?.[0].data).toMatchObject({
        action: "role.deleted",
        metadata: { name: "Treasury", members: 3 },
      });
      await instance.close();
    });

    it("answers 404 for another organization's role", async () => {
      db.customRole.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/organization/roles/${ROLE_ID}`,
        headers: HEADERS,
      });

      expect(res.statusCode).toBe(404);
      expect(db.customRole.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
        id: ROLE_ID,
        deletedAt: null,
      });
      await instance.close();
    });
  });

  describe("assigning a custom role", () => {
    const assign = async (headers: Record<string, string> = {}) => {
      const instance = await app();
      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: { ...HEADERS, ...headers },
        payload: { customRoleId: ROLE_ID },
      });
      await instance.close();
      return res;
    };

    beforeEach(() => {
      db.customRole.findFirst.mockResolvedValue(roleRow());
      db.membership.findUnique.mockResolvedValue({
        ...memberRow("DEVELOPER"),
        customRoleId: null,
      });
      db.membership.update.mockResolvedValue(
        memberRow("VIEWER", { id: ROLE_ID, name: "Treasury", deletedAt: null }),
      );
    });

    it("sets the base role to viewer and links the custom role", async () => {
      const res = await assign();

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        role: "VIEWER",
        customRole: { id: ROLE_ID, name: "Treasury" },
      });
      expect(db.membership.update.mock.calls[0][0].data).toEqual({
        role: "VIEWER",
        customRoleId: ROLE_ID,
      });
      expect(db.auditLog.create.mock.calls.at(-1)?.[0].data).toMatchObject({
        action: "member.role_changed",
        metadata: { from: "DEVELOPER", to: "VIEWER", customRoleId: ROLE_ID },
      });
    });

    it("refuses to give an owner a custom role", async () => {
      db.membership.findUnique.mockResolvedValue({
        ...memberRow("OWNER"),
        customRoleId: null,
      });

      const res = await assign();

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("owner_custom_role");
      expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("answers 404 for a role that is not this organization's", async () => {
      db.customRole.findFirst.mockResolvedValue(null);

      const res = await assign();

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toContain("role");
    });

    it("needs a fresh sign-in", async () => {
      claims.fva = [60, -1];

      const res = await assign();

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("reauth_required");
    });

    it("is governed when the role manages members, finance, wallets or the business", async () => {
      governOn(db, "member.role_grant");
      db.customRole.findFirst.mockResolvedValue(
        roleRow({ permissions: ["payments.read", "wallets.manage"] }),
      );

      const res = await assign();

      expect(res.statusCode).toBe(202);
      expect(db.approvalRequest.create.mock.calls[0][0].data).toMatchObject({
        action: "member.role_grant",
        payload: {
          kind: "custom_role",
          userId: OTHER_USER_ID,
          customRoleId: ROLE_ID,
        },
      });
      expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("goes through once the grant is approved", async () => {
      governOn(db, "member.role_grant");
      db.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
      db.customRole.findFirst.mockResolvedValue(
        roleRow({ permissions: ["members.manage"] }),
      );

      const res = await assign({ "x-approval-id": APPROVAL_ID });

      expect(res.statusCode).toBe(200);
      expect(db.membership.update).toHaveBeenCalled();
    });

    it("is not governed for a read-only role", async () => {
      governOn(db, "member.role_grant");

      const res = await assign();

      expect(res.statusCode).toBe(200);
      expect(db.approvalRequest.create).not.toHaveBeenCalled();
    });

    it("stops a custom-role member from granting what they do not hold", async () => {
      actAs("VIEWER", { permissions: ["members.manage", "resources.read"] });
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: HEADERS,
        payload: { role: "ADMIN" },
      });
      const custom = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: HEADERS,
        payload: { customRoleId: ROLE_ID },
      });

      expect(res.statusCode).toBe(403);
      expect(custom.statusCode).toBe(403);
      expect(custom.json().permission).toBe("payments.read");
      expect(db.membership.update).not.toHaveBeenCalled();
      await instance.close();
    });

    it("clears the custom role when a built-in role is given", async () => {
      db.membership.findUnique.mockResolvedValue({
        ...memberRow("VIEWER", {
          id: ROLE_ID,
          name: "Treasury",
          deletedAt: null,
        }),
        customRoleId: ROLE_ID,
      });
      db.membership.update.mockResolvedValue(memberRow("VIEWER"));
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: HEADERS,
        payload: { role: "VIEWER" },
      });

      expect(res.statusCode).toBe(200);
      expect(db.membership.update.mock.calls[0][0].data).toEqual({
        role: "VIEWER",
        customRoleId: null,
      });
      await instance.close();
    });

    it("rejects a body that sets both a role and a custom role", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: HEADERS,
        payload: { role: "VIEWER", customRoleId: ROLE_ID },
      });

      expect(res.statusCode).toBe(400);
      await instance.close();
    });
  });
});
