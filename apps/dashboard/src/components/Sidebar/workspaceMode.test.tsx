import { INITIAL_STATE as BANNER_INITIAL_STATE } from "@stores/banner/reducer";
import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import type { ProjectSummary } from "@stores/project/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

const { Sidebar } = await import("./index");
const { WorkspaceGuard } = await import("@/components/WorkspaceGuard");
const { SettingsLayout } = await import("@/components/SettingsLayout");
const { SettingsIndex } = await import("@/components/WorkspaceGuard");

const ALL: Permission[] = [
  "org.update",
  "members.manage",
  "audit.read",
  "projects.create",
  "finance.read",
  "finance.manage",
  "security.manage",
  "compliance.read",
];

const organization = (
  over: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
  id: "personal",
  handle: "ada",
  name: "Ada Lovelace",
  avatarUrl: null,
  personal: true,
  role: "OWNER",
  permissions: ALL,
  memberCount: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const ACME = organization({
  id: "acme",
  handle: "acme",
  name: "Acme",
  personal: false,
  memberCount: 3,
});

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "main",
  slug: "main",
  name: "Main",
  description: null,
  isDefault: true,
  restricted: false,
  restrictProduction: false,
  archived: false,
  role: "ADMIN",
  permissions: { SANDBOX: [], PRODUCTION: [] },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const storeFor = (
  organizations: OrganizationSummary[],
  activeId: string,
  projects: ProjectSummary[] = [project()],
) => {
  const state = {
    user: {
      ...USER_INITIAL_STATE,
      user: { name: "Ada Lovelace" } as User,
    },
    banner: BANNER_INITIAL_STATE,
    developer: {},
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: organizations,
      defaultId: "personal",
      activeId,
      status: "loaded" as const,
    },
    project: {
      ...PROJECT_INITIAL_STATE,
      organizationId: activeId,
      items: projects,
      activeId: projects[0]?.id ?? null,
      status: "loaded" as const,
    },
  };
  return createStore(() => state);
};

const renderSidebar = (
  store: ReturnType<typeof storeFor>,
  path = "/payments",
) =>
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<Sidebar collapsed={false} />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

const openMenu = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

const navLabels = () =>
  within(screen.getByRole("navigation"))
    .getAllByRole("link")
    .map((link) => link.textContent);

