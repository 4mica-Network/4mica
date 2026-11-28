import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import projectActionTypes from "@stores/project/actionTypes";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import type { Environment, ProjectSummary } from "@stores/project/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { EnvironmentBar, EnvironmentToggle } from "./EnvironmentToggle";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { listPathFor } from "./useLeaveDetail";

const organization = (
  over: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "DEVELOPER",
  permissions: ["projects.create", "resources.read", "resources.write"],
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const project = (over: Partial<ProjectSummary>): ProjectSummary => ({
  id: "main",
  slug: "main",
  name: "Main",
  description: null,
  isDefault: true,
  restricted: false,
  restrictProduction: false,
  archived: false,
  role: "DEVELOPER",
  permissions: { SANDBOX: [], PRODUCTION: [] },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const PROJECTS = [
  project({}),
  project({ id: "checkout", name: "Checkout", isDefault: false }),
  project({ id: "old", name: "Legacy", isDefault: false, archived: true }),
];

let dispatched: { type: string; payload?: unknown }[] = [];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const renderWith = (
  ui: React.ReactNode,
  {
    environment = "sandbox" as Environment,
    org = organization(),
    path = "/agents",
  } = {},
) => {
  dispatched = [];
  const state = {
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [org],
      activeId: org.id,
      status: "loaded" as const,
    },
    project: {
      ...PROJECT_INITIAL_STATE,
      organizationId: org.id,
      items: PROJECTS,
      activeId: "main",
      environment,
      status: "loaded" as const,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {ui}
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
};

describe("project switcher", () => {
  it("shows the active project and lists every visible one, archived marked", () => {
    renderWith(<ProjectSwitcher collapsed={false} />);

    expect(screen.getByTestId("active-project")).toHaveTextContent("Main");
    fireEvent.click(screen.getByTestId("project-switcher"));

    expect(screen.getByTestId("project-option-main")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      within(screen.getByTestId("project-option-old")).getByText("Archived"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("project-option-checkout")).queryByText(
        "Archived",
      ),
    ).toBeNull();
  });

  it("switches project and leaves a detail page for its list", () => {
    renderWith(<ProjectSwitcher collapsed={false} />, { path: "/agents/a_1" });
    fireEvent.click(screen.getByTestId("project-switcher"));
    fireEvent.click(screen.getByTestId("project-option-checkout"));

    expect(dispatched).toContainEqual({
      type: projectActionTypes.SWITCH_PROJECT_REQUESTED,
      payload: { id: "checkout" },
    });
    expect(screen.getByTestId("where")).toHaveTextContent("/agents");
  });

  it("offers New project only with the organization's projects.create permission", () => {
    renderWith(<ProjectSwitcher collapsed={false} />);
    fireEvent.click(screen.getByTestId("project-switcher"));
    expect(screen.getByTestId("project-create")).toBeInTheDocument();
  });

  it("hides New project from a viewer", () => {
    renderWith(<ProjectSwitcher collapsed={false} />, {
      org: organization({ role: "VIEWER", permissions: ["resources.read"] }),
    });
    fireEvent.click(screen.getByTestId("project-switcher"));
    expect(screen.queryByTestId("project-create")).toBeNull();
  });
});

describe("environment toggle", () => {
  it("marks sandbox as active and says the data is test data", () => {
    renderWith(
      <>
        <EnvironmentToggle collapsed={false} />
        <EnvironmentBar />
      </>,
    );

    expect(screen.getByTestId("environment-sandbox")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("environment-bar")).toHaveTextContent(
      "test data",
    );
  });

  it("switches to production", () => {
    renderWith(<EnvironmentToggle collapsed={false} />);
    fireEvent.click(screen.getByTestId("environment-production"));

    expect(dispatched).toContainEqual({
      type: projectActionTypes.SWITCH_ENVIRONMENT_REQUESTED,
      payload: { environment: "production" },
    });
  });

  it("badges production", () => {
    renderWith(<EnvironmentBar />, { environment: "production" });

    expect(screen.getByTestId("environment-bar")).toHaveTextContent(
      "Production",
    );
  });

  it("only leaves detail pages outside settings", () => {
    expect(listPathFor("/agents/a_1")).toBe("/agents");
    expect(listPathFor("/agents")).toBeNull();
    expect(listPathFor("/settings/projects")).toBeNull();
  });
});
