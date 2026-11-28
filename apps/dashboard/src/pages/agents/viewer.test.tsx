import { INITIAL_STATE as AGENT_INITIAL_STATE } from "@stores/agent/reducer";
import type { Agent } from "@stores/agent/type";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import type { ProjectPermission, ProjectSummary } from "@stores/project/type";
import { INITIAL_STATE as WALLET_INITIAL_STATE } from "@stores/wallet/reducer";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { Agents } from "./index";

const READ: ProjectPermission[] = ["project.read", "resources.read"];
const WRITE: ProjectPermission[] = [...READ, "resources.write"];

const project = (sandbox: ProjectPermission[]): ProjectSummary => ({
  id: "main",
  slug: "main",
  name: "Main",
  description: null,
  isDefault: true,
  restricted: false,
  restrictProduction: false,
  archived: false,
  role: "VIEWER",
  permissions: { SANDBOX: sandbox, PRODUCTION: READ },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
});

const agent = {
  id: "a_1",
  name: "Scout",
  headline: null,
  status: "ACTIVE",
  visibility: "PRIVATE",
  network: "BASE_SEPOLIA",
  priceAmount: null,
  priceCurrency: null,
  priceLabel: null,
  payToAddress: null,
} as unknown as Agent;

const renderAgents = (permissions: ProjectPermission[]) => {
  const state = {
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      activeId: "acme",
      status: "loaded" as const,
    },
    project: {
      ...PROJECT_INITIAL_STATE,
      organizationId: "acme",
      items: [project(permissions)],
      activeId: "main",
      status: "loaded" as const,
    },
    agent: {
      ...AGENT_INITIAL_STATE,
      items: [agent],
      total: 1,
      hasLoaded: true,
    },
    wallet: WALLET_INITIAL_STATE,
  };
  const store = createStore((current = state) => current);
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Agents />
      </MemoryRouter>
    </Provider>,
  );
};

describe("agents for a project viewer", () => {
  it("hides create, select and row actions", () => {
    renderAgents(READ);

    expect(screen.getByTestId("agent-row-a_1")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-create-button")).toBeNull();
    expect(screen.queryByTestId("agent-select-a_1-checkbox")).toBeNull();
    expect(screen.queryByTestId("agent-more-a_1")).toBeNull();
  });

  it("shows them to someone who can write", () => {
    renderAgents(WRITE);

    expect(screen.getByTestId("agent-create-button")).toBeInTheDocument();
    expect(screen.getByTestId("agent-select-a_1-checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("agent-more-a_1")).toBeInTheDocument();
  });
});