describe("sidebar in a personal workspace", () => {
  it("has no project switcher and a single finance entry", () => {
    renderSidebar(storeFor([organization()], "personal"));

    expect(screen.queryByTestId("project-switcher")).toBeNull();
    expect(navLabels()).toContain("Spending limits");
    expect(navLabels()).not.toContain("Approvals");
    expect(navLabels()).not.toContain("Reports");
  });

  it("keeps the environment toggle", () => {
    renderSidebar(storeFor([organization()], "personal"));

    expect(screen.getByTestId("environment-toggle")).toBeInTheDocument();
  });

  it("names the personal workspace in the header", () => {
    renderSidebar(storeFor([organization(), ACME], "personal"));

    expect(screen.getByTestId("active-organization")).toHaveTextContent(
      "Personal",
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("offers only the personal settings in the header menu", () => {
    renderSidebar(storeFor([organization(), ACME], "personal"));
    openMenu(/Personal menu/);

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Settings"]);
    expect(items[0]).toHaveAttribute("href", "/settings/profile");
    expect(screen.queryByTestId("organization-switcher")).toBeNull();
    expect(screen.queryByText("Create organization")).toBeNull();
  });

  it("hides team and enterprise settings", () => {
    renderSidebar(storeFor([organization()], "personal"), "/settings/profile");

    expect(navLabels()).toEqual([
      "Profile",
      "General",
      "Business",
      "Notifications",
      "Plans",
      "Compliance",
      "Developer",
    ]);
  });
});

describe("sidebar in an organization", () => {
  it("hides the project switcher while there is only the default project", () => {
    renderSidebar(storeFor([organization(), ACME], "acme"));

    expect(screen.queryByTestId("project-switcher")).toBeNull();
    expect(navLabels()).toEqual(
      expect.arrayContaining([
        "Policies & budgets",
        "Approvals",
        "Alerts",
        "Reports",
        "Spend checks",
      ]),
    );
  });

  it("shows the project switcher from the second project", () => {
    renderSidebar(
      storeFor([organization(), ACME], "acme", [
        project(),
        project({ id: "checkout", name: "Checkout", isDefault: false }),
      ]),
    );

    expect(screen.getByTestId("project-switcher")).toBeInTheDocument();
  });

  it("names the organization in the header and offers its settings", () => {
    renderSidebar(storeFor([organization(), ACME], "acme"));

    expect(screen.getByTestId("active-organization")).toHaveTextContent("Acme");
    openMenu(/Acme menu/);

    expect(
      screen.getByRole("menuitem", { name: "Organization settings" }),
    ).toHaveAttribute("href", "/settings/general");
    expect(
      screen.getByRole("menuitem", { name: "Invite people" }),
    ).toHaveAttribute("href", "/settings/team?invite=1");
    expect(
      screen.getByRole("menuitem", { name: "Leave organization" }),
    ).toHaveAttribute("href", "/settings/general");
  });

  it("does not offer invitations without members.manage", () => {
    const viewer = {
      ...ACME,
      role: "VIEWER" as const,
      permissions: ["finance.read" as const],
    };
    renderSidebar(storeFor([organization(), viewer], "acme"));
    openMenu(/Acme menu/);

    expect(
      screen.queryByRole("menuitem", { name: "Invite people" }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Organization settings" }),
    ).toHaveAttribute("href", "/settings/general");
  });

  it("shows which workspace the settings belong to", () => {
    renderSidebar(storeFor([organization(), ACME], "acme"), "/settings/team");

    expect(screen.getByTestId("settings-workspace")).toHaveTextContent("Acme");
  });

  it("groups settings and folds security into one entry", () => {
    renderSidebar(storeFor([organization(), ACME], "acme"), "/settings/team");

    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByText("Your account")).toBeInTheDocument();
    expect(navLabels()).toEqual([
      "General",
      "Team",
      "Projects",
      "Business",
      "Plans",
      "Compliance",
      "Developer",
      "Service accounts",
      "Security & compliance",
      "Profile",
      "Notifications",
    ]);
    expect(
      screen.getByRole("link", { name: "Security & compliance" }),
    ).toHaveAttribute("href", "/settings/security");
  });

  it("hides security and compliance from a developer", () => {
    const developer = { ...ACME, role: "DEVELOPER" as const };
    renderSidebar(
      storeFor([organization(), developer], "acme"),
      "/settings/team",
    );

    expect(navLabels()).not.toContain("Security & compliance");
  });
});

function Where({ label }: { label: string }) {
  return <p data-testid="where">{label}</p>;
}

const renderRoute = (store: ReturnType<typeof storeFor>, path: string) =>
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Where label="overview" />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsIndex />} />
            {["team", "audit-log", "general", "profile"].map((page) => (
              <Route
                key={page}
                path={page}
                element={
                  <WorkspaceGuard path={`/settings/${page}`}>
                    <Where label={page} />
                  </WorkspaceGuard>
                }
              />
            ))}
          </Route>
          <Route
            path="finance/approvals"
            element={
              <WorkspaceGuard path="/finance/approvals">
                <Where label="approvals" />
              </WorkspaceGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

describe("deep links", () => {
  it("sends a personal workspace from a team page to the overview", () => {
    renderRoute(storeFor([organization()], "personal"), "/finance/approvals");

    expect(screen.getByTestId("where")).toHaveTextContent("overview");
  });

  it.each([
    "/settings/team",
    "/settings/audit-log",
  ])("sends a personal workspace from %s to its first settings page", (path) => {
    renderRoute(storeFor([organization()], "personal"), path);

    expect(screen.getByTestId("where")).toHaveTextContent("profile");
  });

  it("sends a developer from a manager-only settings page to General", () => {
    const developer = { ...ACME, role: "DEVELOPER" as const };
    renderRoute(
      storeFor([organization(), developer], "acme"),
      "/settings/audit-log",
    );

    expect(screen.getByTestId("where")).toHaveTextContent("general");
  });

  it("keeps the personal settings reachable", () => {
    renderRoute(storeFor([organization()], "personal"), "/settings/general");

    expect(screen.getByTestId("where")).toHaveTextContent("general");
  });

  it("opens team pages inside an organization", () => {
    renderRoute(storeFor([organization(), ACME], "acme"), "/finance/approvals");

    expect(screen.getByTestId("where")).toHaveTextContent("approvals");
  });

  it("shows the security and compliance tabs above a tab page", () => {
    renderRoute(
      storeFor([organization(), ACME], "acme"),
      "/settings/audit-log",
    );

    const tabs = screen.getByTestId("settings-tabs");
    expect(within(tabs).getByRole("link", { name: "Audit log" })).toHaveClass(
      "bg-overlay/10",
    );
    expect(within(tabs).getAllByRole("link")).toHaveLength(8);
    expect(screen.getByTestId("where")).toHaveTextContent("audit-log");
  });
});

describe("opening settings", () => {
  it("lands on the organization's General page in a team, not the profile", () => {
    renderRoute(storeFor([organization(), ACME], "acme"), "/settings");

    expect(screen.getByTestId("where")).toHaveTextContent("general");
  });

  it("lands on the profile in a personal workspace", () => {
    renderRoute(storeFor([organization(), ACME], "personal"), "/settings");

    expect(screen.getByTestId("where")).toHaveTextContent("profile");
  });

  it("opens org General from the sidebar header in a team", () => {
    render(
      <Provider store={storeFor([organization(), ACME], "acme")}>
        <MemoryRouter initialEntries={["/payments"]}>
          <Routes>
            <Route path="payments" element={<Sidebar collapsed={false} />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<SettingsIndex />} />
              {["general", "profile"].map((page) => (
                <Route
                  key={page}
                  path={page}
                  element={<Where label={page} />}
                />
              ))}
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    openMenu(/Acme menu/);
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Organization settings" }),
    );

    expect(screen.getByTestId("where")).toHaveTextContent("general");
  });
});
