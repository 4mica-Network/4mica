import { INITIAL_STATE as FINANCE_INITIAL_STATE } from "@stores/finance/reducer";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import { INITIAL_STATE as TEAM_INITIAL_STATE } from "@stores/team/reducer";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { GovernanceSettings } from "./index";

const SETTINGS = {
  approvalsRequired: 1,
  governedActions: ["wallet.remove" as const],
  approvalTtlHours: 72,
  financeRecipientIds: [],
  auditRetentionDays: null,
};

let dispatched: { type: string; payload?: unknown }[] = [];

const renderGovernance = (
  role: OrganizationSummary["role"],
  permissions: Permission[],
) => {
  dispatched = [];
  const organization: OrganizationSummary = {
    id: "acme",
    handle: "acme",
    name: "Acme",
    avatarUrl: null,
    personal: false,
    role,
    permissions,
    memberCount: 2,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [organization],
      activeId: organization.id,
      status: "loaded" as const,
    },
    team: { ...TEAM_INITIAL_STATE, membersStatus: "loaded" as const },
    finance: {
      ...FINANCE_INITIAL_STATE,
      governance: SETTINGS,
      governanceStatus: "loaded" as const,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <GovernanceSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("governance settings", () => {
  it("lets an owner change and save the rules", () => {
    renderGovernance("OWNER", ["finance.read", "governance.manage"]);

    expect(screen.queryByTestId("governance-read-only")).toBeNull();
    fireEvent.click(
      screen.getByTestId("governance-action-spending_policy.change-checkbox"),
    );
    fireEvent.click(screen.getByTestId("governance-save"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: "SAVE_GOVERNANCE_REQUESTED",
        payload: expect.objectContaining({
          governedActions: ["spending_policy.change", "wallet.remove"],
        }),
      }),
    );
  });

  it("shows the rules read-only to anyone who can only read finance", () => {
    renderGovernance("FINANCE", [
      "finance.read",
      "finance.manage",
      "approvals.decide",
    ]);

    expect(screen.getByTestId("governance-read-only")).toBeInTheDocument();
    expect(screen.queryByTestId("governance-save")).toBeNull();
    expect(
      screen.getByTestId("governance-action-wallet.remove-checkbox"),
    ).toBeDisabled();
  });

  it("explains the page is unavailable without finance.read", () => {
    renderGovernance("VIEWER", ["resources.read"]);
    expect(
      screen.getByTestId("governance-unavailable-empty-state"),
    ).toBeInTheDocument();
  });
});
