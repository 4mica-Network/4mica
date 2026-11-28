import { INITIAL_STATE as BANNER_INITIAL_STATE } from "@stores/banner/reducer";
import organizationActionTypes from "@stores/organization/actionTypes";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import { INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

const { Sidebar } = await import("@/components/Sidebar");

const organization = (
  over: Partial<OrganizationSummary>,
): OrganizationSummary => ({
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "ADMIN",
  permissions: [],
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const ORGANIZATIONS = [
  organization({
    id: "personal",
    name: "Ada Lovelace",
    personal: true,
    role: "OWNER",
  }),
  organization({}),
];

let dispatched: { type: string; payload?: unknown }[] = [];

const renderSidebar = (activeId = "personal", path = "/payments") => {
  dispatched = [];
  const state = {
    user: { ...INITIAL_STATE, user: { name: "Ada Lovelace" } as User },
    banner: BANNER_INITIAL_STATE,
    developer: {},
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: ORGANIZATIONS,
      defaultId: "personal",
      activeId,
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
          <Route path="*" element={<Sidebar collapsed={false} />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
};

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: /Ada Lovelace/ }));

describe("organization switcher", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the organization in use under the user's name", () => {
    renderSidebar("acme");

    expect(screen.getByTestId("active-organization")).toHaveTextContent("Acme");
  });

  it("lists every organization with its role and marks the personal one", () => {
    renderSidebar();
    openMenu();

    const personal = screen.getByTestId("organization-option-personal");
    expect(within(personal).getByText("Personal")).toBeInTheDocument();
    expect(within(personal).getByText("Owner")).toBeInTheDocument();

    const acme = screen.getByTestId("organization-option-acme");
    expect(within(acme).getByText("Admin")).toBeInTheDocument();
    expect(within(acme).queryByText("Personal")).toBeNull();
  });

  it("checks the active organization", () => {
    renderSidebar("acme");
    openMenu();

    expect(screen.getByRole("menuitemradio", { name: /Acme/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("organization-option-personal")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("switches when another organization is picked", () => {
    renderSidebar();
    openMenu();

    fireEvent.click(screen.getByTestId("organization-option-acme"));

    expect(dispatched).toContainEqual({
      type: organizationActionTypes.SWITCH_ORGANIZATION_REQUESTED,
      payload: { id: "acme" },
    });
  });

  it("does not switch to the organization already in use", () => {
    renderSidebar();
    openMenu();

    fireEvent.click(screen.getByTestId("organization-option-personal"));

    expect(dispatched.map((action) => action.type)).not.toContain(
      organizationActionTypes.SWITCH_ORGANIZATION_REQUESTED,
    );
  });

  it("opens the create dialog", async () => {
    renderSidebar();
    openMenu();

    fireEvent.click(screen.getByTestId("organization-create"));

    expect(
      await screen.findByRole("dialog", { name: "Create organization" }),
    ).toBeInTheDocument();
  });

  it("suggests a handle from the name and rejects a reserved one", async () => {
    renderSidebar();
    openMenu();
    fireEvent.click(screen.getByTestId("organization-create"));

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
    renderSidebar();
    openMenu();
    fireEvent.click(screen.getByTestId("organization-create"));

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

  it("hides the audit log from settings without audit access", () => {
    renderSidebar("acme", "/settings/profile");

    expect(screen.queryByText("Audit log")).toBeNull();
  });
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

describe("after creating an organization", () => {
  it("lands on Team with the invite dialog requested", async () => {
    const created = organization({ id: "labs", name: "Acme Labs" });
    const initial = {
      user: { ...INITIAL_STATE, user: { name: "Ada Lovelace" } as User },
      banner: BANNER_INITIAL_STATE,
      developer: {},
      organization: {
        ...ORGANIZATION_INITIAL_STATE,
        items: [ORGANIZATIONS[0]],
        defaultId: "personal",
        activeId: "personal",
        status: "loaded" as const,
      },
    };
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
                  <Sidebar collapsed={false} />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    openMenu();
    fireEvent.click(screen.getByTestId("organization-create"));
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
  });
});
