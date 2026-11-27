import { type OrgRole, Prisma } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { organizationRoutes } from "@routes/organizations";
import { hashSecret } from "@utils/secrets";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import {
  APPROVAL_HEADERS,
  APPROVAL_ID,
  approvedFor,
  governOn,
} from "@/test-support/governance";
import {
  actAs,
  membershipRow,
  ORG_ID,
  OTHER_ORG_ID,
} from "@/test-support/tenancy";

const { authenticateRequest, getUser, db } = vi.hoisted(() => {
  const db = {
    membership: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    projectMembership: { deleteMany: vi.fn() },
    organization: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    invitation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    governanceSettings: { findUnique: vi.fn() },
    approvalRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { authenticateRequest: vi.fn(), getUser: vi.fn(), db };
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
const INVITATION_ID = "019fce62-0000-7000-8000-0000000000c3";
const TOKEN = "4mica_inv_abcdefghijklmnopqrstuvwxyz0123456789";

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

const AUTH = { authorization: "Bearer good" };
const TEAM = { ...AUTH, "x-org-id": ORG_ID };

const orgRow = (over: Record<string, unknown> = {}) => ({
  id: ORG_ID,
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  _count: { memberships: 2 },
  ...over,
});

const memberRow = (userId: string, role: string) => ({
  role,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  user: {
    id: userId,
    name: "Someone",
    username: "someone",
    email: `${userId}@example.com`,
    avatarUrl: null,
  },
});

const actInTeam = (role: OrgRole) => {
  actAs(db, role);
  db.membership.findFirst.mockImplementation(async () =>
    membershipRow(role, ORG_ID, false),
  );
};

const invitationByToken = (over: Record<string, unknown> = {}) => ({
  id: INVITATION_ID,
  email: "ada@example.com",
  role: "DEVELOPER",
  expiresAt: new Date(Date.now() + 86_400_000),
  acceptedAt: null,
  declinedAt: null,
  revokedAt: null,
  organizationId: ORG_ID,
  organization: {
    id: ORG_ID,
    name: "Acme",
    handle: "acme",
    avatarUrl: null,
    deletedAt: null,
  },
  invitedBy: { name: "Grace" },
  ...over,
});

const app = () => initApp([{ plugin: organizationRoutes }]);

const auditActions = () =>
  db.auditLog.create.mock.calls.map(
    ([arg]) => (arg as { data: { action: string } }).data.action,
  );

describe("organization routes", () => {
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
    authenticateRequest.mockReset();
    getUser.mockReset();
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    db.user.upsert.mockResolvedValue(AUTH_USER);
    db.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[]),
    );
    actAs(db);
    getUser.mockResolvedValue({ emailAddresses: [] });
  });

  describe("listing and creating", () => {
    it("lists the caller's organizations with their permissions and the default", async () => {
      db.membership.findMany.mockResolvedValue([
        {
          role: "OWNER",
          organization: orgRow({ id: OTHER_ORG_ID, personal: true }),
        },
        { role: "DEVELOPER", organization: orgRow() },
        {
          role: "VIEWER",
          organization: orgRow({ id: "019fce62-0000-7000-8000-0000000000c9" }),
        },
      ]);
      db.user.findUnique.mockResolvedValue({ defaultOrganizationId: null });
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organizations",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.defaultId).toBe(OTHER_ORG_ID);
      expect(body.items[1]).toMatchObject({
        id: ORG_ID,
        role: "DEVELOPER",
        memberCount: 2,
        permissions: [
          "projects.create",
          "resources.write",
          "resources.read",
          "payments.read",
          "finance.read",
        ],
      });
      expect(body.items[2]).toMatchObject({
        role: "VIEWER",
        permissions: ["resources.read", "payments.read", "finance.read"],
      });
      expect(db.membership.findMany.mock.calls[0][0].where).toMatchObject({
        userId: USER_ID,
        organization: { deletedAt: null },
      });

      await instance.close();
    });

    it("refuses a handle someone already holds", async () => {
      db.organization.findFirst.mockResolvedValue(null);
      db.user.findFirst.mockResolvedValue({ id: OTHER_USER_ID });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organizations",
        headers: AUTH,
        payload: { name: "Acme", handle: "acme" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("handle_taken");
      expect(db.organization.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses a reserved handle", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organizations",
        headers: AUTH,
        payload: { name: "Admins", handle: "admin" },
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("creates the organization with the caller as owner and audits it", async () => {
      db.organization.findFirst.mockResolvedValue(null);
      db.user.findFirst.mockResolvedValue(null);
      db.organization.create.mockResolvedValue(
        orgRow({ _count: { memberships: 1 } }),
      );
      db.auditLog.create.mockResolvedValue({ id: "a" });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organizations",
        headers: AUTH,
        payload: { name: "Acme", handle: "Acme" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: ORG_ID, role: "OWNER" });
      expect(db.organization.create.mock.calls[0][0].data).toMatchObject({
        name: "Acme",
        handle: "acme",
        memberships: { create: { userId: USER_ID, role: "OWNER" } },
        projects: {
          create: {
            slug: "default",
            isDefault: true,
            environments: {
              create: [{ kind: "SANDBOX" }, { kind: "PRODUCTION" }],
            },
          },
        },
      });
      expect(auditActions()).toEqual(["org.created"]);

      await instance.close();
    });
  });

  describe("the active organization", () => {
    it("will not change a personal workspace's handle", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: "/me/organization",
        headers: AUTH,
        payload: { handle: "new-handle" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("personal_organization");

      await instance.close();
    });

    it("will not delete a personal workspace", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: "/me/organization",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(db.organization.update).not.toHaveBeenCalled();

      await instance.close();
    });

    it("lets only an owner delete an organization", async () => {
      actInTeam("ADMIN");
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: "/me/organization",
        headers: TEAM,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: "forbidden",
        permission: "org.delete",
      });
      expect(db.organization.update).not.toHaveBeenCalled();

      await instance.close();
    });

    it("soft-deletes, frees the handle and revokes open invitations", async () => {
      actInTeam("OWNER");
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: "/me/organization",
        headers: TEAM,
      });

      expect(res.statusCode).toBe(204);
      expect(db.organization.update.mock.calls[0][0]).toMatchObject({
        where: { id: ORG_ID },
        data: { handle: null },
      });
      expect(db.invitation.updateMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
      });
      expect(auditActions()).toEqual(["org.deleted"]);

      await instance.close();
    });

    it("404s for an organization the caller does not belong to", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organization/members",
        headers: { ...AUTH, "x-org-id": OTHER_ORG_ID },
      });

      expect(res.statusCode).toBe(404);
      expect(db.membership.findMany).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses to let anyone leave their personal workspace", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/leave",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses to let the last owner leave", async () => {
      actInTeam("OWNER");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(memberRow(USER_ID, "OWNER"));
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/leave",
        headers: TEAM,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("last_owner");
      expect(db.membership.delete).not.toHaveBeenCalled();

      await instance.close();
    });
  });

  describe("members", () => {
    it.each([
      "DEVELOPER",
      "VIEWER",
    ] as const)("forbids a %s from changing roles", async (role) => {
      actInTeam(role);
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: TEAM,
        payload: { role: "ADMIN" },
      });

      expect(res.statusCode).toBe(403);
      expect(db.membership.update).not.toHaveBeenCalled();

      await instance.close();
    });

    it("forbids an admin from making someone an owner", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "DEVELOPER"),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: TEAM,
        payload: { role: "OWNER" },
      });

      expect(res.statusCode).toBe(403);
      expect(db.membership.update).not.toHaveBeenCalled();

      await instance.close();
    });

    it("forbids an admin from removing an owner", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "OWNER"),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: TEAM,
      });

      expect(res.statusCode).toBe(403);
      expect(db.membership.delete).not.toHaveBeenCalled();

      await instance.close();
    });

    it("will not demote the last owner", async () => {
      actInTeam("OWNER");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(memberRow(USER_ID, "OWNER"));
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${USER_ID}`,
        headers: TEAM,
        payload: { role: "ADMIN" },
      });

      expect(res.statusCode).toBe(409);
      expect(db.membership.update).not.toHaveBeenCalled();

      await instance.close();
    });

    it("changes a role, locking the owners first, and audits it", async () => {
      actInTeam("OWNER");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "DEVELOPER"),
      );
      db.membership.update.mockResolvedValue(memberRow(OTHER_USER_ID, "ADMIN"));
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: TEAM,
        payload: { role: "ADMIN" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        userId: OTHER_USER_ID,
        role: "ADMIN",
      });
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.membership.update.mock.calls[0][0].where).toEqual({
        organizationId_userId: {
          organizationId: ORG_ID,
          userId: OTHER_USER_ID,
        },
      });
      expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG_ID,
        actorUserId: USER_ID,
        action: "member.role_changed",
        targetId: OTHER_USER_ID,
        metadata: { from: "DEVELOPER", to: "ADMIN" },
      });

      await instance.close();
    });

    it("removes a member and keeps the organization's resources", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "DEVELOPER"),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: TEAM,
      });

      expect(res.statusCode).toBe(204);
      expect(db.membership.delete).toHaveBeenCalledOnce();
      expect(db.projectMembership.deleteMany.mock.calls[0][0]).toEqual({
        where: { userId: OTHER_USER_ID, project: { organizationId: ORG_ID } },
      });
      expect(auditActions()).toEqual(["member.removed"]);

      await instance.close();
    });

    it("transfers ownership and steps the old owner down to admin", async () => {
      actInTeam("OWNER");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "ADMIN"),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/transfer",
        headers: TEAM,
        payload: { userId: OTHER_USER_ID },
      });

      expect(res.statusCode).toBe(204);
      const updates = db.membership.update.mock.calls.map(([arg]) => {
        const call = arg as {
          where: { organizationId_userId: { userId: string } };
          data: { role: string };
        };
        return [call.where.organizationId_userId.userId, call.data.role];
      });
      expect(updates).toEqual([
        [OTHER_USER_ID, "OWNER"],
        [USER_ID, "ADMIN"],
      ]);
      expect(auditActions()).toEqual(["org.transferred"]);

      await instance.close();
    });
  });

  describe("invitations", () => {
    it("will not invite into a personal workspace", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: AUTH,
        payload: { emails: ["grace@example.com"] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("personal_organization");

      await instance.close();
    });

    it("will not let an admin invite an owner", async () => {
      actInTeam("ADMIN");
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: TEAM,
        payload: { emails: ["grace@example.com"], role: "OWNER" },
      });

      expect(res.statusCode).toBe(403);
      expect(db.invitation.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it.each([
      [undefined, "DEVELOPER"],
      ["DEVELOPER", "DEVELOPER"],
      ["VIEWER", "VIEWER"],
      ["FINANCE", "FINANCE"],
    ] as const)("invites with role %s as %s", async (requested, stored) => {
      actInTeam("ADMIN");
      db.membership.findMany.mockResolvedValue([]);
      db.membership.findFirst.mockImplementation(async () => ({
        ...membershipRow("ADMIN", ORG_ID, false),
        organization: { ...orgRow() },
      }));
      db.invitation.create.mockImplementation(
        async ({ data }: { data: { email: string; role: string } }) => ({
          id: INVITATION_ID,
          email: data.email,
          role: data.role,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          createdAt: new Date(),
          invitedBy: { id: USER_ID, name: "Ada Lovelace" },
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: TEAM,
        payload: {
          emails: ["grace@example.com"],
          ...(requested ? { role: requested } : {}),
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().items[0].role).toBe(stored);
      expect(db.invitation.create.mock.calls[0][0].data.role).toBe(stored);

      await instance.close();
    });

    it("rejects the retired MEMBER role", async () => {
      actInTeam("OWNER");
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: TEAM,
        payload: { emails: ["grace@example.com"], role: "MEMBER" },
      });

      expect(res.statusCode).toBe(400);
      expect(db.invitation.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("rejects inviting someone who is already a member", async () => {
      actInTeam("OWNER");
      db.membership.findMany.mockResolvedValue([
        { user: { email: "Grace@Example.com" } },
      ]);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: TEAM,
        payload: { emails: ["grace@example.com"] },
      });

      expect(res.statusCode).toBe(400);
      expect(db.invitation.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("stores only a hash of each token and replaces older open invitations", async () => {
      actInTeam("ADMIN");
      db.membership.findMany.mockResolvedValue([]);
      db.membership.findFirst.mockImplementation(
        async (args: { select?: { organization?: unknown } }) =>
          args.select &&
          "organization" in args.select &&
          !("role" in (args.select as object))
            ? null
            : {
                ...membershipRow("ADMIN", ORG_ID, false),
                organization: { ...orgRow() },
              },
      );
      db.invitation.create.mockImplementation(
        async ({ data }: { data: { email: string } }) => ({
          id: INVITATION_ID,
          email: data.email,
          role: "DEVELOPER",
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          createdAt: new Date(),
          invitedBy: { id: USER_ID, name: "Ada Lovelace" },
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: TEAM,
        payload: {
          emails: [
            "Grace@example.com",
            "grace@example.com",
            "alan@example.com",
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().items).toHaveLength(2);
      expect(db.invitation.updateMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
        email: { in: ["grace@example.com", "alan@example.com"] },
        acceptedAt: null,
        revokedAt: null,
      });
      for (const [{ data }] of db.invitation.create.mock.calls) {
        expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(data.organizationId).toBe(ORG_ID);
        expect(data.invitedById).toBe(USER_ID);
      }
      expect(auditActions()).toEqual(["member.invited", "member.invited"]);

      await instance.close();
    });

    it("answers 410 for an expired invitation", async () => {
      db.invitation.findUnique.mockResolvedValue(
        invitationByToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/invitations/${TOKEN}/accept`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(410);
      expect(db.invitation.findUnique.mock.calls[0][0].where).toEqual({
        tokenHash: hashSecret(TOKEN),
      });
      expect(db.membership.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses an invitation addressed to someone else", async () => {
      db.invitation.findUnique.mockResolvedValue(
        invitationByToken({ email: "grace@example.com" }),
      );
      db.user.findUnique.mockResolvedValue({
        email: "ada@example.com",
        emailVerified: true,
      });
      getUser.mockResolvedValue({
        emailAddresses: [
          {
            emailAddress: "ada@example.com",
            verification: { status: "verified" },
          },
          {
            emailAddress: "grace@example.com",
            verification: { status: "unverified" },
          },
        ],
      });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/invitations/${TOKEN}/accept`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("invitation_email_mismatch");
      expect(db.membership.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("joins with the invited role when the address is verified in Clerk", async () => {
      db.invitation.findUnique.mockResolvedValue(
        invitationByToken({ email: "ada@work.example", role: "ADMIN" }),
      );
      db.user.findUnique.mockResolvedValue({
        email: "ada@example.com",
        emailVerified: false,
      });
      getUser.mockResolvedValue({
        emailAddresses: [
          {
            emailAddress: "Ada@Work.example",
            verification: { status: "verified" },
          },
        ],
      });
      db.invitation.updateMany.mockResolvedValue({ count: 1 });
      db.membership.findUnique.mockResolvedValue(null);
      db.membership.findUniqueOrThrow.mockResolvedValue({
        role: "ADMIN",
        organization: orgRow(),
      });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/invitations/${TOKEN}/accept`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().organization).toMatchObject({
        id: ORG_ID,
        role: "ADMIN",
      });
      expect(db.membership.create.mock.calls[0][0].data).toEqual({
        organizationId: ORG_ID,
        userId: USER_ID,
        role: "ADMIN",
      });
      expect(auditActions()).toEqual(["member.joined"]);

      await instance.close();
    });

    it("answers 410 when the invitation was used between read and accept", async () => {
      db.invitation.findUnique.mockResolvedValue(invitationByToken());
      db.user.findUnique.mockResolvedValue({
        email: "ada@example.com",
        emailVerified: true,
      });
      db.invitation.updateMany.mockResolvedValue({ count: 0 });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/invitations/${TOKEN}/accept`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(410);
      expect(db.membership.create).not.toHaveBeenCalled();

      await instance.close();
    });
  });

  describe("the finance role", () => {
    it("gives finance read access, approvals and finance management but no keys or members", async () => {
      db.membership.findMany.mockResolvedValue([
        { role: "FINANCE", organization: orgRow() },
      ]);
      db.user.findUnique.mockResolvedValue({ defaultOrganizationId: null });
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organizations",
        headers: AUTH,
      });

      expect(res.json().items[0]).toMatchObject({
        role: "FINANCE",
        permissions: [
          "resources.read",
          "payments.read",
          "finance.read",
          "finance.manage",
          "approvals.decide",
          "reports.export",
        ],
      });

      await instance.close();
    });

    it("lets an admin make someone finance", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "DEVELOPER"),
      );
      db.membership.update.mockResolvedValue(
        memberRow(OTHER_USER_ID, "FINANCE"),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: TEAM,
        payload: { role: "FINANCE" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().role).toBe("FINANCE");
      expect(db.membership.update.mock.calls[0][0].data).toEqual({
        role: "FINANCE",
      });

      await instance.close();
    });
  });

  describe("governed role grants", () => {
    const patchRole = async (
      role: string,
      headers: Record<string, string> = {},
    ) => {
      const instance = await app();
      const res = await instance.inject({
        method: "PATCH",
        url: `/me/organization/members/${OTHER_USER_ID}`,
        headers: { ...TEAM, ...headers },
        payload: { role },
      });
      await instance.close();
      return res;
    };

    beforeEach(() => {
      actInTeam("OWNER");
      governOn(db, "member.role_grant");
      db.$queryRaw.mockResolvedValue([{ id: "m1" }]);
      db.membership.findUnique.mockResolvedValue(
        memberRow(OTHER_USER_ID, "DEVELOPER"),
      );
      db.membership.update.mockResolvedValue(memberRow(OTHER_USER_ID, "ADMIN"));
    });

    it.each([
      "ADMIN",
      "FINANCE",
      "OWNER",
    ])("asks for approval before granting %s", async (role) => {
      const res = await patchRole(role);

      expect(res.statusCode).toBe(202);
      expect(res.json().approvalRequest.id).toBe(APPROVAL_ID);
      expect(db.approvalRequest.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG_ID,
        action: "member.role_grant",
        requestedById: USER_ID,
        payload: { kind: "role_change", userId: OTHER_USER_ID, role },
      });
      expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("does not govern lowering someone to developer or viewer", async () => {
      db.membership.update.mockResolvedValue(
        memberRow(OTHER_USER_ID, "VIEWER"),
      );

      const res = await patchRole("VIEWER");

      expect(res.statusCode).toBe(200);
      expect(db.governanceSettings.findUnique).not.toHaveBeenCalled();
    });

    it("404s before asking for approval for someone who is not a member", async () => {
      db.membership.findUnique.mockResolvedValue(null);

      const res = await patchRole("ADMIN");

      expect(res.statusCode).toBe(404);
      expect(db.approvalRequest.create).not.toHaveBeenCalled();
    });

    it("grants the role with a matching approval", async () => {
      approvedFor(db, "member.role_grant", {
        kind: "role_change",
        userId: OTHER_USER_ID,
        role: "ADMIN",
      });

      const res = await patchRole("ADMIN", APPROVAL_HEADERS);

      expect(res.statusCode).toBe(200);
      expect(db.membership.update).toHaveBeenCalledOnce();
    });

    it("refuses an approval granted for a different role", async () => {
      approvedFor(db, "member.role_grant", {
        kind: "role_change",
        userId: OTHER_USER_ID,
        role: "FINANCE",
      });

      const res = await patchRole("ADMIN", APPROVAL_HEADERS);

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("approval_invalid");
      expect(db.membership.update).not.toHaveBeenCalled();
    });

    it("asks for approval before inviting an admin, and invites with one", async () => {
      actInTeam("ADMIN");
      governOn(db, "member.role_grant");
      db.membership.findMany.mockResolvedValue([]);
      db.membership.findFirst.mockImplementation(async () => ({
        ...membershipRow("ADMIN", ORG_ID, false),
        organization: { ...orgRow() },
      }));
      db.invitation.create.mockImplementation(
        async ({ data }: { data: { email: string; role: string } }) => ({
          id: INVITATION_ID,
          email: data.email,
          role: data.role,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          createdAt: new Date(),
          invitedBy: { id: USER_ID, name: "Ada Lovelace" },
        }),
      );
      const instance = await app();
      const invite = (headers: Record<string, string> = {}) =>
        instance.inject({
          method: "POST",
          url: "/me/organization/invitations",
          headers: { ...TEAM, ...headers },
          payload: {
            emails: ["grace@example.com", "alan@example.com"],
            role: "ADMIN",
          },
        });

      const asked = await invite();
      expect(asked.statusCode).toBe(202);
      expect(db.approvalRequest.create.mock.calls[0][0].data.payload).toEqual({
        kind: "invitation",
        emails: ["alan@example.com", "grace@example.com"],
        role: "ADMIN",
      });
      expect(db.invitation.create).not.toHaveBeenCalled();

      approvedFor(db, "member.role_grant", {
        kind: "invitation",
        emails: ["alan@example.com", "grace@example.com"],
        role: "ADMIN",
      });
      const done = await invite(APPROVAL_HEADERS);
      expect(done.statusCode).toBe(201);
      expect(db.invitation.create).toHaveBeenCalledTimes(2);

      await instance.close();
    });

    it("does not govern inviting a developer", async () => {
      db.membership.findMany.mockResolvedValue([]);
      db.membership.findFirst.mockImplementation(async () => ({
        ...membershipRow("OWNER", ORG_ID, false),
        organization: { ...orgRow() },
      }));
      db.invitation.create.mockImplementation(
        async ({ data }: { data: { email: string; role: string } }) => ({
          id: INVITATION_ID,
          email: data.email,
          role: data.role,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
          createdAt: new Date(),
          invitedBy: { id: USER_ID, name: "Ada Lovelace" },
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/invitations",
        headers: TEAM,
        payload: { emails: ["grace@example.com"], role: "DEVELOPER" },
      });

      expect(res.statusCode).toBe(201);
      expect(db.approvalRequest.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("asks for approval before transferring ownership", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/transfer",
        headers: TEAM,
        payload: { userId: OTHER_USER_ID },
      });

      expect(res.statusCode).toBe(202);
      expect(db.approvalRequest.create.mock.calls[0][0].data.payload).toEqual({
        kind: "transfer",
        userId: OTHER_USER_ID,
      });
      expect(db.membership.update).not.toHaveBeenCalled();

      await instance.close();
    });

    it("transfers ownership with a matching approval", async () => {
      approvedFor(db, "member.role_grant", {
        kind: "transfer",
        userId: OTHER_USER_ID,
      });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/transfer",
        headers: { ...TEAM, ...APPROVAL_HEADERS },
        payload: { userId: OTHER_USER_ID },
      });

      expect(res.statusCode).toBe(204);
      expect(db.membership.update).toHaveBeenCalledTimes(2);

      await instance.close();
    });

    it("refuses a transfer approval granted for someone else", async () => {
      approvedFor(db, "member.role_grant", {
        kind: "transfer",
        userId: "019fce62-0000-7000-8000-000000000009",
      });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/organization/transfer",
        headers: { ...TEAM, ...APPROVAL_HEADERS },
        payload: { userId: OTHER_USER_ID },
      });

      expect(res.statusCode).toBe(409);
      expect(db.membership.update).not.toHaveBeenCalled();

      await instance.close();
    });
  });

  describe("audit log", () => {
    it.each([
      "DEVELOPER",
      "VIEWER",
    ] as const)("is hidden from a %s", async (role) => {
      actInTeam(role);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organization/audit-logs",
        headers: TEAM,
      });

      expect(res.statusCode).toBe(403);
      expect(db.auditLog.findMany).not.toHaveBeenCalled();
      expect(auditActions()).toEqual(["authz.denied"]);

      await instance.close();
    });

    const LOG_A = "019fce62-0000-7000-8000-00000000a003";
    const LOG_B = "019fce62-0000-7000-8000-00000000a002";
    const LOG_C = "019fce62-0000-7000-8000-00000000a001";

    const logRow = (id: string) => ({
      id,
      action: "org.updated",
      createdAt: new Date(),
      actor: null,
    });

    const rawSql = (call = 0) => {
      const [strings, ...values] = db.$queryRaw.mock.calls[call] as [
        TemplateStringsArray,
        ...unknown[],
      ];
      return Prisma.sql(strings, ...values);
    };

    beforeEach(() => {
      db.$queryRaw.mockReset();
      db.auditLog.findMany.mockReset();
    });

    it("pages an admin through the organization's entries only", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([
        { id: LOG_A },
        { id: LOG_B },
        { id: LOG_C },
      ]);
      db.auditLog.findMany.mockResolvedValue([logRow(LOG_A), logRow(LOG_B)]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/organization/audit-logs?limit=2",
        headers: TEAM,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ nextCursor: LOG_B });
      expect(res.json().items).toHaveLength(2);
      expect(rawSql().sql).toContain("l.organization_id = ?");
      expect(rawSql().values).toEqual([ORG_ID, 3]);
      expect(db.auditLog.findMany.mock.calls[0][0]).toMatchObject({
        where: { organizationId: ORG_ID, id: { in: [LOG_A, LOG_B] } },
      });

      await instance.close();
    });

    it("continues after the cursor", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/organization/audit-logs?cursor=${LOG_B}`,
        headers: TEAM,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [], nextCursor: null });
      expect(rawSql().sql).toContain("l.id <");
      expect(rawSql().values).toContain(LOG_B);
      expect(db.auditLog.findMany).not.toHaveBeenCalled();

      await instance.close();
    });

    it.each([
      ["from=2026-11-01", "l.created_at >=", new Date("2026-11-01T00:00:00Z")],
      ["to=2026-11-01", "l.created_at <", new Date("2026-11-02T00:00:00Z")],
      [
        "to=2026-11-01T12:00:00Z",
        "l.created_at <",
        new Date("2026-11-01T12:00:00Z"),
      ],
      ["action=wallet.removed", "l.action =", "wallet.removed"],
      ["actionPrefix=wallet.", "l.action LIKE", "wallet.%"],
      ["actionPrefix=a_b%25", "l.action LIKE", "a\\_b\\%%"],
      [`actorUserId=${OTHER_USER_ID}`, "l.actor_user_id =", OTHER_USER_ID],
      [`actorApiKeyId=${LOG_C}`, "l.actor_api_key_id =", LOG_C],
      ["targetType=wallet", "l.target_type =", "wallet"],
      ["targetId=abc", "l.target_id =", "abc"],
      [`projectId=${LOG_A}`, "l.project_id =", LOG_A],
      ["q=0xABC", "l.metadata::text ILIKE", "%0xABC%"],
    ] as const)("filters on %s", async (query, clause, value) => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/organization/audit-logs?${query}`,
        headers: TEAM,
      });

      expect(res.statusCode).toBe(200);
      expect(rawSql().sql).toContain(clause);
      expect(rawSql().values).toContainEqual(value);
      expect(rawSql().values[0]).toBe(ORG_ID);

      await instance.close();
    });

    it("searches the action, the target and the metadata", async () => {
      actInTeam("ADMIN");
      db.$queryRaw.mockResolvedValue([]);
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/organization/audit-logs?q=stripe",
        headers: TEAM,
      });

      expect(rawSql().sql).toMatch(
        /l\.action ILIKE \?\s+OR l\.target_id ILIKE \?\s+OR l\.metadata::text ILIKE/,
      );

      await instance.close();
    });

    it.each([
      "from=yesterday",
      "from=2026-02-30",
      "actorUserId=not-a-uuid",
      "projectId=1",
      "from=2026-11-02&to=2026-11-01",
    ])("refuses %s", async (query) => {
      actInTeam("ADMIN");
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/organization/audit-logs?${query}`,
        headers: TEAM,
      });

      expect(res.statusCode).toBe(400);
      expect(db.$queryRaw).not.toHaveBeenCalled();

      await instance.close();
    });

    describe("export", () => {
      const exportRow = (over: Record<string, unknown> = {}) => ({
        id: LOG_A,
        created_at: new Date("2026-11-20T10:00:00Z"),
        action: "wallet.removed",
        actor_user_id: USER_ID,
        actor_name: '=HYPERLINK("http://evil")',
        actor_api_key_id: null,
        project_id: null,
        target_type: "wallet",
        target_id: "w1",
        ip: "127.0.0.1",
        metadata: { note: "a,b" },
        ...over,
      });

      it("exports the filtered log as an audited CSV attachment", async () => {
        actInTeam("ADMIN");
        db.$queryRaw.mockResolvedValue([exportRow()]);
        const instance = await app();

        const res = await instance.inject({
          method: "GET",
          url: "/me/organization/audit-logs/export.csv?actionPrefix=wallet.&from=2026-11-01",
          headers: TEAM,
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/csv");
        expect(res.headers["content-disposition"]).toMatch(
          /^attachment; filename="audit-log-\d{4}-\d{2}-\d{2}\.csv"$/,
        );
        expect(res.headers["x-truncated"]).toBe("false");

        const lines = res.body.split("\r\n");
        expect(lines[0]).toBe(
          "id,created_at,action,actor_user_id,actor_name,actor_api_key_id,project_id,target_type,target_id,ip,metadata",
        );
        expect(lines[1]).toBe(
          `${LOG_A},2026-11-20T10:00:00.000Z,wallet.removed,${USER_ID},"'=HYPERLINK(""http://evil"")",,,wallet,w1,127.0.0.1,"{""note"":""a,b""}"`,
        );
        expect(rawSql().values).toContain("wallet.%");

        const exported = db.auditLog.create.mock.calls
          .map((call) => call[0].data)
          .find((data) => data.action === "report.exported");
        expect(exported).toMatchObject({
          organizationId: ORG_ID,
          actorUserId: USER_ID,
          targetId: "audit_logs",
          metadata: {
            report: "audit_logs",
            filters: {
              actionPrefix: "wallet.",
              from: "2026-11-01T00:00:00.000Z",
              to: null,
            },
            rows: 1,
            truncated: false,
          },
        });

        await instance.close();
      });

      it("says when the export was cut short", async () => {
        actInTeam("OWNER");
        db.$queryRaw.mockImplementation(
          async (_strings: TemplateStringsArray, ...values: unknown[]) => {
            const take = values.at(-1) as number;
            return Array.from({ length: take }, (_, index) =>
              exportRow({ id: `${index}`.padStart(8, "0") }),
            );
          },
        );
        const instance = await app();

        const res = await instance.inject({
          method: "GET",
          url: "/me/organization/audit-logs/export.csv",
          headers: TEAM,
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["x-truncated"]).toBe("true");
        expect(res.body.split("\r\n").filter(Boolean)).toHaveLength(50_001);

        await instance.close();
      });

      it.each([
        "FINANCE",
        "DEVELOPER",
        "VIEWER",
      ] as const)("is refused to a %s", async (role) => {
        actInTeam(role);
        const instance = await app();

        const res = await instance.inject({
          method: "GET",
          url: "/me/organization/audit-logs/export.csv",
          headers: TEAM,
        });

        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({ permission: "audit.read" });
        expect(db.$queryRaw).not.toHaveBeenCalled();

        await instance.close();
      });
    });
  });
});
