import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type { OrganizationSummary } from "@stores/organization/type";
import { INITIAL_STATE as SECURITY_INITIAL_STATE } from "@stores/security/reducer";
import teamActionTypes from "@stores/team/actionTypes";
import { INITIAL_STATE as TEAM_INITIAL_STATE } from "@stores/team/reducer";
import type { Member } from "@stores/team/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it } from "vitest";
import "@/i18n";
import { TeamSettings } from "./index";
import { isManagedIdentity, roleValue } from "./roles";

const ORGANIZATION: OrganizationSummary = {
  id: "acme",
  handle: "acme",
  name: "Acme",
  avatarUrl: null,
  personal: false,
  role: "OWNER",
  permissions: ["members.manage", "security.manage", "roles.manage"],
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const member = (over: Partial<Member> & { userId: string }): Member => ({
  name: over.userId,
  username: null,
  email: `${over.userId}@acme.com`,
  avatarUrl: null,
  role: "DEVELOPER",
  joinedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

let dispatched: { type: string; payload?: unknown }[] = [];

const renderTeam = (
  members: Member[],
  domains: { domain: string; verified: boolean }[] | null,
) => {
  dispatched = [];
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [ORGANIZATION],
      activeId: ORGANIZATION.id,
      status: "loaded" as const,
    },
    team: {
      ...TEAM_INITIAL_STATE,
      members: [member({ userId: "me", role: "OWNER" }), ...members],
      membersStatus: "loaded" as const,
      invitationsStatus: "loaded" as const,
    },
    security: {
      ...SECURITY_INITIAL_STATE,
      roles: {
        items: [
          {
            id: "role_auditor",
            name: "Auditor",
            description: null,
            permissions: ["audit.read" as const],
            projectRole: "VIEWER" as const,
            memberCount: 1,
            createdAt: "2026-11-01T00:00:00.000Z",
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
        ],
        status: "loaded" as const,
        error: null,
      },
      domains: domains
        ? {
            items: domains.map((domain, index) => ({
              id: `dom_${index}`,
              verifiedAt: null,
              verificationRecord: { type: "TXT" as const, name: "", value: "" },
              autoJoin: false,
              autoJoinRole: "VIEWER" as const,
              lastCheckedAt: null,
              createdAt: "2026-11-01T00:00:00.000Z",
              ...domain,
            })),
            status: "loaded" as const,
            error: null,
          }
        : SECURITY_INITIAL_STATE.domains,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <TeamSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("enterprise member management", () => {
  it("shows where a member came from, their custom role and a suspension", () => {
    renderTeam(
      [
        member({
          userId: "scim",
          source: "SCIM",
          suspendedAt: "2026-11-20T00:00:00.000Z",
          role: "VIEWER",
          customRole: { id: "role_auditor", name: "Auditor" },
        }),
      ],
      [{ domain: "acme.com", verified: true }],
    );

    const row = screen.getByTestId("member-row-scim");
    expect(within(row).getByText("Provisioned by SCIM")).toBeInTheDocument();
    expect(within(row).getByText("Suspended")).toBeInTheDocument();
    expect(within(row).getByText("Auditor (custom)")).toBeInTheDocument();
  });

  it("offers custom roles and assigns them by id", () => {
    renderTeam([member({ userId: "dev" })], null);

    fireEvent.click(screen.getByTestId("member-role-dev-select-trigger"));
    fireEvent.click(screen.getByRole("option", { name: "Auditor (custom)" }));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: teamActionTypes.UPDATE_MEMBER_ROLE_REQUESTED,
        payload: { userId: "dev", customRoleId: "role_auditor" },
      }),
    );
  });

  it("asks before suspending and reactivates in one step", () => {
    renderTeam(
      [
        member({ userId: "dev" }),
        member({ userId: "gone", suspendedAt: "2026-11-20T00:00:00.000Z" }),
      ],
      null,
    );

    fireEvent.click(screen.getByTestId("member-actions-dev"));
    fireEvent.click(screen.getByTestId("member-suspend-dev"));
    fireEvent.click(screen.getByTestId("member-confirm-dev-confirm"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: teamActionTypes.SUSPEND_MEMBER_REQUESTED,
        payload: { userId: "dev", suspended: true },
      }),
    );

    fireEvent.click(screen.getByTestId("member-actions-gone"));
    fireEvent.click(screen.getByTestId("member-reactivate-gone"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: teamActionTypes.SUSPEND_MEMBER_REQUESTED,
        payload: { userId: "gone", suspended: false },
      }),
    );
  });

  it("offers signing out everywhere only for identities on a verified domain", () => {
    renderTeam(
      [
        member({ userId: "managed" }),
        member({ userId: "outside", email: "outside@gmail.com" }),
      ],
      [{ domain: "acme.com", verified: true }],
    );

    fireEvent.click(screen.getByTestId("member-actions-managed"));
    expect(screen.getByTestId("member-sessions-managed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("member-sessions-managed"));
    fireEvent.click(screen.getByTestId("member-confirm-managed-confirm"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: teamActionTypes.REVOKE_MEMBER_SESSIONS_REQUESTED,
        payload: { userId: "managed" },
      }),
    );

    fireEvent.click(screen.getByTestId("member-actions-outside"));
    expect(screen.queryByTestId("member-sessions-outside")).toBeNull();
  });
});

describe("member helpers", () => {
  it("treats an unknown domain list as managed so the API can explain", () => {
    expect(isManagedIdentity("a@acme.com", null)).toBe(true);
    expect(isManagedIdentity("a@ACME.com", ["acme.com"])).toBe(true);
    expect(isManagedIdentity("a@other.com", ["acme.com"])).toBe(false);
    expect(isManagedIdentity(null, ["acme.com"])).toBe(false);
  });

  it("encodes a custom role so the select can tell it from a base role", () => {
    expect(roleValue({ role: "VIEWER", customRole: { id: "r1" } })).toBe(
      "custom:r1",
    );
    expect(roleValue({ role: "ADMIN" })).toBe("ADMIN");
  });
});
