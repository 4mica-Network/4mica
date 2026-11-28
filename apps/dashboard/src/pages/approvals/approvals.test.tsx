import { INITIAL_STATE as FINANCE_INITIAL_STATE } from "@stores/finance/reducer";
import type { ApprovalRequest } from "@stores/finance/type";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it } from "vitest";
import "@/i18n";
import { APPROVAL_STORAGE_KEY } from "@/lib/approvalRequests";
import { Approvals } from "./index";

const ORG: OrganizationSummary = {
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "FINANCE",
  permissions: [
    "finance.read",
    "finance.manage",
    "approvals.decide",
    "reports.export",
  ],
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const approval = (over: Partial<ApprovalRequest>): ApprovalRequest => ({
  id: "apr_1",
  kind: "GOVERNANCE",
  action: "spending_policy.change",
  summary: "Create policy Research",
  payload: { name: "Research", dailyLimit: "10" },
  status: "PENDING",
  requiredApprovals: 1,
  approvals: 0,
  decisions: [],
  requestedBy: { id: "someone", name: "Grace" },
  requestedByApiKeyId: null,
  projectId: null,
  expiresAt: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-11-27T00:00:00.000Z",
  decidedAt: null,
  executedAt: null,
  canDecide: true,
  ...over,
});

let dispatched: { type: string; payload?: unknown }[] = [];

const renderInbox = (items: ApprovalRequest[]) => {
  dispatched = [];
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [ORG],
      activeId: ORG.id,
      status: "loaded" as const,
    },
    finance: {
      ...FINANCE_INITIAL_STATE,
      approvals: {
        ...FINANCE_INITIAL_STATE.approvals,
        items,
        status: "loaded" as const,
      },
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Approvals />
      </MemoryRouter>
    </Provider>,
  );
};

describe("approvals inbox", () => {
  beforeEach(() => localStorage.clear());

  it("lets someone else approve or reject, with the payload shown", () => {
    renderInbox([approval({})]);
    fireEvent.click(screen.getByTestId("approval-open-apr_1"));

    expect(screen.getByTestId("approval-payload")).toHaveTextContent(
      "Research",
    );
    expect(screen.getByTestId("approval-approve")).toBeInTheDocument();
    expect(screen.getByTestId("approval-reject")).toBeInTheDocument();
    expect(screen.queryByTestId("approval-self-notice")).toBeNull();

    fireEvent.click(screen.getByTestId("approval-approve"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: "DECIDE_APPROVAL_REQUESTED",
        payload: { id: "apr_1", vote: "APPROVE", comment: "" },
      }),
    );
  });

  it("hides the decision buttons from the requester and explains why", () => {
    renderInbox([approval({ requestedBy: { id: "me", name: "Ada" } })]);
    fireEvent.click(screen.getByTestId("approval-open-apr_1"));

    expect(screen.queryByTestId("approval-approve")).toBeNull();
    expect(screen.queryByTestId("approval-reject")).toBeNull();
    expect(screen.getByTestId("approval-self-notice")).toHaveTextContent(
      "two-person rule",
    );
    expect(screen.getByTestId("approval-cancel")).toBeInTheDocument();
  });

  it("offers Apply change to the requester of an approved change made in this browser", () => {
    localStorage.setItem(
      APPROVAL_STORAGE_KEY,
      JSON.stringify({
        apr_1: {
          method: "POST",
          url: "/me/spending-policies",
          headers: {},
          summary: "Create policy Research",
          createdAt: "2026-11-27T00:00:00.000Z",
        },
      }),
    );
    renderInbox([
      approval({
        status: "APPROVED",
        approvals: 1,
        requestedBy: { id: "me", name: "Ada" },
      }),
    ]);

    expect(screen.getByTestId("approval-row-apr_1")).toHaveTextContent(
      "Ready to apply",
    );
    fireEvent.click(screen.getByTestId("approval-open-apr_1"));
    fireEvent.click(screen.getByTestId("approval-apply-button"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: "APPLY_APPROVAL_REQUESTED",
        payload: { id: "apr_1" },
      }),
    );
  });

  it("does not offer Apply change to anyone but the requester", () => {
    renderInbox([approval({ status: "APPROVED", approvals: 1 })]);
    fireEvent.click(screen.getByTestId("approval-open-apr_1"));
    expect(screen.queryByTestId("approval-apply")).toBeNull();
  });
});
