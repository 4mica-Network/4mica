import type { OrgRole, ProjectRole } from "@4mica/db";
import { clearUserCache } from "@auth/user-store";
import { approvalRoutes } from "@routes/approvals";
import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { AUDIT_DOWN, failAuditInTransaction } from "@/test-support/audit";
import {
  actAs,
  membershipRow,
  ORG_ID,
  OTHER_PROJECT_ID,
  PRODUCTION_ENV_ID,
  PROJECT_ID,
  SANDBOX_ENV_ID,
  visibilityRows,
} from "@/test-support/tenancy";

const { authenticateRequest, getUser, db, onApprovalResolved } = vi.hoisted(
  () => {
    const db = {
      membership: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
      auditLog: { create: vi.fn() },
      project: { findFirst: vi.fn(), findMany: vi.fn() },
      user: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
      business: { findUnique: vi.fn(), upsert: vi.fn() },
      apiKey: { findUnique: vi.fn(), update: vi.fn() },
      customer: { count: vi.fn() },
      approvalRequest: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn(),
        create: vi.fn(),
      },
      approvalDecision: { create: vi.fn() },
      governanceSettings: { findUnique: vi.fn(), upsert: vi.fn() },
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
    };
    return {
      authenticateRequest: vi.fn(),
      getUser: vi.fn(),
      db,
      onApprovalResolved:
        vi.fn<(tx: unknown, approval: { status: string }) => Promise<void>>(),
    };
  },
);

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({ prisma: db, disconnect: vi.fn(async () => {}) }));

vi.mock("@controllers/spend/approval-hook", () => ({ onApprovalResolved }));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const REQUESTER_ID = "019fce62-0000-7000-8000-000000000001";
const OTHER_ID = "019fce62-0000-7000-8000-000000000002";
const APPROVAL_ID = "019fce62-9999-7000-8000-000000000000";
const KEY_ID = "019fce62-7777-7000-8000-000000000000";
const CUSTOMER_ID = "019fce62-5555-7000-8000-000000000000";
const API_KEY = "4mica_sk_test_abcdefghijklmnop";
const PAYER = getAddress("0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90");
const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 1000);
const CREATED = new Date("2026-11-27T10:00:00Z");

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
    sessionClaims: { sub: "user_123", sid: "sess_123", fva: [1, -1] },
  }),
});

const AUTH = { authorization: "Bearer good" };
const KEY_AUTH = { authorization: `Bearer ${API_KEY}` };

const decision = (userId: string, vote: "APPROVE" | "REJECT") => ({
  vote,
  comment: null,
  createdAt: CREATED,
  user: { id: userId, name: "Someone" },
});

const stored = (over: Record<string, unknown> = {}) => ({
  id: APPROVAL_ID,
  organizationId: ORG_ID,
  kind: "GOVERNANCE",
  action: "wallet.remove",
  summary: "Remove wallet",
  payload: { walletId: "w" },
  status: "PENDING",
  requiredApprovals: 2,
  requestedById: REQUESTER_ID,
  requestedByApiKeyId: null,
  projectId: null,
  expiresAt: FUTURE,
  createdAt: CREATED,
  decidedAt: null,
  executedAt: null,
  requestedBy: { id: REQUESTER_ID, name: "Grace" },
  decisions: [] as ReturnType<typeof decision>[],
  ...over,
});

const keyRecord = (over: Record<string, unknown> = {}) => ({
  id: KEY_ID,
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  environmentId: SANDBOX_ENV_ID,
  serviceAccountId: null,
  scopes: ["APPROVALS_WRITE"],
  listingId: null,
  agentId: null,
  revokedAt: null,
  expiresAt: null,
  organization: { deletedAt: null },
  project: { deletedAt: null, archivedAt: null },
  environment: { kind: "SANDBOX" },
  serviceAccount: null,
  listing: null,
  agent: null,
  ...over,
});

const call = async (
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = AUTH,
) => {
  const instance = await initApp([{ plugin: approvalRoutes }]);
  const res = await instance.inject({
    method,
    url,
    headers,
    ...(payload ? { payload } : {}),
  });
  await instance.close();
  return res;
};

const auditActions = () =>
  db.auditLog.create.mock.calls.map(
    ([arg]) => (arg as { data: { action: string } }).data.action,
  );

const resetAll = () => {
  for (const group of Object.values(db)) {
    if (typeof group === "function") {
      (group as ReturnType<typeof vi.fn>).mockReset();
      continue;
    }
    for (const fn of Object.values(group)) {
      fn.mockReset();
    }
  }
};

