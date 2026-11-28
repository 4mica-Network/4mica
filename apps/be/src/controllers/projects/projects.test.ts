import { clearUserCache } from "@auth/user-store";
import { projectRoutes } from "@routes/projects";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import {
  actAs,
  ORG_ID,
  OTHER_PROJECT_ID,
  PRODUCTION_ENV_ID,
  PROJECT_ID,
  projectRow,
  SANDBOX_ENV_ID,
} from "@/test-support/tenancy";

const { authenticateRequest, getUser, db } = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  });
  return {
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    db: {
      membership: model(),
      project: model(),
      projectMembership: model(),
      auditLog: model(),
      user: model(),
      agent: model(),
      apiListing: model(),
      apiKey: model(),
      webhook: model(),
      customer: model(),
      serviceAccount: model(),
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({ prisma: db, disconnect: vi.fn(async () => {}) }));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const OTHER_USER_ID = "019fce62-0000-7000-8000-000000000001";
const OTHER_SANDBOX_ENV_ID = "019fce62-0000-7000-8000-0000000000f1";
const OTHER_PRODUCTION_ENV_ID = "019fce62-0000-7000-8000-0000000000f2";
const AGENT_A = "019fce62-4444-7000-8000-00000000000a";
const AGENT_B = "019fce62-4444-7000-8000-00000000000b";

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

const full = (row: ReturnType<typeof projectRow>, name = "Default") => ({
  ...row,
  name,
  description: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
});

const otherProject = (
  options: Parameters<typeof projectRow>[0] = {},
): ReturnType<typeof full> => ({
  ...full(projectRow({ id: OTHER_PROJECT_ID, ...options }), "Research"),
  environments: [
    { id: OTHER_SANDBOX_ENV_ID, kind: "SANDBOX" },
    { id: OTHER_PRODUCTION_ENV_ID, kind: "PRODUCTION" },
  ],
});

const app = () => initApp([{ plugin: projectRoutes }]);

const inject = async (
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const instance = await app();
  const res = await instance.inject({
    method,
    url,
    headers: { ...AUTH, ...headers },
    ...(payload ? { payload } : {}),
  });
  await instance.close();
  return res;
};

const auditActions = () =>
  db.auditLog.create.mock.calls.map(
    ([arg]) => (arg as { data: { action: string } }).data.action,
  );

const projectLookups = (
  active: ReturnType<typeof full>,
  other?: ReturnType<typeof full>,
) => {
  db.project.findFirst.mockImplementation(
    async ({ where }: { where: { id?: string; isDefault?: boolean } }) => {
      if (where.id === undefined) {
        return where.isDefault && active.isDefault ? active : null;
      }
      if (where.id === active.id) {
        return active;
      }
      return other && where.id === other.id ? other : null;
    },
  );
};

describe("project routes", () => {
  beforeEach(() => {
    for (const [name, group] of Object.entries(db)) {
      if (name === "$transaction") {
        continue;
      }
      for (const fn of Object.values(
        group as Record<string, ReturnType<typeof vi.fn>>,
      )) {
        fn.mockReset();
      }
    }
    authenticateRequest.mockReset();
    clearUserCache();
    authenticateRequest.mockResolvedValue(signedIn());
    db.user.upsert.mockResolvedValue(AUTH_USER);
    db.$transaction.mockReset();
    db.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[]),
    );
    actAs(db);
    projectLookups(full(projectRow()));
    db.auditLog.create.mockResolvedValue({ id: "audit" });
  });

  describe("listing", () => {
    it("shows a developer unrestricted projects and the restricted ones they are on", async () => {
      actAs(db, "DEVELOPER");
      db.project.findMany.mockResolvedValue([
        full(projectRow()),
        otherProject({ restricted: true }),
        {
          ...otherProject({ restricted: true, memberRole: "VIEWER" }),
          id: "019fce62-0000-7000-8000-0000000000d3",
          slug: "ops",
        },
      ]);

      const res = await inject("GET", "/me/projects");

      expect(res.statusCode).toBe(200);
      const items = res.json().items;
      expect(items.map((p: { slug: string }) => p.slug)).toEqual([
        "default",
        "ops",
      ]);
      expect(items[0]).toMatchObject({ role: "DEVELOPER", isDefault: true });
      expect(items[1].role).toBe("VIEWER");
      expect(items[1].permissions.SANDBOX).toEqual([
        "project.read",
        "resources.read",
        "payments.read",
      ]);
      expect(db.project.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });

    it("drops write permissions in production when the project restricts it", async () => {
      actAs(db, "DEVELOPER");
      db.project.findMany.mockResolvedValue([
        full(projectRow({ restrictProduction: true })),
      ]);

      const [project] = (await inject("GET", "/me/projects")).json().items;

      expect(project.permissions.SANDBOX).toContain("resources.write");
      expect(project.permissions.PRODUCTION).not.toContain("resources.write");
      expect(project.permissions.PRODUCTION).toContain("resources.read");
    });
  });

  describe("creating", () => {
    it("refuses a viewer", async () => {
      actAs(db, "VIEWER");

      const res = await inject("POST", "/me/projects", { name: "Research" });

      expect(res.statusCode).toBe(403);
      expect(db.project.create).not.toHaveBeenCalled();
    });

    it("makes a developer the admin of the project they create", async () => {
      actAs(db, "DEVELOPER");
      db.project.findMany.mockResolvedValue([{ slug: "default" }]);
      db.project.create.mockResolvedValue({
        ...otherProject({ memberRole: "ADMIN" }),
      });

      const res = await inject("POST", "/me/projects", {
        name: "Research Lab",
        restricted: true,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: OTHER_PROJECT_ID, role: "ADMIN" });
      expect(db.project.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG_ID,
        createdById: USER_ID,
        slug: "research-lab",
        restricted: true,
        environments: {
          create: [{ kind: "SANDBOX" }, { kind: "PRODUCTION" }],
        },
        members: { create: { userId: USER_ID, role: "ADMIN" } },
      });
      expect(auditActions()).toEqual(["project.created"]);
    });

    it("does not add an owner as an explicit member", async () => {
      db.project.findMany.mockResolvedValue([]);
      db.project.create.mockResolvedValue(otherProject());

      await inject("POST", "/me/projects", { name: "Research" });

      expect(db.project.create.mock.calls[0][0].data.members).toBeUndefined();
    });

    it("refuses a slug the organization already uses", async () => {
      db.project.findFirst.mockImplementation(
        async ({ where }: { where: { slug?: string; isDefault?: boolean } }) =>
          where.slug === "research"
            ? { id: OTHER_PROJECT_ID }
            : where.isDefault
              ? full(projectRow())
              : null,
      );

      const res = await inject("POST", "/me/projects", {
        name: "Research",
        slug: "research",
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("slug_taken");
    });
  });

  describe("the active project", () => {
    it("will not archive or delete the default project", async () => {
      expect((await inject("POST", "/me/project/archive")).statusCode).toBe(
        400,
      );
      expect((await inject("DELETE", "/me/project")).statusCode).toBe(400);
      expect(db.project.update).not.toHaveBeenCalled();
    });

    it("archives another project and audits it", async () => {
      projectLookups(full(projectRow()), otherProject());

      const res = await inject("POST", "/me/project/archive", undefined, {
        "x-project-id": OTHER_PROJECT_ID,
      });

      expect(res.statusCode).toBe(200);
      expect(db.project.update.mock.calls[0][0]).toMatchObject({
        where: { id: OTHER_PROJECT_ID },
      });
      expect(db.project.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(
        Date,
      );
      expect(auditActions()).toEqual(["project.archived"]);
    });

    it("lets an archived project be unarchived but not changed otherwise", async () => {
      projectLookups(full(projectRow()), otherProject({ archived: true }));
      const headers = { "x-project-id": OTHER_PROJECT_ID };

      expect(
        (
          await inject(
            "POST",
            "/me/project/move",
            {
              kind: "agent",
              ids: [AGENT_A],
              targetProjectId: PROJECT_ID,
            },
            headers,
          )
        ).statusCode,
      ).toBe(409);
      expect(
        (await inject("POST", "/me/project/unarchive", undefined, headers))
          .statusCode,
      ).toBe(200);
    });

    it("refuses to delete a project that still has resources", async () => {
      projectLookups(full(projectRow()), otherProject());
      for (const counter of [
        db.agent,
        db.apiListing,
        db.apiKey,
        db.webhook,
        db.customer,
        db.serviceAccount,
      ]) {
        counter.count.mockResolvedValue(0);
      }
      db.customer.count.mockResolvedValue(2);

      const res = await inject("DELETE", "/me/project", undefined, {
        "x-project-id": OTHER_PROJECT_ID,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("project_not_empty");
      expect(db.project.update).not.toHaveBeenCalled();
    });

    it("deletes an empty project, freeing its slug", async () => {
      projectLookups(full(projectRow()), otherProject());
      for (const counter of [
        db.agent,
        db.apiListing,
        db.apiKey,
        db.webhook,
        db.customer,
        db.serviceAccount,
      ]) {
        counter.count.mockResolvedValue(0);
      }

      const res = await inject("DELETE", "/me/project", undefined, {
        "x-project-id": OTHER_PROJECT_ID,
      });

      expect(res.statusCode).toBe(204);
      const { data } = db.project.update.mock.calls[0][0];
      expect(data.deletedAt).toBeInstanceOf(Date);
      expect(data.slug).toMatch(/^other-deleted-/);
      expect(db.projectMembership.deleteMany).toHaveBeenCalledWith({
        where: { projectId: OTHER_PROJECT_ID },
      });
      expect(auditActions()).toEqual(["project.deleted"]);
    });

    it("lets only a project admin change its settings", async () => {
      actAs(db, "DEVELOPER");
      projectLookups(full(projectRow()));

      const res = await inject("PATCH", "/me/project", {
        restrictProduction: true,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().permission).toBe("project.update");
    });
  });

  describe("project members", () => {
    it("lists every org member with explicit and effective roles", async () => {
      projectLookups(full(projectRow({ restricted: true })));
      db.membership.findMany.mockResolvedValue([
        {
          role: "OWNER",
          user: {
            id: USER_ID,
            name: "Ada",
            username: "ada",
            email: null,
            avatarUrl: null,
            projectMemberships: [],
          },
        },
        {
          role: "DEVELOPER",
          user: {
            id: OTHER_USER_ID,
            name: "Bob",
            username: "bob",
            email: null,
            avatarUrl: null,
            projectMemberships: [],
          },
        },
        {
          role: "VIEWER",
          user: {
            id: "u3",
            name: "Cy",
            username: "cy",
            email: null,
            avatarUrl: null,
            projectMemberships: [{ role: "DEVELOPER" }],
          },
        },
      ]);

      const res = await inject("GET", "/me/project/members");

      expect(
        res
          .json()
          .items.map((m: { effectiveRole: string | null }) => m.effectiveRole),
      ).toEqual(["ADMIN", null, "DEVELOPER"]);
    });

    it("refuses to add someone who is not in the organization", async () => {
      db.membership.findUnique.mockResolvedValue(null);

      const res = await inject("PUT", `/me/project/members/${OTHER_USER_ID}`, {
        role: "DEVELOPER",
      });

      expect(res.statusCode).toBe(404);
      expect(db.projectMembership.upsert).not.toHaveBeenCalled();
    });

    it("gives an org member a project role and audits it", async () => {
      db.membership.findUnique.mockResolvedValue({ role: "VIEWER" });
      db.membership.findMany.mockResolvedValue([
        {
          role: "VIEWER",
          user: {
            id: OTHER_USER_ID,
            name: "Bob",
            username: "bob",
            email: null,
            avatarUrl: null,
            projectMemberships: [{ role: "DEVELOPER" }],
          },
        },
      ]);

      const res = await inject("PUT", `/me/project/members/${OTHER_USER_ID}`, {
        role: "DEVELOPER",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        userId: OTHER_USER_ID,
        projectRole: "DEVELOPER",
        effectiveRole: "DEVELOPER",
      });
      expect(db.projectMembership.upsert.mock.calls[0][0]).toMatchObject({
        where: {
          projectId_userId: { projectId: PROJECT_ID, userId: OTHER_USER_ID },
        },
        create: {
          projectId: PROJECT_ID,
          userId: OTHER_USER_ID,
          role: "DEVELOPER",
        },
      });
      expect(auditActions()).toEqual(["project.member_set"]);
    });

    it("forbids a project developer from managing members", async () => {
      actAs(db, "DEVELOPER");
      projectLookups(full(projectRow()));

      const res = await inject(
        "DELETE",
        `/me/project/members/${OTHER_USER_ID}`,
      );

      expect(res.statusCode).toBe(403);
      expect(db.projectMembership.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("moving resources", () => {
    const move = (body: Record<string, unknown>, headers = {}) =>
      inject("POST", "/me/project/move", body, headers);

    it("moves agents and their keys into the same environment of the target", async () => {
      projectLookups(full(projectRow()), otherProject());
      db.agent.findMany.mockResolvedValue([{ id: AGENT_A }]);

      const res = await move(
        {
          kind: "agent",
          ids: [AGENT_A, AGENT_B],
          targetProjectId: OTHER_PROJECT_ID,
        },
        { "x-environment": "production" },
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ moved: [AGENT_A], notFound: [AGENT_B] });
      expect(db.agent.findMany.mock.calls[0][0].where).toMatchObject({
        id: { in: [AGENT_A, AGENT_B] },
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: PRODUCTION_ENV_ID,
        deletedAt: null,
      });
      const placed = {
        projectId: OTHER_PROJECT_ID,
        environmentId: OTHER_PRODUCTION_ENV_ID,
      };
      expect(db.agent.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [AGENT_A] } },
        data: placed,
      });
      expect(db.apiKey.updateMany).toHaveBeenCalledWith({
        where: { agentId: { in: [AGENT_A] } },
        data: placed,
      });
      expect(auditActions()).toEqual(["project.resources_moved"]);
    });

    it("moves customers between projects without touching environments", async () => {
      projectLookups(full(projectRow()), otherProject());
      db.customer.findMany.mockResolvedValue([{ id: AGENT_A }]);

      await move({
        kind: "customer",
        ids: [AGENT_A],
        targetProjectId: OTHER_PROJECT_ID,
      });

      expect(
        db.customer.findMany.mock.calls[0][0].where.environmentId,
      ).toBeUndefined();
      expect(db.customer.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [AGENT_A] } },
        data: { projectId: OTHER_PROJECT_ID },
      });
    });

    it("404s on a target the caller cannot see", async () => {
      actAs(db, "DEVELOPER");
      projectLookups(full(projectRow()), otherProject({ restricted: true }));

      const res = await move({
        kind: "agent",
        ids: [AGENT_A],
        targetProjectId: OTHER_PROJECT_ID,
      });

      expect(res.statusCode).toBe(404);
      expect(db.agent.findMany).not.toHaveBeenCalled();
    });

    it("refuses a target where the caller may only read", async () => {
      actAs(db, "DEVELOPER");
      projectLookups(
        full(projectRow()),
        otherProject({ restricted: true, memberRole: "VIEWER" }),
      );

      const res = await move({
        kind: "agent",
        ids: [AGENT_A],
        targetProjectId: OTHER_PROJECT_ID,
      });

      expect(res.statusCode).toBe(403);
      expect(db.agent.updateMany).not.toHaveBeenCalled();
    });

    it("refuses to move into the project the resources are already in", async () => {
      const res = await move({
        kind: "agent",
        ids: [AGENT_A],
        targetProjectId: PROJECT_ID,
      });

      expect(res.statusCode).toBe(400);
    });

    it("scopes webhooks by the active sandbox environment", async () => {
      projectLookups(full(projectRow()), otherProject());
      db.webhook.findMany.mockResolvedValue([]);

      await move({
        kind: "webhook",
        ids: [AGENT_A],
        targetProjectId: OTHER_PROJECT_ID,
      });

      expect(db.webhook.findMany.mock.calls[0][0].where.environmentId).toBe(
        SANDBOX_ENV_ID,
      );
      expect(db.webhook.updateMany).not.toHaveBeenCalled();
    });
  });
});
