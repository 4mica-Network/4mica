import financeActionTypes from "@stores/finance/actionTypes";
import { INITIAL_STATE as FINANCE_INITIAL_STATE } from "@stores/finance/reducer";
import type { FinancialAlert, SpendingPolicy } from "@stores/finance/type";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { emptyDraft } from "./form";
import { SpendingPolicies } from "./index";
import { hasAdvancedValues } from "./PolicyFormModal";

const organization = (
  over: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
  id: "me",
  handle: "ada",
  name: "Ada",
  avatarUrl: null,
  personal: true,
  role: "OWNER",
  permissions: ["finance.read", "finance.manage"],
  memberCount: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const ALERT: FinancialAlert = {
  id: "al_1",
  kind: "BUDGET_THRESHOLD",
  title: "Daily limit at 80%",
  detail: null,
  policyId: "pol_1",
  projectId: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  createdAt: "2026-11-20T00:00:00.000Z",
};

let dispatched: { type: string; payload?: unknown }[] = [];

const renderPolicies = (org: OrganizationSummary) => {
  dispatched = [];
  const state = {
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [org],
      activeId: org.id,
      status: "loaded" as const,
    },
    project: { ...PROJECT_INITIAL_STATE, organizationId: org.id },
    finance: {
      ...FINANCE_INITIAL_STATE,
      policies: [] as SpendingPolicy[],
      policiesStatus: "loaded" as const,
      alerts: {
        ...FINANCE_INITIAL_STATE.alerts,
        items: [ALERT],
        status: "loaded" as const,
      },
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <SpendingPolicies />
      </MemoryRouter>
    </Provider>,
  );
};

const openScopes = async () => {
  const user = userEvent.setup();
  screen.getByLabelText("Applies to").focus();
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("listbox");
};

describe("spending limits in a personal workspace", () => {
  it("is called Spending limits and shows budget alerts inline", () => {
    renderPolicies(organization());

    expect(
      screen.getByRole("heading", { name: "Spending limits" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Budget alerts")).toBeInTheDocument();
    expect(screen.getByTestId("alert-al_1")).toHaveTextContent(
      "Daily limit at 80%",
    );
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: financeActionTypes.SET_LIST_FILTERS,
        payload: {
          list: "alerts",
          filters: { kind: "BUDGET_THRESHOLD", acknowledged: "false" },
        },
      }),
    );
  });

  it("keeps recipients behind Advanced and offers no approvals", () => {
    renderPolicies(organization());
    fireEvent.click(screen.getByTestId("policy-create"));

    expect(screen.getByLabelText("Per payment")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Allowed recipients/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    expect(screen.getByLabelText(/Allowed recipients/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Approvals needed/)).toBeNull();
    expect(screen.queryByLabelText(/Approval threshold/)).toBeNull();
  });

  it("only offers the whole workspace or one agent as a scope", async () => {
    renderPolicies(organization());
    fireEvent.click(screen.getByTestId("policy-create"));
    await openScopes();

    await waitFor(() =>
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["Whole organization", "Agent"]),
    );
  });
});

describe("spending policies in an organization", () => {
  it("keeps every field and scope in view", async () => {
    renderPolicies(organization({ id: "acme", personal: false }));

    expect(
      screen.getByRole("heading", { name: "Policies & budgets" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Budget alerts")).toBeNull();

    fireEvent.click(screen.getByTestId("policy-create"));
    expect(screen.getByLabelText(/Approvals needed/)).toBeInTheDocument();
    await openScopes();

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(4));
  });
});

describe("advanced policy values", () => {
  it("opens Advanced only when one of its fields is set", () => {
    expect(hasAdvancedValues(emptyDraft())).toBe(false);
    expect(
      hasAdvancedValues({ ...emptyDraft(), approvalThreshold: "50" }),
    ).toBe(true);
    expect(hasAdvancedValues({ ...emptyDraft(), approvalsRequired: "2" })).toBe(
      true,
    );
  });
});
