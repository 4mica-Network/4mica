import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import { INITIAL_STATE as PROJECT_INITIAL_STATE } from "@stores/project/reducer";
import type { ProjectMember, ProjectSummary } from "@stores/project/type";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";

const { getInvitations } = vi.hoisted(() => ({ getInvitations: vi.fn() }));

vi.mock("@api/organization", () => ({ getInvitations }));

const { OrgSetupCard } = await import("./OrgSetupCard");
const { setupDismissKey, setupSteps } = await import("./setupSteps");

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

const member = (over: Partial<ProjectMember> = {}): ProjectMember => ({
  userId: "u_dev",
  name: "Alan",
  username: null,
  email: null,
  avatarUrl: null,
  orgRole: "DEVELOPER",
  projectRole: null,
  effectiveRole: "DEVELOPER",
  ...over,
});

const organization = (
  over: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "OWNER",
  permissions: ["members.manage", "projects.create"],
  memberCount: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const done = (steps: ReturnType<typeof setupSteps>) =>
  Object.fromEntries(steps.map((step) => [step.id, step.done]));

const base = {
  memberCount: 1,
  invitationCount: 0,
  projects: [project()],
  activeProjectId: "main",
  activeMembers: [] as ProjectMember[],
};

describe("organization setup steps", () => {
  it("starts with nothing done", () => {
    expect(done(setupSteps(base))).toEqual({
      invite: false,
      project: false,
      access: false,
    });
  });

  it("counts a teammate or a pending invitation as inviting the team", () => {
    expect(done(setupSteps({ ...base, memberCount: 2 })).invite).toBe(true);
    expect(done(setupSteps({ ...base, invitationCount: 1 })).invite).toBe(true);
  });

  it("needs a second project", () => {
    const projects = [project(), project({ id: "api", isDefault: false })];

    expect(done(setupSteps({ ...base, projects })).project).toBe(true);
    expect(done(setupSteps({ ...base, projects })).access).toBe(false);
  });

  it("counts access as reviewed once a project is restricted", () => {
    const projects = [
      project(),
      project({ id: "api", isDefault: false, restricted: true }),
    ];

    expect(done(setupSteps({ ...base, projects })).access).toBe(true);
  });

  it("counts explicit members on the project in view", () => {
    const projects = [project(), project({ id: "api", isDefault: false })];
    const activeMembers = [member({ projectRole: "ADMIN" })];

    expect(
      done(
        setupSteps({
          ...base,
          projects,
          activeProjectId: "api",
          activeMembers,
        }),
      ).access,
    ).toBe(true);
    expect(
      done(
        setupSteps({
          ...base,
          projects,
          activeProjectId: "main",
          activeMembers,
        }),
      ).access,
    ).toBe(false);
  });

  it("links each step to the page that completes it", () => {
    expect(setupSteps(base).map((step) => step.to)).toEqual([
      "/settings/team?invite=1",
      "/settings/projects",
      "/settings/projects",
    ]);
  });
});

const renderCard = (
  org: OrganizationSummary,
  projects: ProjectSummary[] = [project()],
) => {
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
      items: projects,
      activeId: projects[0]?.id ?? null,
    },
  };
  return render(
    <Provider store={createStore(() => state)}>
      <MemoryRouter>
        <OrgSetupCard />
      </MemoryRouter>
    </Provider>,
  );
};

describe("organization setup card", () => {
  beforeEach(() => {
    localStorage.clear();
    getInvitations.mockReset();
    getInvitations.mockResolvedValue({ items: [] });
  });

  it("shows the steps to an owner of a new organization", () => {
    renderCard(organization());

    expect(screen.getByText("Set up your organization")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 done")).toBeInTheDocument();
    expect(screen.getByTestId("org-setup-invite")).toHaveAttribute(
      "href",
      "/settings/team?invite=1",
    );
  });

  it("marks inviting done once an invitation is pending", async () => {
    getInvitations.mockResolvedValue({ items: [{ id: "inv_1" }] });
    renderCard(organization());

    await waitFor(() =>
      expect(screen.getByTestId("org-setup-invite")).toHaveAttribute(
        "data-done",
        "true",
      ),
    );
    expect(screen.getByText("1 of 3 done")).toBeInTheDocument();
  });

  it("stays hidden from a developer and in a personal workspace", () => {
    const { unmount } = renderCard(organization({ role: "DEVELOPER" }));
    expect(screen.queryByTestId("org-setup")).toBeNull();
    unmount();

    renderCard(organization({ personal: true }));
    expect(screen.queryByTestId("org-setup")).toBeNull();
  });

  it("disappears once every step is done", () => {
    renderCard(organization({ memberCount: 2 }), [
      project(),
      project({ id: "api", isDefault: false, restricted: true }),
    ]);

    expect(screen.queryByTestId("org-setup")).toBeNull();
  });

  it("remembers a dismissal for that organization only", () => {
    const { unmount } = renderCard(organization());
    fireEvent.click(screen.getByTestId("org-setup-dismiss"));

    expect(screen.queryByTestId("org-setup")).toBeNull();
    expect(localStorage.getItem(setupDismissKey("acme"))).toBe("1");
    unmount();

    renderCard(organization());
    expect(screen.queryByTestId("org-setup")).toBeNull();
    renderCard(organization({ id: "globex" }));
    expect(screen.getByTestId("org-setup")).toBeInTheDocument();
  });
});
