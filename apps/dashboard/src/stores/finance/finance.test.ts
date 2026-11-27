import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getSpendingPolicies: vi.fn(),
  createSpendingPolicy: vi.fn(),
  updateSpendingPolicy: vi.fn(),
  deleteSpendingPolicy: vi.fn(),
  freezeSpendingPolicy: vi.fn(),
  getApprovals: vi.fn(),
  decideApproval: vi.fn(),
  cancelApproval: vi.fn(),
  applyApprovedRequest: vi.fn(),
  getAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
  getSpendAuthorizations: vi.fn(),
  getFinanceSummary: vi.fn(),
  getFinanceUsage: vi.fn(),
  getReconciliation: vi.fn(),
  getGovernance: vi.fn(),
  updateGovernance: vi.fn(),
}));
vi.mock("@api/finance", () => api);

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const saga = await import("./saga");
const actions = await import("./actions");
const actionTypes = (await import("./actionTypes")).default;
const reducerModule = await import("./reducer");
const reducer = reducerModule.default;
const { INITIAL_STATE } = reducerModule;
const badgeTypes = (await import("@stores/financeBadge/actionTypes")).default;
const { ApprovalRequiredError, APPROVAL_STORAGE_KEY, storedRequest } =
  await import("@/lib/approvalRequests");

interface Dispatched {
  type: string;
  payload?: unknown;
  meta?: unknown;
}

const record = async (
  worker: (action: never) => Generator,
  action: unknown,
  state: unknown = { finance: INITIAL_STATE },
) => {
  const dispatched: Dispatched[] = [];
  await runSaga(
    {
      dispatch: (next: Dispatched) => dispatched.push(next),
      getState: () => state,
    },
    worker as (a: unknown) => Generator,
    action,
  ).toPromise();
  return dispatched;
};

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

const POLICY = {
  id: "pol_1",
  name: "Research",
  scope: "ORGANIZATION",
  projectId: null,
  agentId: null,
  apiKeyId: null,
  mode: "ENFORCE",
  network: "BASE_SEPOLIA",
  assetAddress: null,
  perPaymentLimit: null,
  dailyLimit: "10",
  monthlyLimit: null,
  approvalThreshold: null,
  approvalsRequired: 1,
  allowedRecipients: [],
  alertThresholds: [80],
  frozen: false,
  frozenAt: null,
  enabled: true,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  createdBy: null,
  usage: null,
} as const;

const approval = (over: Record<string, unknown> = {}) => ({
  id: "apr_1",
  kind: "GOVERNANCE",
  action: "spending_policy.change",
  summary: "Create policy",
  payload: {},
  status: "PENDING",
  requiredApprovals: 1,
  approvals: 0,
  decisions: [],
  requestedBy: { id: "u_1", name: "Ada" },
  requestedByApiKeyId: null,
  projectId: null,
  expiresAt: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-11-27T00:00:00.000Z",
  decidedAt: null,
  executedAt: null,
  canDecide: true,
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(api)) {
    fn.mockReset();
  }
  notifyError.mockReset();
  notifySuccess.mockReset();
  localStorage.clear();
});

describe("spending policy sagas", () => {
  it("loads the policies", async () => {
    api.getSpendingPolicies.mockResolvedValue({ items: [POLICY] });
    const dispatched = await record(
      saga.fetchPolicies,
      actions.fetchPolicies(),
    );
    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_POLICIES_PENDING,
      actionTypes.FETCH_POLICIES_SUCCEEDED,
    ]);
  });

  it("creates a new policy and updates an existing one", async () => {
    api.createSpendingPolicy.mockResolvedValue(POLICY);
    api.updateSpendingPolicy.mockResolvedValue(POLICY);
    const data = { name: "Research" } as never;

    await record(saga.savePolicy, actions.savePolicy({ data }));
    await record(saga.savePolicy, actions.savePolicy({ id: "pol_1", data }));

    expect(api.createSpendingPolicy).toHaveBeenCalledWith(data);
    expect(api.updateSpendingPolicy).toHaveBeenCalledWith("pol_1", data);
  });

  it("closes the form without an error when the change was sent for approval", async () => {
    api.createSpendingPolicy.mockRejectedValue(
      new ApprovalRequiredError({
        status: "approval_required",
        message: "needs approval",
        approvalRequest: approval() as never,
      }),
    );

    const dispatched = await record(
      saga.savePolicy,
      actions.savePolicy({ data: { name: "Research" } as never }),
    );

    const failed = dispatched.find(
      (a) => a.type === actionTypes.FINANCE_ACTION_FAILED,
    );
    expect(failed?.payload).toEqual({ message: "", issues: {} });
    expect(types(dispatched)).toContain(
      badgeTypes.FETCH_FINANCE_BADGES_REQUESTED,
    );
    expect(notifyError).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();

    const state = reducer(
      reducer(INITIAL_STATE, actions.savePolicy({ data: {} as never })),
      failed as never,
    );
    expect(state.error).toBeFalsy();
    expect(state.pending).toEqual({});
  });

  it("freezes immediately and stores the frozen policy", async () => {
    api.freezeSpendingPolicy.mockResolvedValue({ ...POLICY, frozen: true });
    const dispatched = await record(
      saga.freezePolicy,
      actions.freezePolicy({ id: "pol_1", frozen: true }),
    );
    expect(api.freezeSpendingPolicy).toHaveBeenCalledWith("pol_1", true);

    const state = reducer(
      { ...INITIAL_STATE, policies: [POLICY as never] },
      dispatched[0] as never,
    );
    expect(state.policies[0].frozen).toBe(true);
  });

  it("drops a deleted policy", () => {
    const state = reducer(
      { ...INITIAL_STATE, policies: [POLICY as never] },
      actions.deletePolicySucceeded("pol_1", { pendingKey: "policy:pol_1" }),
    );
    expect(state.policies).toEqual([]);
  });
});

