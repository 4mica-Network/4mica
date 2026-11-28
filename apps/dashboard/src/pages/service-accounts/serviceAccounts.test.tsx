import type { ApiKey } from "@stores/developer/type";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import type { ProjectPermission, ProjectSummary } from "@stores/project/type";
import serviceAccountActionTypes from "@stores/serviceAccount/actionTypes";
import { INITIAL_STATE as SERVICE_ACCOUNT_INITIAL_STATE } from "@stores/serviceAccount/reducer";
import type { ServiceAccount } from "@stores/serviceAccount/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

const { ServiceAccountsSettings } = await import("./index");

const READ: ProjectPermission[] = ["project.read", "resources.read"];
const MANAGE: ProjectPermission[] = [
  ...READ,
  "resources.write",
  "keys.manage",
  "service_accounts.manage",
];

const project = (permissions: ProjectPermission[]): ProjectSummary => ({
  id: "main",
  slug: "main",
  name: "Main",
  description: null,
  isDefault: true,
  restricted: false,
  restrictProduction: false,
  archived: false,
  role: "DEVELOPER",
  permissions: { SANDBOX: permissions, PRODUCTION: permissions },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
});

const ACCOUNT: ServiceAccount = {
  id: "sa_1",
  name: "Checkout worker",
  description: "Runs payouts",
  suspendedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  createdBy: { id: "me", name: "Ada" },
  keyCount: 1,
};

const KEY: ApiKey = {
  id: "k_1",
  name: "Primary",
  prefix: "4mica_sk_test_ab",
  last4: "wxyz",
  environment: "SANDBOX",
  scopes: ["PAYMENTS_WRITE"],
  serviceAccountId: "sa_1",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

let dispatched: { type: string; payload?: unknown }[] = [];

const renderPage = (
  permissions: ProjectPermission[],
  account: ServiceAccount = ACCOUNT,
) => {
  dispatched = [];
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
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
    serviceAccount: {
      ...SERVICE_ACCOUNT_INITIAL_STATE,
      items: [account],
      status: "loaded" as const,
      keys: { [account.id]: [KEY] },
      keysStatus: { [account.id]: "loaded" as const },
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ServiceAccountsSettings />
      </MemoryRouter>
    </Provider>,
  );
};

const types = () => dispatched.map((action) => action.type);

describe("service accounts settings", () => {
  it("loads and lists service accounts", () => {
    renderPage(MANAGE);

    expect(types()).toContain(
      serviceAccountActionTypes.FETCH_SERVICE_ACCOUNTS_REQUESTED,
    );
    expect(screen.getByTestId("service-account-sa_1")).toHaveTextContent(
      "Checkout worker",
    );
  });

  it("creates a service account", () => {
    renderPage(MANAGE);
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Nightly CI" },
    });
    fireEvent.click(screen.getByTestId("create-service-account-submit"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: serviceAccountActionTypes.CREATE_SERVICE_ACCOUNT_REQUESTED,
        payload: { name: "Nightly CI", description: null },
      }),
    );
  });

  it("suspends an active account", () => {
    renderPage(MANAGE);
    fireEvent.click(screen.getByTestId("suspend-sa_1"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: serviceAccountActionTypes.SUSPEND_SERVICE_ACCOUNT_REQUESTED,
        payload: { id: "sa_1", suspended: true },
      }),
    );
  });

  it("shows keys with environment and scopes, and creates one with every scope by default", () => {
    renderPage(MANAGE);
    fireEvent.click(screen.getByTestId("keys-toggle-sa_1"));

    const key = screen.getByTestId("service-account-key-k_1");
    expect(key).toHaveTextContent("Sandbox");
    expect(key).toHaveTextContent("Create payments");

    const form = screen.getByTestId("new-key-form-sa_1");
    fireEvent.change(within(form).getByLabelText(/^Key name/), {
      target: { value: "Deploy" },
    });
    fireEvent.click(screen.getByTestId("new-key-submit-sa_1"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: serviceAccountActionTypes.CREATE_SERVICE_ACCOUNT_KEY_REQUESTED,
        payload: {
          id: "sa_1",
          key: {
            name: "Deploy",
            scopes: ["PAYMENTS_WRITE", "CUSTOMERS_READ", "RESOURCE_READ"],
          },
        },
      }),
    );
  });

  it("is read-only for a viewer", () => {
    renderPage(READ);
    fireEvent.click(screen.getByTestId("keys-toggle-sa_1"));

    expect(screen.getByTestId("role-restricted")).toBeInTheDocument();
    expect(screen.queryByTestId("create-service-account-form")).toBeNull();
    expect(screen.queryByTestId("suspend-sa_1")).toBeNull();
    expect(screen.queryByTestId("new-key-form-sa_1")).toBeNull();
    expect(screen.queryByTestId("rotate-k_1")).toBeNull();
  });

  it("offers reactivation and no new keys for a suspended account", () => {
    renderPage(MANAGE, { ...ACCOUNT, suspendedAt: "2026-11-10T00:00:00.000Z" });
    fireEvent.click(screen.getByTestId("keys-toggle-sa_1"));

    expect(screen.getByTestId("suspend-sa_1")).toHaveTextContent("Reactivate");
    expect(screen.queryByTestId("new-key-form-sa_1")).toBeNull();
  });
});