const as = (role: OrgRole) => actAs(db, role);

let lockTarget: string | null = null;

const fakeQueryRaw = async (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => {
  const rows = await visibilityRows(db, strings, values);
  if (rows) {
    return rows;
  }
  if (strings.join("?").includes("FROM approval_requests")) {
    const [id, , all, ids] = values as [string, string, boolean, string[]];
    return all || lockTarget === null || ids.includes(lockTarget)
      ? [{ id }]
      : [];
  }
  return [];
};

describe("approval routes", () => {
  beforeEach(() => {
    resetAll();
    authenticateRequest.mockReset();
    onApprovalResolved.mockReset();
    clearUserCache();
    authenticateRequest.mockResolvedValue(signedIn());
    db.user.upsert.mockResolvedValue(AUTH_USER);
    db.user.findUnique.mockResolvedValue(AUTH_USER);
    db.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(db)
        : Promise.all(arg as Promise<unknown>[]),
    );
    lockTarget = null;
    db.$queryRaw.mockImplementation(fakeQueryRaw);
    db.approvalRequest.findMany.mockResolvedValue([]);
    db.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
    db.apiKey.update.mockResolvedValue({});
    as("ADMIN");
  });

  describe("listing", () => {
    it("lists the organization's requests with vote counts and whether the caller can decide", async () => {
      db.approvalRequest.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          stored({ decisions: [decision(OTHER_ID, "APPROVE")] }),
          stored({ id: "019fce62-9999-7000-8000-000000000001" }),
          stored({
            id: "019fce62-9999-7000-8000-000000000002",
            requestedById: USER_ID,
          }),
        ]);

      const res = await call("GET", "/me/approvals?status=PENDING&limit=2");

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0]).toMatchObject({
        id: APPROVAL_ID,
        approvals: 1,
        canDecide: true,
        requestedBy: { id: REQUESTER_ID, name: "Grace" },
      });
      expect(body.items[0]).not.toHaveProperty("organizationId");
      expect(body.nextCursor).toBe("019fce62-9999-7000-8000-000000000001");
      const args = db.approvalRequest.findMany.mock.calls[1][0];
      expect(args.where).toEqual({ organizationId: ORG_ID, status: "PENDING" });
      expect(args.take).toBe(3);
    });

    it("expires stale requests before listing and tells the spend engine", async () => {
      db.approvalRequest.findMany
        .mockResolvedValueOnce([
          { id: APPROVAL_ID, organizationId: ORG_ID, kind: "PAYMENT" },
        ])
        .mockResolvedValueOnce([]);

      const res = await call("GET", "/me/approvals");

      expect(res.statusCode).toBe(200);
      expect(db.approvalRequest.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: APPROVAL_ID, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      expect(onApprovalResolved).toHaveBeenCalledWith(db, {
        id: APPROVAL_ID,
        organizationId: ORG_ID,
        kind: "PAYMENT",
        status: "EXPIRED",
      });
    });

    it("reads a pending request past its expiry as expired", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ expiresAt: PAST }),
      );

      const res = await call("GET", `/me/approvals/${APPROVAL_ID}`);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "EXPIRED", canDecide: false });
    });

    it("404s for a request in another organization", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(null);

      const res = await call("GET", `/me/approvals/${APPROVAL_ID}`);

      expect(res.statusCode).toBe(404);
      expect(db.approvalRequest.findFirst.mock.calls[0][0].where).toEqual({
        id: APPROVAL_ID,
        organizationId: ORG_ID,
      });
    });

    it("keeps approvals of restricted projects out of the list and the detail for non-members", async () => {
      as("FINANCE");
      db.project.findMany.mockResolvedValue([
        { id: PROJECT_ID, restricted: false, members: [] },
        { id: OTHER_PROJECT_ID, restricted: true, members: [] },
      ]);
      db.approvalRequest.findFirst.mockResolvedValue(null);
      const visible = {
        AND: [
          { OR: [{ projectId: null }, { projectId: { in: [PROJECT_ID] } }] },
        ],
      };

      expect((await call("GET", "/me/approvals?limit=5")).statusCode).toBe(200);
      const listed = db.approvalRequest.findMany.mock.calls[1][0];
      expect(listed.where).toEqual({ organizationId: ORG_ID, ...visible });
      expect(listed.take).toBe(6);

      expect(
        (await call("GET", "/me/approvals?status=PENDING")).statusCode,
      ).toBe(200);
      expect(db.approvalRequest.findMany.mock.calls[3][0].where).toEqual({
        organizationId: ORG_ID,
        ...visible,
        status: "PENDING",
      });

      expect(
        (await call("GET", `/me/approvals/${APPROVAL_ID}`)).statusCode,
      ).toBe(404);
      expect(db.approvalRequest.findFirst.mock.calls[0][0].where).toEqual({
        id: APPROVAL_ID,
        organizationId: ORG_ID,
        ...visible,
      });
      expect(db.project.findMany.mock.calls[0][0]).toMatchObject({
        where: { organizationId: ORG_ID },
        select: { members: { where: { userId: USER_ID } } },
      });
    });

    it("lets a member of a restricted project see its approvals", async () => {
      as("VIEWER");
      db.project.findMany.mockResolvedValue([
        { id: PROJECT_ID, restricted: false, members: [] },
        {
          id: OTHER_PROJECT_ID,
          restricted: true,
          members: [{ role: "VIEWER" }],
        },
      ]);
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ projectId: OTHER_PROJECT_ID }),
      );

      expect(
        (await call("GET", `/me/approvals/${APPROVAL_ID}`)).statusCode,
      ).toBe(200);
      expect(
        db.approvalRequest.findFirst.mock.calls[0][0].where.AND[0].OR[1],
      ).toEqual({ projectId: { in: [PROJECT_ID, OTHER_PROJECT_ID] } });
    });

    it("never offers a viewer the decision", async () => {
      as("VIEWER");
      db.approvalRequest.findFirst.mockResolvedValue(stored());

      const res = await call("GET", `/me/approvals/${APPROVAL_ID}`);

      expect(res.json().canDecide).toBe(false);
    });
  });

  describe("deciding", () => {
    const decide = (body: Record<string, unknown> = { vote: "APPROVE" }) =>
      call("POST", `/me/approvals/${APPROVAL_ID}/decide`, body);

    it("forbids a role without approvals.decide", async () => {
      as("DEVELOPER");

      const res = await decide();

      expect(res.statusCode).toBe(403);
      expect(db.approvalDecision.create).not.toHaveBeenCalled();
    });

    it("refuses to let the requester approve their own request", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ requestedById: USER_ID }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("self_approval");
      expect(db.approvalDecision.create).not.toHaveBeenCalled();
    });

    it("allows one vote per person", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ decisions: [decision(USER_ID, "APPROVE")] }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("already_decided");
    });

    it("refuses a closed request", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ status: "APPROVED" }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("approval_closed");
    });

    it("expires a stale request instead of counting the vote", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ expiresAt: PAST }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(409);
      expect(db.approvalDecision.create).not.toHaveBeenCalled();
      expect(onApprovalResolved.mock.calls[0][1]).toMatchObject({
        status: "EXPIRED",
      });
    });

    it("lets only an owner or admin approve a role grant", async () => {
      as("FINANCE");
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ action: "member.role_grant" }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden");
      expect(db.approvalDecision.create).not.toHaveBeenCalled();
    });

    it("lets finance approve other governed changes", async () => {
      as("FINANCE");
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ requiredApprovals: 1 }),
      );
      db.approvalRequest.findUniqueOrThrow.mockResolvedValue(
        stored({
          requiredApprovals: 1,
          status: "APPROVED",
          decisions: [decision(USER_ID, "APPROVE")],
        }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(200);
    });

    it("records a vote and stays pending until enough people approve", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(stored());
      db.approvalRequest.findUniqueOrThrow.mockResolvedValue(
        stored({ decisions: [decision(USER_ID, "APPROVE")] }),
      );

      const res = await decide({ vote: "APPROVE", comment: "  fine  " });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: "PENDING",
        approvals: 1,
        canDecide: false,
      });
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.approvalDecision.create.mock.calls[0][0].data).toEqual({
        approvalRequestId: APPROVAL_ID,
        userId: USER_ID,
        vote: "APPROVE",
        comment: "fine",
      });
      expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
      expect(onApprovalResolved).not.toHaveBeenCalled();
      expect(auditActions()).toEqual(["approval.approved"]);
    });

    it("approves once the required count is reached and runs the hook in the transaction", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ decisions: [decision(OTHER_ID, "APPROVE")] }),
      );
      db.approvalRequest.findUniqueOrThrow.mockResolvedValue(
        stored({
          status: "APPROVED",
          decisions: [
            decision(OTHER_ID, "APPROVE"),
            decision(USER_ID, "APPROVE"),
          ],
        }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "APPROVED", approvals: 2 });
      expect(db.approvalRequest.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: APPROVAL_ID, status: "PENDING" },
        data: { status: "APPROVED" },
      });
      expect(onApprovalResolved).toHaveBeenCalledWith(db, {
        id: APPROVAL_ID,
        organizationId: ORG_ID,
        kind: "GOVERNANCE",
        status: "APPROVED",
      });
    });

    it("records no decision when the decision cannot be audited", async () => {
      const row = stored({ decisions: [decision(OTHER_ID, "APPROVE")] });
      const tx = failAuditInTransaction(db, {
        $queryRaw: vi.fn(fakeQueryRaw),
        approvalRequest: {
          findFirst: vi.fn().mockResolvedValue(row),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ ...row, status: "APPROVED" }),
        },
        approvalDecision: { create: vi.fn().mockResolvedValue({}) },
      });

      const res = await decide();

      expect(res.statusCode).toBe(500);
      expect(tx.approvalDecision.create).toHaveBeenCalledOnce();
      expect(tx.approvalRequest.updateMany).toHaveBeenCalledOnce();
      expect(onApprovalResolved).toHaveBeenCalledWith(tx, expect.anything());
      expect(db.approvalDecision.create).not.toHaveBeenCalled();
      expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
      await expect(db.$transaction.mock.results.at(-1)?.value).rejects.toBe(
        AUDIT_DOWN,
      );
      expect(db.auditLog.create).not.toHaveBeenCalled();
    });

    it("rejects on any single rejection", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ decisions: [decision(OTHER_ID, "APPROVE")] }),
      );
      db.approvalRequest.findUniqueOrThrow.mockResolvedValue(
        stored({ status: "REJECTED" }),
      );

      const res = await decide({ vote: "REJECT" });

      expect(res.statusCode).toBe(200);
      expect(db.approvalRequest.updateMany.mock.calls[0][0].data).toMatchObject(
        { status: "REJECTED" },
      );
      expect(onApprovalResolved.mock.calls[0][1].status).toBe("REJECTED");
      expect(auditActions()).toEqual(["approval.rejected"]);
    });
  });

  describe("cancelling", () => {
    it("lets only the requester cancel", async () => {
      db.approvalRequest.findFirst.mockResolvedValue(stored());

      const res = await call("POST", `/me/approvals/${APPROVAL_ID}/cancel`);

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("not_requester");
      expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
    });

    it("cancels the requester's pending request and runs the hook", async () => {
      as("DEVELOPER");
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ requestedById: USER_ID }),
      );
      db.approvalRequest.findUniqueOrThrow.mockResolvedValue(
        stored({ requestedById: USER_ID, status: "CANCELLED" }),
      );

      const res = await call("POST", `/me/approvals/${APPROVAL_ID}/cancel`);

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("CANCELLED");
      expect(db.approvalRequest.updateMany.mock.calls[0][0].data).toMatchObject(
        { status: "CANCELLED" },
      );
      expect(onApprovalResolved.mock.calls[0][1].status).toBe("CANCELLED");
      expect(auditActions()).toEqual(["approval.cancelled"]);
    });
  });

  describe("restricted projects", () => {
    const decide = () =>
      call("POST", `/me/approvals/${APPROVAL_ID}/decide`, { vote: "APPROVE" });
    const cancel = () => call("POST", `/me/approvals/${APPROVAL_ID}/cancel`);

    const restricted = (memberRole: ProjectRole | null = null) => {
      db.project.findMany.mockResolvedValue([
        { id: PROJECT_ID, restricted: false, members: [] },
        {
          id: OTHER_PROJECT_ID,
          restricted: true,
          members: memberRole ? [{ role: memberRole }] : [],
        },
      ]);
      lockTarget = OTHER_PROJECT_ID;
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ projectId: OTHER_PROJECT_ID, requiredApprovals: 1 }),
      );
    };

    const nothingChanged = () => {
      expect(db.approvalDecision.create).not.toHaveBeenCalled();
      expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
      expect(db.auditLog.create).not.toHaveBeenCalled();
      expect(onApprovalResolved).not.toHaveBeenCalled();
    };

    it("404s a finance member deciding outside their restricted projects, with no side effect", async () => {
      as("FINANCE");
      restricted();

      const res = await decide();

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("not_found");
      nothingChanged();
    });

    it("404s a custom role that may decide but is not in the restricted project", async () => {
      db.membership.findFirst.mockResolvedValue({
        ...membershipRow("DEVELOPER"),
        customRole: {
          id: "019fce62-0000-7000-8000-0000000000c1",
          permissions: ["finance.read", "approvals.decide"],
          projectRole: "DEVELOPER",
          deletedAt: null,
        },
      });
      restricted();

      const res = await decide();

      expect(res.statusCode).toBe(404);
      nothingChanged();
    });

    it("lets a member of the restricted project decide", async () => {
      as("FINANCE");
      restricted("VIEWER");
      db.approvalRequest.findUniqueOrThrow.mockResolvedValue(
        stored({ projectId: OTHER_PROJECT_ID, status: "APPROVED" }),
      );

      const res = await decide();

      expect(res.statusCode).toBe(200);
      expect(onApprovalResolved).toHaveBeenCalledOnce();
    });

    it("404s when the membership is gone by the time the request is locked", async () => {
      as("FINANCE");
      db.membership.findFirst
        .mockReset()
        .mockResolvedValueOnce(membershipRow("FINANCE"))
        .mockResolvedValue(null);
      db.approvalRequest.findFirst.mockResolvedValue(stored());

      const res = await decide();

      expect(res.statusCode).toBe(404);
      nothingChanged();
    });

    it("404s when the role lost the permission by the time the request is locked", async () => {
      as("FINANCE");
      db.membership.findFirst
        .mockReset()
        .mockResolvedValueOnce(membershipRow("FINANCE"))
        .mockResolvedValue(membershipRow("VIEWER"));
      db.approvalRequest.findFirst.mockResolvedValue(stored());

      const res = await decide();

      expect(res.statusCode).toBe(404);
      nothingChanged();
    });

    it("404s a requester cancelling a request in a project they can no longer see", async () => {
      as("DEVELOPER");
      restricted();
      db.approvalRequest.findFirst.mockResolvedValue(
        stored({ projectId: OTHER_PROJECT_ID, requestedById: USER_ID }),
      );

      const res = await cancel();

      expect(res.statusCode).toBe(404);
      nothingChanged();
    });

    it("only expires stale requests the caller can see", async () => {
      as("FINANCE");
      restricted();
      db.approvalRequest.findFirst.mockResolvedValue(null);
      const visible = {
        AND: [
          { OR: [{ projectId: null }, { projectId: { in: [PROJECT_ID] } }] },
        ],
      };

      expect((await call("GET", "/me/approvals")).statusCode).toBe(200);
      expect(
        (await call("GET", `/me/approvals/${APPROVAL_ID}`)).statusCode,
      ).toBe(404);

      expect(db.approvalRequest.findMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG_ID,
        ...visible,
        status: "PENDING",
      });
      expect(db.approvalRequest.findMany.mock.calls[2][0].where).toMatchObject({
        id: APPROVAL_ID,
        organizationId: ORG_ID,
        ...visible,
      });
      nothingChanged();
    });
  });

  describe("governance settings", () => {
    it("answers the defaults when nothing is stored", async () => {
      as("VIEWER");
      db.governanceSettings.findUnique.mockResolvedValue(null);

      const res = await call("GET", "/me/organization/governance");

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        approvalsRequired: 0,
        governedActions: [],
        approvalTtlHours: 72,
        financeRecipientIds: [],
        auditRetentionDays: null,
      });
    });

    it("lets only an owner change them", async () => {
      const res = await call("PUT", "/me/organization/governance", {
        approvalsRequired: 1,
      });

      expect(res.statusCode).toBe(403);
      expect(db.governanceSettings.upsert).not.toHaveBeenCalled();
    });

    it("rejects unknown actions and out-of-range values", async () => {
      as("OWNER");

      const res = await call("PUT", "/me/organization/governance", {
        approvalsRequired: 6,
        governedActions: ["org.delete"],
        auditRetentionDays: 7,
      });

      expect(res.statusCode).toBe(400);
      expect(
        res.json().issues.map((issue: { path: string }) => issue.path),
      ).toEqual([
        "approvalsRequired",
        "governedActions.0",
        "auditRetentionDays",
      ]);
    });

    it("refuses finance recipients who are not members", async () => {
      as("OWNER");
      db.membership.findMany.mockResolvedValue([{ userId: OTHER_ID }]);

      const res = await call("PUT", "/me/organization/governance", {
        financeRecipientIds: [OTHER_ID, REQUESTER_ID],
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues).toEqual([
        {
          path: "financeRecipientIds",
          message: `${REQUESTER_ID} is not a member of this organization`,
        },
      ]);
    });

    it("saves the settings and audits the change", async () => {
      as("OWNER");
      db.membership.findMany.mockResolvedValue([{ userId: OTHER_ID }]);
      const saved = {
        approvalsRequired: 2,
        governedActions: ["wallet.remove"],
        approvalTtlHours: 24,
        financeRecipientIds: [OTHER_ID],
        auditRetentionDays: 365,
      };
      db.governanceSettings.upsert.mockResolvedValue(saved);

      const res = await call("PUT", "/me/organization/governance", {
        approvalsRequired: 2,
        governedActions: ["wallet.remove", "wallet.remove"],
        approvalTtlHours: 24,
        financeRecipientIds: [OTHER_ID],
        auditRetentionDays: 365,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(saved);
      const args = db.governanceSettings.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ organizationId: ORG_ID });
      expect(args.update.governedActions).toEqual(["wallet.remove"]);
      expect(args.create.organizationId).toBe(ORG_ID);
      expect(auditActions()).toEqual(["governance.updated"]);
    });
  });

  describe("seller approvals", () => {
    const body = {
      payerAddress: PAYER,
      network: "BASE_SEPOLIA",
      amount: "12.500",
      reason: "large order",
    };

    it("needs the APPROVALS_WRITE scope", async () => {
      db.apiKey.findUnique.mockResolvedValue(
        keyRecord({ scopes: ["PAYMENTS_WRITE"] }),
      );

      const res = await call("POST", "/v1/approvals", body, KEY_AUTH);

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("insufficient_scope");
    });

    it("refuses a network outside the key's environment", async () => {
      db.apiKey.findUnique.mockResolvedValue(keyRecord());

      const res = await call(
        "POST",
        "/v1/approvals",
        { ...body, network: "BASE" },
        KEY_AUTH,
      );

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("environment_mismatch");
    });

    it("404s for a customer outside the key's project", async () => {
      db.apiKey.findUnique.mockResolvedValue(keyRecord());
      db.customer.count.mockResolvedValue(0);

      const res = await call(
        "POST",
        "/v1/approvals",
        { ...body, customerId: CUSTOMER_ID },
        KEY_AUTH,
      );

      expect(res.statusCode).toBe(404);
      expect(db.customer.count.mock.calls[0][0].where).toMatchObject({
        id: CUSTOMER_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
      });
    });

    it("opens a request in the key's org and project and audits it", async () => {
      db.apiKey.findUnique.mockResolvedValue(keyRecord());
      db.governanceSettings.findUnique.mockResolvedValue({
        approvalsRequired: 2,
        approvalTtlHours: 24,
      });
      db.approvalRequest.create.mockResolvedValue({
        id: APPROVAL_ID,
        status: "PENDING",
        expiresAt: FUTURE,
        decidedAt: null,
      });

      const res = await call("POST", "/v1/approvals", body, KEY_AUTH);

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: APPROVAL_ID, status: "PENDING" });
      const data = db.approvalRequest.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        kind: "SELLER_PAYMENT",
        requestedByApiKeyId: KEY_ID,
        requiredApprovals: 2,
        payload: {
          payerAddress: PAYER.toLowerCase(),
          network: "BASE_SEPOLIA",
          assetAddress: null,
          amount: "12.5",
        },
      });
      expect(data.payloadHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        23 * 3_600_000,
      );
      expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        actorApiKeyId: KEY_ID,
        action: "approval.requested",
        targetId: APPROVAL_ID,
      });
    });

    it("reports a seller approval only within the key's project", async () => {
      db.apiKey.findUnique.mockResolvedValue(
        keyRecord({ environmentId: PRODUCTION_ENV_ID }),
      );
      db.approvalRequest.findFirst.mockResolvedValue({
        id: APPROVAL_ID,
        status: "APPROVED",
        expiresAt: FUTURE,
        decidedAt: CREATED,
      });

      const res = await call(
        "GET",
        `/v1/approvals/${APPROVAL_ID}`,
        undefined,
        KEY_AUTH,
      );

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: APPROVAL_ID,
        status: "APPROVED",
        expiresAt: FUTURE.toISOString(),
        decidedAt: CREATED.toISOString(),
      });
      expect(db.approvalRequest.findFirst.mock.calls[0][0].where).toEqual({
        id: APPROVAL_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        kind: "SELLER_PAYMENT",
      });
    });
  });
});
