import organizationActionTypes from "@stores/organization/actionTypes";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut }),
}));

const { OrganizationRail } = await import("./index");

const MANAGER: Permission[] = [
  "org.update",
  "members.manage",
  "audit.read",
  "projects.create",
];

const organization = (
  over: Partial<OrganizationSummary>,
): OrganizationSummary => ({
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "ADMIN",
  permissions: MANAGER,
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const PERSONAL = organization({
  id: "personal",
  name: "Ada Lovelace",
  personal: true,
  role: "OWNER",
});
const ACME = organization({});
const GLOBEX = organization({
  id: "globex",
  name: "Globex",
  role: "DEVELOPER",
  permissions: ["projects.create"],
  avatarUrl: "https://cdn.example.com/globex.png",
});
const ORGANIZATIONS = [PERSONAL, ACME, GLOBEX];

let dispatched: { type: string; payload?: unknown }[] = [];

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

const stateFor = (
  activeId: string,
  items: OrganizationSummary[] = ORGANIZATIONS,
) => ({
  user: { ...INITIAL_STATE, user: { name: "Ada Lovelace" } as User },
  organization: {
    ...ORGANIZATION_INITIAL_STATE,
    items,
    defaultId: "personal",
    activeId,
    status: "loaded" as const,
  },
});

const renderRail = (activeId = "personal", path = "/payments") => {
  dispatched = [];
  const state = stateFor(activeId);
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
                <OrganizationRail />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
};

const switches = () =>
  dispatched.filter(
    (action) =>
      action.type === organizationActionTypes.SWITCH_ORGANIZATION_REQUESTED,
  );

describe("organization rail", () => {
  beforeEach(() => {
    localStorage.clear();
    signOut.mockReset();
  });

  it("shows the personal workspace, each organization in order, then +", () => {
    renderRail();

    const rail = screen.getByRole("navigation", { name: "Workspaces" });
    const buttons = within(rail).getAllByRole("button");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Personal workspace",
      "Acme",
      "Globex",
      "Create organization",
      "Account menu for Ada Lovelace",
    ]);
  });

  it("draws an organization's avatar, or its initials without one", () => {
    renderRail();

    expect(screen.getByTestId("rail-organization-acme")).toHaveTextContent(
      "AC",
    );
    expect(
      screen.getByTestId("rail-organization-globex").querySelector("img"),
    ).toHaveAttribute("src", "https://cdn.example.com/globex.png");
  });

  it("marks the active workspace with the indicator", () => {
    renderRail("acme");

    expect(screen.getByRole("button", { name: "Acme" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Personal workspace" }),
    ).not.toHaveAttribute("aria-current");
    const indicators = screen.getAllByTestId("rail-active-indicator");
    expect(indicators).toHaveLength(1);
    expect(indicators[0].parentElement).toContainElement(
      screen.getByRole("button", { name: "Acme" }),
    );
  });

  it("marks the personal workspace when it is in use", () => {
    renderRail("personal");

    expect(
      screen.getByRole("button", { name: "Personal workspace" }),
    ).toHaveAttribute("aria-current", "true");
  });

  it("switches organization and returns to the overview", () => {
    renderRail("personal", "/payments");

    fireEvent.click(screen.getByRole("button", { name: "Acme" }));

    expect(switches()).toEqual([
      {
        type: organizationActionTypes.SWITCH_ORGANIZATION_REQUESTED,
        payload: { id: "acme" },
      },
    ]);
    expect(screen.getByTestId("where")).toHaveTextContent("/");
  });

  it("switches back to the personal workspace", () => {
    renderRail("acme");

    fireEvent.click(screen.getByRole("button", { name: "Personal workspace" }));

    expect(switches()).toEqual([
      {
        type: organizationActionTypes.SWITCH_ORGANIZATION_REQUESTED,
        payload: { id: "personal" },
      },
    ]);
  });

  it("does not switch to the workspace already in use", () => {
    renderRail("acme", "/payments");

    fireEvent.click(screen.getByRole("button", { name: "Acme" }));

    expect(switches()).toEqual([]);
    expect(screen.getByTestId("where")).toHaveTextContent("/payments");
  });

  it("is reachable and usable from the keyboard", async () => {
    const user = userEvent.setup();
    renderRail();

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Personal workspace" }),
    ).toHaveFocus();
    await user.tab();
    const acme = screen.getByRole("button", { name: "Acme" });
    expect(acme).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Acme");

    await user.keyboard("{Enter}");

    expect(switches()).toEqual([
      {
        type: organizationActionTypes.SWITCH_ORGANIZATION_REQUESTED,
        payload: { id: "acme" },
      },
    ]);
  });

  it("opens the create dialog from +", async () => {
    renderRail();

    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Create organization" }),
    ).toBeInTheDocument();
  });

  it("suggests a handle from the name and rejects a reserved one", async () => {
    renderRail();
    fireEvent.click(screen.getByTestId("rail-create"));

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: "Acme Labs" },
    });
    const handle = screen.getByLabelText(/^Handle/) as HTMLInputElement;
    expect(handle.value).toBe("acme-labs");

    fireEvent.change(handle, { target: { value: "pricing" } });
    expect(
      screen.getByText("That handle is reserved for a 4Mica page."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("create-organization-submit"));
    expect(dispatched.map((action) => action.type)).not.toContain(
      organizationActionTypes.CREATE_ORGANIZATION_REQUESTED,
    );
  });

  it("creates an organization with a valid name and handle", async () => {
    renderRail();
    fireEvent.click(screen.getByTestId("rail-create"));

    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: "Acme Labs" },
    });
    fireEvent.click(screen.getByTestId("create-organization-submit"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: organizationActionTypes.CREATE_ORGANIZATION_REQUESTED,
        payload: { name: "Acme Labs", handle: "acme-labs" },
      }),
    );
  });

  it("opens profile and preferences from the account menu", () => {
    renderRail("acme");

    fireEvent.click(
      screen.getByRole("button", { name: "Account menu for Ada Lovelace" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Profile & preferences" }),
    );

    expect(screen.getByTestId("where")).toHaveTextContent("/settings/profile");
  });

  it("signs out from the account menu", () => {
    renderRail();

    fireEvent.click(
      screen.getByRole("button", { name: "Account menu for Ada Lovelace" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/sign-in" });
  });
});

describe("switching on a settings page", () => {
  it.each([
    ["personal", "acme", "/settings/profile", "/settings/profile"],
    ["personal", "acme", "/settings/developer", "/settings/developer"],
    ["acme", "personal", "/settings/team", "/settings/profile"],
    ["acme", "personal", "/settings/notifications", "/settings/notifications"],
    ["acme", "globex", "/settings/audit-log", "/settings/general"],
    ["acme", "globex", "/settings/team", "/settings/team"],
    ["personal", "acme", "/settings", "/settings/general"],
  ])("from %s to %s, %s becomes %s", (from, to, path, expected) => {
    renderRail(from, path);
    const label =
      to === "personal"
        ? "Personal workspace"
        : (ORGANIZATIONS.find((item) => item.id === to)?.name ?? "");

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(screen.getByTestId("where")).toHaveTextContent(expected);
    expect(switches()).toHaveLength(1);
  });
});

describe("after creating an organization", () => {
  it("lands on Team with the invite dialog requested", async () => {
    const created = organization({ id: "labs", name: "Acme Labs" });
    const initial = stateFor("personal", [PERSONAL]);
    const store = createStore(
      (
        current: typeof initial = initial,
        action: { type: string },
      ): typeof initial => {
        if (
          action.type === organizationActionTypes.CREATE_ORGANIZATION_REQUESTED
        ) {
          return {
            ...current,
            organization: {
              ...current.organization,
              pending: { createOrganization: true },
            },
          };
        }
        if (action.type === "test/created") {
          return {
            ...current,
            organization: {
              ...current.organization,
              items: [...current.organization.items, created],
              activeId: created.id,
              pending: {},
            },
          };
        }
        return current;
      },
    );
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/payments"]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <OrganizationRail />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    fireEvent.click(screen.getByTestId("rail-create"));
    fireEvent.change(await screen.findByLabelText(/^Name/), {
      target: { value: "Acme Labs" },
    });
    fireEvent.click(screen.getByTestId("create-organization-submit"));
    expect(screen.getByTestId("where")).toHaveTextContent("/payments");

    act(() => {
      store.dispatch({ type: "test/created" });
    });

    expect(screen.getByTestId("where")).toHaveTextContent(
      "/settings/team?invite=1",
    );
    expect(screen.queryByTestId("create-organization-modal")).toBeNull();
    expect(screen.getByRole("button", { name: "Acme Labs" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