describe("approval sagas", () => {
  it("passes the filters and lists pending requests first", async () => {
    api.getApprovals.mockResolvedValue({
      items: [
        approval({ id: "a", status: "APPROVED" }),
        approval({ id: "b", status: "PENDING" }),
      ],
      nextCursor: null,
    });
    const state = {
      finance: {
        ...INITIAL_STATE,
        approvals: {
          ...INITIAL_STATE.approvals,
          filters: { status: "", kind: "GOVERNANCE" },
        },
      },
    };

    const dispatched = await record(
      saga.fetchList,
      actions.fetchList("approvals"),
      state,
    );

    expect(api.getApprovals).toHaveBeenCalledWith({
      limit: saga.FINANCE_PAGE_SIZE,
      kind: "GOVERNANCE",
    });
    const next = dispatched.reduce(
      (current, action) => reducer(current, action as never),
      INITIAL_STATE,
    );
    expect(next.approvals.items.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("records a decision and refreshes the nav badge", async () => {
    api.decideApproval.mockResolvedValue(approval({ status: "APPROVED" }));
    const dispatched = await record(
      saga.decideApproval,
      actions.decideApproval({ id: "apr_1", vote: "APPROVE", comment: " ok " }),
    );
    expect(api.decideApproval).toHaveBeenCalledWith("apr_1", {
      vote: "APPROVE",
      comment: "ok",
    });
    expect(types(dispatched)).toEqual([
      actionTypes.APPROVAL_UPDATED,
      badgeTypes.FETCH_FINANCE_BADGES_REQUESTED,
    ]);
  });

  it("explains the two-person rule when the requester tries to decide", async () => {
    api.decideApproval.mockRejectedValue(
      new HttpError(403, "Forbidden", { error: "self_approval" }),
    );
    const dispatched = await record(
      saga.decideApproval,
      actions.decideApproval({ id: "apr_1", vote: "APPROVE" }),
    );
    expect(dispatched.at(-1)?.payload).toMatchObject({
      message: "You asked for this change, so someone else has to decide it.",
    });
  });

  it("applies an approved change and hands back the result", async () => {
    localStorage.setItem(
      APPROVAL_STORAGE_KEY,
      JSON.stringify({
        apr_1: {
          method: "POST",
          url: "/me/api-keys",
          data: { name: "prod" },
          headers: {},
          summary: "Create key",
          createdAt: "2026-11-27T00:00:00.000Z",
        },
      }),
    );
    api.applyApprovedRequest.mockResolvedValue({ plaintext: "sk_live_x" });
    const onApplied = vi.fn();

    const dispatched = await record(
      saga.applyApproval,
      actions.applyApproval({ id: "apr_1" }, onApplied),
    );

    expect(api.applyApprovedRequest).toHaveBeenCalledWith(
      "apr_1",
      expect.objectContaining({ url: "/me/api-keys" }),
    );
    expect(onApplied).toHaveBeenCalledWith({ plaintext: "sk_live_x" });
    expect(types(dispatched)).toEqual([actionTypes.APPLY_APPROVAL_SUCCEEDED]);
  });

  it("forgets a stored change the server says can no longer be used", async () => {
    localStorage.setItem(
      APPROVAL_STORAGE_KEY,
      JSON.stringify({
        apr_1: {
          method: "DELETE",
          url: "/me/wallets/w_1",
          headers: {},
          summary: "Remove wallet",
          createdAt: "2026-11-27T00:00:00.000Z",
        },
      }),
    );
    api.applyApprovedRequest.mockRejectedValue(
      new HttpError(409, "Conflict", { error: "approval_invalid" }),
    );

    const dispatched = await record(
      saga.applyApproval,
      actions.applyApproval({ id: "apr_1" }),
    );

    expect(storedRequest("apr_1")).toBeNull();
    expect(dispatched.at(-1)).toMatchObject({
      type: actionTypes.FINANCE_ACTION_FAILED,
      payload: {
        message: expect.stringContaining("can no longer be used"),
      },
    });
    expect(notifyError).toHaveBeenCalled();
  });

  it("refuses to apply without the original request", async () => {
    const dispatched = await record(
      saga.applyApproval,
      actions.applyApproval({ id: "apr_missing" }),
    );
    expect(api.applyApprovedRequest).not.toHaveBeenCalled();
    expect(types(dispatched)).toEqual([actionTypes.FINANCE_ACTION_FAILED]);
  });
});

describe("alert sagas", () => {
  it("asks for open alerts by default", async () => {
    api.getAlerts.mockResolvedValue({ items: [], nextCursor: null });
    await record(saga.fetchList, actions.fetchList("alerts"));
    expect(api.getAlerts).toHaveBeenCalledWith({
      limit: saga.FINANCE_PAGE_SIZE,
      acknowledged: "false",
    });
  });

  it("acknowledges an alert and refreshes the badge", async () => {
    const alert = {
      id: "al_1",
      kind: "BUDGET_THRESHOLD",
      title: "80% of budget",
      detail: null,
      policyId: "pol_1",
      projectId: null,
      createdAt: "2026-11-27T00:00:00.000Z",
      acknowledgedAt: "2026-11-27T01:00:00.000Z",
      acknowledgedBy: { id: "u_1", name: "Ada" },
    };
    api.acknowledgeAlert.mockResolvedValue(alert);
    const dispatched = await record(
      saga.acknowledgeAlert,
      actions.acknowledgeAlert({ id: "al_1" }),
    );
    expect(types(dispatched)).toEqual([
      actionTypes.ALERT_UPDATED,
      badgeTypes.FETCH_FINANCE_BADGES_REQUESTED,
    ]);
    const state = reducer(
      {
        ...INITIAL_STATE,
        alerts: {
          ...INITIAL_STATE.alerts,
          items: [{ ...alert, acknowledgedAt: null, acknowledgedBy: null }],
        },
      },
      dispatched[0] as never,
    );
    expect(state.alerts.items[0].acknowledgedAt).not.toBeNull();
  });
});

describe("report sagas", () => {
  const state = {
    finance: {
      ...INITIAL_STATE,
      reports: {
        ...INITIAL_STATE.reports,
        range: { from: "2026-11-01", to: "2026-11-27" },
        groupBy: "agent",
        direction: "received",
      },
    },
  };

  it("asks for usage over the whole selected days with the grouping", async () => {
    api.getFinanceUsage.mockResolvedValue({ items: [] });
    await record(saga.fetchReport, actions.fetchReport("usage"), state);
    expect(api.getFinanceUsage).toHaveBeenCalledWith({
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-27T23:59:59.999Z",
      groupBy: "agent",
      direction: "received",
    });
  });

  it("stores the summary and reconciliation", async () => {
    const summary = {
      sent: [],
      received: [],
      authorizations: {
        reserved: 0,
        pendingApproval: 0,
        consumed: 1,
        denied: 0,
        released: 0,
        expired: 0,
      },
    };
    api.getFinanceSummary.mockResolvedValue(summary);
    api.getReconciliation.mockRejectedValue(new Error("down"));

    const ok = await record(
      saga.fetchReport,
      actions.fetchReport("summary"),
      state,
    );
    const failed = await record(
      saga.fetchReport,
      actions.fetchReport("reconciliation"),
      state,
    );

    const next = [...ok, ...failed].reduce(
      (current, action) => reducer(current, action as never),
      INITIAL_STATE,
    );
    expect(next.reports.summary).toEqual(summary);
    expect(next.reports.summaryStatus).toBe("loaded");
    expect(next.reports.reconciliationStatus).toBe("failed");
  });
});
