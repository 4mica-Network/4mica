import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import projectActionTypes from "@stores/project/actionTypes";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import type {
  ProjectMember,
  ProjectPermission,
  ProjectSummary,
} from "@stores/project/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { ProjectsSettings } from "./index";

const ADMIN: ProjectPermission[] = [
  "project.read",
  "resources.read",
  "resources.write",
  "project.update",
  "project.delete",
  "project.members.manage",
];

const organization: OrganizationSummary = {
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "ADMIN",
  permissions: ["projects.create", "resources.read"],
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const project = (over: Partial<ProjectSummary>): ProjectSummary => ({
  id: "main",
  slug: "main",
  name: "Main",
  description: null,
  isDefault: true,
  restricted: false,
  restrictProduction: false,
  archived: false,
  role: "ADMIN",
  permissions: { SANDBOX: ADMIN, PRODUCTION: ADMIN },
  environments: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const member = (over: Partial<ProjectMember>): ProjectMember => ({
  userId: "u_dev",
  name: "Alan",
  username: null,
  email: "alan@example.com",
  avatarUrl: null,
  orgRole: "DEVELOPER",
  projectRole: null,
  effectiveRole: "DEVELOPER",
  ...over,
});

let dispatched: { type: string; payload?: unknown }[] = [];

const DEFAULT_PROJECTS = [
  project({}),
  project({ id: "checkout", name: "Checkout", isDefault: false }),
  project({
    id: "old",
    name: "Legacy",
    isDefault: false,
    archived: true,
  }),
];

const openRoles = () =>
  fireEvent.click(
    within(screen.getByTestId("project-roles")).getByRole("button", {
      name: "Project roles",
    }),
  );

const renderPage = (activeId: string, items = DEFAULT_PROJECTS) => {
  dispatched = [];
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [organization],
      activeId: "acme",
      status: "loaded" as const,
    },
    project: {
      ...PROJECT_INITIAL_STATE,
      organizationId: "acme",
      items,
      activeId,
      status: "loaded" as const,
      members: [
        member({}),
        member({
          userId: "u_owner",
          name: "Grace",
          orgRole: "OWNER",
          effectiveRole: "ADMIN",
        }),
      ],
      membersStatus: "loaded" as const,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ProjectsSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("projects settings", () => {
  it("lists projects with the current one marked and archived ones tagged", () => {
    renderPage("main");

    expect(
      within(screen.getByTestId("projects-row-main")).getByText("Current"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("projects-row-old")).getByText("Archived"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("projects-create")).toBeInTheDocument();
    openRoles();
    expect(dispatched.map((a) => a.type)).toContain(
      projectActionTypes.FETCH_PROJECT_MEMBERS_REQUESTED,
    );
  });

  it("saves only the fields that changed", () => {
    renderPage("checkout");

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Checkout v2" },
    });
    fireEvent.click(screen.getByTestId("project-settings-save"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: projectActionTypes.UPDATE_PROJECT_REQUESTED,
        payload: { name: "Checkout v2" },
      }),
    );
  });

  it("does not offer archive or delete for the default project", () => {
    renderPage("main");

    expect(screen.queryByTestId("project-archive")).toBeNull();
    expect(screen.queryByTestId("project-delete")).toBeNull();
  });

  it("archives another project", () => {
    renderPage("checkout");
    fireEvent.click(screen.getByTestId("project-archive"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: projectActionTypes.ARCHIVE_PROJECT_REQUESTED,
        payload: { archived: true },
      }),
    );
  });

  it("shows org role, explicit role and effective role for every member", () => {
    renderPage("main");
    openRoles();

    const developer = screen.getByTestId("project-member-u_dev");
    expect(developer).toHaveTextContent("Organization: Developer");
    expect(
      within(developer).getByTestId("project-member-effective-u_dev-tag"),
    ).toHaveTextContent("Developer");
    expect(
      screen.getByTestId("project-role-u_dev-select-trigger"),
    ).toHaveTextContent("Inherited");

    const owner = screen.getByTestId("project-member-u_owner");
    expect(
      within(owner).queryByTestId("project-role-u_owner-select"),
    ).toBeNull();
    expect(owner).toHaveTextContent("Admin");
  });
});

describe("project access", () => {
  it("keeps the default project open to everyone", () => {
    renderPage("main");

    expect(screen.queryByTestId("project-access")).toBeNull();
    expect(
      screen.getByText(
        "Everyone in the organization can access the default project.",
      ),
    ).toBeInTheDocument();
  });

  it("restricts a project to chosen people", () => {
    renderPage("checkout");

    expect(screen.getByTestId("project-access-everyone")).toBeChecked();
    expect(screen.queryByText("People with access")).toBeNull();

    fireEvent.click(screen.getByLabelText(/Only people I choose/));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: projectActionTypes.UPDATE_PROJECT_REQUESTED,
        payload: { restricted: true },
      }),
    );
  });

  it("picks people and their role once only chosen people have access", () => {
    renderPage("checkout", [
      project({}),
      project({
        id: "checkout",
        name: "Checkout",
        isDefault: false,
        restricted: true,
      }),
    ]);

    expect(screen.getByTestId("project-access-chosen")).toBeChecked();
    expect(screen.getByText("People with access")).toBeInTheDocument();
    expect(
      screen.getByTestId("project-role-u_dev-select-trigger"),
    ).toHaveTextContent("No access");
  });

  it("keeps the production restriction under Advanced", () => {
    renderPage("checkout");

    expect(
      screen.queryByText("Only project admins can change production"),
    ).toBeNull();

    fireEvent.click(
      within(screen.getByTestId("project-advanced")).getByRole("button", {
        name: "Advanced",
      }),
    );

    expect(
      screen.getByText("Only project admins can change production"),
    ).toBeInTheDocument();
  });
});
