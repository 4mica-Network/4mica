import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationRole,
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import teamActionTypes from "@stores/team/actionTypes";
import { INITIAL_STATE as TEAM_INITIAL_STATE } from "@stores/team/reducer";
import type { Member, PendingInvitation } from "@stores/team/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { beforeEach, describe, expect, it } from "vitest";
import "@/i18n";
import { TeamSettings } from "./index";
import { assignableRoles, parseEmails } from "./roles";

const MANAGER_PERMISSIONS: Permission[] = [
  "org.update",
  "members.manage",
  "audit.read",
  "resources.read",
];

const organization = (
  over: Partial<OrganizationSummary> = {},
): OrganizationSummary => ({
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "ADMIN",
  permissions: MANAGER_PERMISSIONS,
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const member = (
  userId: string,
  name: string,
  role: OrganizationRole,
): Member => ({
  userId,
  name,
  username: null,
  email: `${userId}@example.com`,
  avatarUrl: null,
  role,
  joinedAt: "2026-11-01T00:00:00.000Z",
});

const MEMBERS = [
  member("me", "Ada", "ADMIN"),
  member("owner", "Grace", "OWNER"),
  member("teammate", "Alan", "DEVELOPER"),
];

const INVITATION: PendingInvitation = {
  id: "inv_1",
  email: "new@example.com",
  role: "DEVELOPER",
  invitedBy: { id: "me", name: "Ada" },
  expiresAt: "2026-12-01T00:00:00.000Z",
  createdAt: "2026-11-20T00:00:00.000Z",
  expired: false,
};

let dispatched: { type: string; payload?: unknown }[] = [];

const renderTeam = (active: OrganizationSummary) => {
  dispatched = [];
  const state = {
    user: {
      ...USER_INITIAL_STATE,
      user: { id: "me", name: "Ada" } as User,
    },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [active],
      activeId: active.id,
      status: "loaded" as const,
    },
    team: {
      ...TEAM_INITIAL_STATE,
      members: MEMBERS,
      membersStatus: "loaded" as const,
      invitations: [INVITATION],
      invitationsStatus: "loaded" as const,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <TeamSettings />
      </MemoryRouter>
    </Provider>,
  );
};

const dispatchedTypes = () => dispatched.map((action) => action.type);

describe("team settings", () => {
  beforeEach(() => {
    dispatched = [];
  });

  it("explains that a personal workspace has a single member", () => {
    renderTeam(organization({ personal: true, role: "OWNER" }));

    expect(screen.getByTestId("team-personal-empty-state")).toHaveTextContent(
      "Personal workspaces have a single member",
    );
    expect(
      screen.getByRole("button", { name: "Create organization" }),
    ).toBeInTheDocument();
    expect(dispatchedTypes()).not.toContain(
      teamActionTypes.FETCH_MEMBERS_REQUESTED,
    );
  });

  it("loads members and invitations for someone who manages members", () => {
    renderTeam(organization());

    expect(dispatchedTypes()).toEqual(
      expect.arrayContaining([
        teamActionTypes.FETCH_MEMBERS_REQUESTED,
        teamActionTypes.FETCH_INVITATIONS_REQUESTED,
      ]),
    );
    expect(screen.getByTestId("team-invite")).toBeInTheDocument();
    expect(screen.getByTestId("invitation-row-inv_1")).toHaveTextContent(
      "new@example.com",
    );
  });

  it("never lets an admin change or remove an owner, or themselves", () => {
    renderTeam(organization());

    const owner = screen.getByTestId("member-row-owner");
    expect(within(owner).getByText("Owner")).toBeInTheDocument();
    expect(screen.queryByTestId("member-remove-owner")).toBeNull();
    expect(screen.queryByTestId("member-remove-me")).toBeNull();
    expect(screen.getByTestId("member-remove-teammate")).toBeInTheDocument();
  });

  it("shows a read-only list to a plain member", () => {
    renderTeam(
      organization({
        role: "DEVELOPER",
        permissions: ["resources.read", "resources.write", "payments.read"],
      }),
    );

    expect(screen.getByTestId("role-restricted")).toBeInTheDocument();
    expect(screen.queryByTestId("team-invite")).toBeNull();
    expect(screen.queryByTestId("member-remove-teammate")).toBeNull();
    expect(screen.queryByText("Pending invitations")).toBeNull();
    expect(dispatchedTypes()).not.toContain(
      teamActionTypes.FETCH_INVITATIONS_REQUESTED,
    );
  });

  it("refuses badly formed addresses before inviting", () => {
    renderTeam(organization());
    fireEvent.click(screen.getByTestId("team-invite"));

    fireEvent.change(screen.getByLabelText(/^Email addresses/), {
      target: { value: "ok@example.com, not-an-email" },
    });
    fireEvent.click(screen.getByTestId("invite-members-submit"));

    expect(
      screen.getByText("Check these addresses: not-an-email"),
    ).toBeInTheDocument();
    expect(dispatchedTypes()).not.toContain(
      teamActionTypes.INVITE_MEMBERS_REQUESTED,
    );
  });

  it("invites every address on its own line or after a comma", () => {
    renderTeam(organization());
    fireEvent.click(screen.getByTestId("team-invite"));

    fireEvent.change(screen.getByLabelText(/^Email addresses/), {
      target: { value: "One@example.com,\ntwo@example.com" },
    });
    fireEvent.click(screen.getByTestId("invite-members-submit"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: teamActionTypes.INVITE_MEMBERS_REQUESTED,
        payload: {
          emails: ["one@example.com", "two@example.com"],
          role: "DEVELOPER",
        },
      }),
    );
  });
});

describe("role helpers", () => {
  it("lets only an owner hand out the owner role", () => {
    expect(assignableRoles("OWNER")).toEqual([
      "OWNER",
      "ADMIN",
      "DEVELOPER",
      "VIEWER",
    ]);
    expect(assignableRoles("ADMIN")).toEqual(["ADMIN", "DEVELOPER", "VIEWER"]);
  });

  it("splits, trims, lowercases and de-duplicates pasted addresses", () => {
    expect(parseEmails(" A@x.io, b@x.io\n\na@x.io ;c@x.io ")).toEqual([
      "a@x.io",
      "b@x.io",
      "c@x.io",
    ]);
  });
});
