import { randomUUID } from "node:crypto";
import type { OrgRole, ProjectRole } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { approvalRoutes } from "@routes/approvals";
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

const url = vi.hoisted(() => {
  const value = process.env.INTEGRATION_DATABASE_URL;
  if (value) {
    process.env.DATABASE_URL = value;
  }
  return value;
});

const { onApprovalResolved } = vi.hoisted(() => ({
  onApprovalResolved: vi.fn(async () => {}),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: async (request: Request) => {
      const clerkUserId = (request.headers.get("authorization") ?? "").slice(7);
      return {
        isAuthenticated: true,
        status: "signed-in",
        reason: null,
        toAuth: () => ({
          tokenType: "session_token",
          userId: clerkUserId,
          sessionId: `sess_${clerkUserId}`,
          sessionClaims: {
            sub: clerkUserId,
            sid: `sess_${clerkUserId}`,
            fva: [1, -1],
          },
        }),
      };
    },
    users: { getUser: vi.fn() },
  })),
}));

vi.mock("@controllers/spend/approval-hook", () => ({ onApprovalResolved }));

type Db = typeof import("@4mica/db")["prisma"];

describe.skipIf(!url)("restricted-project approvals on real Postgres", () => {
  let db: Db;
  let app: Awaited<ReturnType<typeof initApp>>;
  const orgs: string[] = [];
  const users: string[] = [];

  beforeAll(async () => {
    db = (await import("@4mica/db")).prisma;
    app = await initApp([
      { plugin: approvalRoutes },
      { plugin: financeAlertRoutes },
    ]);
  });

  afterAll(async () => {
    await app?.close();
    if (!db) {
      return;
    }
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fourmica.audit_retention', 'on', true)`;
      await tx.auditLog.deleteMany({ where: { organizationId: { in: orgs } } });
      await tx.organization.deleteMany({ where: { id: { in: orgs } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
    await db.$disconnect();
  });

  beforeEach(() => {
    clearUserCache();
    onApprovalResolved.mockClear();
  });

  const user = async () => {
    const clerkUserId = `user_${randomUUID()}`;
    const row = await db.user.create({ data: { clerkUserId } });
    users.push(row.id);
    return { id: row.id, clerkUserId };
  };

  const seed = async ({ restricted = true } = {}) => {
    const org = await db.organization.create({ data: { name: "restricted" } });
    orgs.push(org.id);
    const project = await db.project.create({
      data: {
        organizationId: org.id,
        slug: "secret",
        name: "Secret",
        restricted,
      },
    });
    const requester = await user();
    await db.membership.create({
      data: { organizationId: org.id, userId: requester.id, role: "OWNER" },
    });
    const approval = (over: { expiresAt?: Date; projectId?: string } = {}) =>
      db.approvalRequest.create({
        data: {
          organizationId: org.id,
          projectId: over.projectId ?? project.id,
          kind: "GOVERNANCE",
          action: "wallet.remove",
          summary: "Remove wallet",
          payload: { walletId: "w" },
          payloadHash: "0".repeat(64),
          requestedById: requester.id,
          requiredApprovals: 1,
          expiresAt: over.expiresAt ?? new Date(Date.now() + 86_400_000),
        },
      });
    const alert = () =>
      db.financialAlert.create({
        data: {
          organizationId: org.id,
          projectId: project.id,
          kind: "POLICY_DENIAL",
          title: "Denied",
          detail: { secret: "restricted detail" },
        },
      });
    const member = async (
      role: OrgRole,
      options: {
        projectRole?: ProjectRole;
        custom?: { permissions: string[]; projectRole: ProjectRole };
      } = {},
    ) => {
      const person = await user();
      const customRole = options.custom
        ? await db.customRole.create({
            data: {
              organizationId: org.id,
              name: `custom-${randomUUID()}`,
              ...options.custom,
            },
          })
        : null;
      await db.membership.create({
        data: {
          organizationId: org.id,
          userId: person.id,
          role,
          customRoleId: customRole?.id ?? null,
        },
      });
      if (options.projectRole) {
        await db.projectMembership.create({
          data: {
            projectId: project.id,
            userId: person.id,
            role: options.projectRole,
          },
        });
      }
      return person;
    };
    return {
      orgId: org.id,
      projectId: project.id,
      requester,
      approval,
      alert,
      member,
    };
  };

  const send = (
    orgId: string,
    who: { clerkUserId: string },
    method: "GET" | "POST",
    path: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method,
      url: path,
      headers: {
        authorization: `Bearer ${who.clerkUserId}`,
        "x-org-id": orgId,
      },
      ...(payload ? { payload } : {}),
    });

  const untouched = async (orgId: string, approvalId: string) => {
    const row = await db.approvalRequest.findUniqueOrThrow({
      where: { id: approvalId },
      select: {
        status: true,
        decidedAt: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    expect(row.status).toBe("PENDING");
    expect(row.decidedAt).toBeNull();
    expect(
      await db.approvalDecision.count({
        where: { approvalRequestId: approvalId },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: { organizationId: orgId, targetId: approvalId },
      }),
    ).toBe(0);
    expect(onApprovalResolved).not.toHaveBeenCalled();
  };

  const waitForLockWait = async (pending: Promise<unknown>) => {
    let settled = false;
    void pending.finally(() => {
      settled = true;
    });
    for (let attempt = 0; attempt < 200 && !settled; attempt++) {
      const [row] = await db.$queryRaw<{ waiting: bigint }[]>`
        SELECT count(*) AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (Number(row?.waiting ?? 0) > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };

  const holdOpen = (
    work: (
      tx: Parameters<Parameters<Db["$transaction"]>[0]>[0],
    ) => Promise<unknown>,
  ) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const done = db.$transaction(
      async (tx) => {
        await work(tx);
        ready();
        await gate;
      },
      { timeout: 20_000 },
    );
    return { started, release, done };
  };

  it("denies a finance member deciding on a restricted project they do not belong to", async () => {
    const s = await seed();
    const finance = await s.member("FINANCE");
    const approval = await s.approval();

    const res = await send(
      s.orgId,
      finance,
      "POST",
      `/me/approvals/${approval.id}/decide`,
      { vote: "APPROVE" },
    );

    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain("wallet");
    await untouched(s.orgId, approval.id);
  });

  it("denies a custom role with approvals.decide that is not a project member", async () => {
    const s = await seed();
    const custom = await s.member("DEVELOPER", {
      custom: {
        permissions: ["finance.read", "approvals.decide"],
        projectRole: "DEVELOPER",
      },
    });
    const approval = await s.approval();

    const res = await send(
      s.orgId,
      custom,
      "POST",
      `/me/approvals/${approval.id}/decide`,
      { vote: "REJECT" },
    );

    expect(res.statusCode).toBe(404);
    await untouched(s.orgId, approval.id);
  });

  it("lets a member of the restricted project decide", async () => {
    const s = await seed();
    const finance = await s.member("FINANCE", { projectRole: "VIEWER" });
    const approval = await s.approval();

    const res = await send(
      s.orgId,
      finance,
      "POST",
      `/me/approvals/${approval.id}/decide`,
      { vote: "APPROVE" },
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("APPROVED");
    expect(onApprovalResolved).toHaveBeenCalledOnce();
    expect(
      await db.auditLog.count({
        where: {
          organizationId: s.orgId,
          targetId: approval.id,
          action: "approval.approved",
        },
      }),
    ).toBe(1);
  });

  it("refuses a requester who has lost access to the project to cancel", async () => {
    const s = await seed();
    const developer = await s.member("DEVELOPER", { projectRole: "DEVELOPER" });
    const approval = await db.approvalRequest.create({
      data: {
        organizationId: s.orgId,
        projectId: s.projectId,
        kind: "GOVERNANCE",
        action: "wallet.remove",
        summary: "Remove wallet",
        payload: {},
        payloadHash: "0".repeat(64),
        requestedById: developer.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await db.projectMembership.deleteMany({ where: { userId: developer.id } });

    const res = await send(
      s.orgId,
      developer,
      "POST",
      `/me/approvals/${approval.id}/cancel`,
    );

    expect(res.statusCode).toBe(404);
    await untouched(s.orgId, approval.id);
  });

  it("re-checks a restriction committed while the decision waits", async () => {
    const s = await seed({ restricted: false });
    const finance = await s.member("FINANCE");
    const approval = await s.approval();

    const restrict = holdOpen((tx) =>
      tx.project.update({
        where: { id: s.projectId },
        data: { restricted: true },
      }),
    );
    await restrict.started;
    const pending = send(
      s.orgId,
      finance,
      "POST",
      `/me/approvals/${approval.id}/decide`,
      { vote: "APPROVE" },
    );
    await waitForLockWait(pending);
    restrict.release();
    await restrict.done;
    const res = await pending;

    expect(res.statusCode).toBe(404);
    await untouched(s.orgId, approval.id);
  });

  it("re-checks a project membership removed while the decision waits", async () => {
    const s = await seed();
    const finance = await s.member("FINANCE", { projectRole: "VIEWER" });
    const approval = await s.approval();

    const remove = holdOpen((tx) =>
      tx.projectMembership.deleteMany({ where: { userId: finance.id } }),
    );
    await remove.started;
    const pending = send(
      s.orgId,
      finance,
      "POST",
      `/me/approvals/${approval.id}/decide`,
      { vote: "APPROVE" },
    );
    await waitForLockWait(pending);
    remove.release();
    await remove.done;
    const res = await pending;

    expect(res.statusCode).toBe(404);
    await untouched(s.orgId, approval.id);
  });

  it("denies acknowledging an alert of a restricted project without disclosing it", async () => {
    const s = await seed();
    const finance = await s.member("FINANCE");
    const custom = await s.member("DEVELOPER", {
      custom: {
        permissions: ["finance.read", "finance.manage"],
        projectRole: "VIEWER",
      },
    });
    const alert = await s.alert();

    for (const who of [finance, custom]) {
      const res = await send(
        s.orgId,
        who,
        "POST",
        `/me/finance/alerts/${alert.id}/acknowledge`,
      );
      expect(res.statusCode).toBe(404);
      expect(JSON.stringify(res.json())).not.toContain("restricted detail");
    }

    const row = await db.financialAlert.findUniqueOrThrow({
      where: { id: alert.id },
    });
    expect(row.acknowledgedAt).toBeNull();
    expect(row.acknowledgedById).toBeNull();
    expect(
      await db.auditLog.count({
        where: { organizationId: s.orgId, targetId: alert.id },
      }),
    ).toBe(0);
  });

  it("acknowledges a visible alert once and audits it in the same transaction", async () => {
    const s = await seed();
    const finance = await s.member("FINANCE", { projectRole: "VIEWER" });
    const alert = await s.alert();

    const first = await send(
      s.orgId,
      finance,
      "POST",
      `/me/finance/alerts/${alert.id}/acknowledge`,
    );
    const second = await send(
      s.orgId,
      finance,
      "POST",
      `/me/finance/alerts/${alert.id}/acknowledge`,
    );

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().acknowledgedBy.id).toBe(finance.id);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: s.orgId,
          targetId: alert.id,
          action: "finance_alert.acknowledged",
        },
      }),
    ).toBe(1);
  });

  it("never expires an inaccessible approval from a read, and expires a visible one exactly once", async () => {
    const s = await seed();
    const finance = await s.member("FINANCE");
    const stale = await s.approval({ expiresAt: new Date(Date.now() - 1000) });

    expect(
      (await send(s.orgId, finance, "GET", "/me/approvals")).statusCode,
    ).toBe(200);
    expect(
      (await send(s.orgId, finance, "GET", `/me/approvals/${stale.id}`))
        .statusCode,
    ).toBe(404);
    await untouched(s.orgId, stale.id);

    const owner = s.requester;
    expect(
      (await send(s.orgId, owner, "GET", `/me/approvals/${stale.id}`)).json()
        .status,
    ).toBe("EXPIRED");
    expect(
      (await send(s.orgId, owner, "GET", "/me/approvals")).statusCode,
    ).toBe(200);
    const row = await db.approvalRequest.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(row.status).toBe("EXPIRED");
    expect(onApprovalResolved).toHaveBeenCalledOnce();
  });
});
