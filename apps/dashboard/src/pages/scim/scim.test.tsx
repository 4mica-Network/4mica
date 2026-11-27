import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import securityActionTypes from "@stores/security/actionTypes";
import { INITIAL_STATE as SECURITY_INITIAL_STATE } from "@stores/security/reducer";
import type { RevealSecuritySecret } from "@stores/security/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

const { ScimSettings, mappingFromValue, mappingValue } = await import(
  "./index"
);

type Action = {
  type: string;
  payload?: unknown;
  onReveal?: RevealSecuritySecret;
};
let dispatched: Action[] = [];

const renderScim = (permissions: Permission[], personal = false) => {
  dispatched = [];
  const organization: OrganizationSummary = {
    id: "acme",
    handle: "acme",
    name: "Acme",
    avatarUrl: null,
    personal,
    role: "OWNER",
    permissions,
    memberCount: 3,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
  const state = {
    user: { ...USER_INITIAL_STATE, user: { id: "me", name: "Ada" } as User },
    organization: {
      ...ORGANIZATION_INITIAL_STATE,
      items: [organization],
      activeId: organization.id,
      status: "loaded" as const,
    },
    security: {
      ...SECURITY_INITIAL_STATE,
      scimTokens: { items: [], status: "loaded" as const, error: null },
      scimGroups: {
        items: [
          {
            id: "grp_1",
            displayName: "Engineering",
            memberCount: 4,
            role: "DEVELOPER" as const,
            customRoleId: null,
            priority: 10,
          },
        ],
        status: "loaded" as const,
        error: null,
      },
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as Action);
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ScimSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("SCIM provisioning", () => {
  it("shows a new token and the SCIM base URL once, then forgets them", () => {
    renderScim(["security.manage"]);

    fireEvent.change(screen.getByLabelText("Token name"), {
      target: { value: "Okta" },
    });
    fireEvent.click(screen.getByTestId("scim-token-create"));

    const request = dispatched.find(
      (action) => action.type === securityActionTypes.SECURITY_OP_REQUESTED,
    );
    expect(request?.payload).toEqual({ op: "createScimToken", name: "Okta" });
    expect(screen.queryByTestId("scim-secret")).toBeNull();

    act(() =>
      request?.onReveal?.({
        kind: "scimToken",
        secret: "4mica_scim_secret",
        baseUrl: "https://api.test/scim/v2",
        name: "Okta",
      }),
    );
    const card = screen.getByTestId("scim-secret");
    expect(card).toHaveTextContent("4mica_scim_secret");
    expect(card).toHaveTextContent("https://api.test/scim/v2");

    fireEvent.click(screen.getByText("I've saved it"));
    expect(screen.queryByTestId("scim-secret")).toBeNull();
    expect(screen.queryByText("4mica_scim_secret")).toBeNull();
  });

  it("saves a group's role and priority", () => {
    renderScim(["security.manage"]);

    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByTestId("scim-group-save-grp_1"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        payload: {
          op: "updateScimGroup",
          id: "grp_1",
          data: { role: "DEVELOPER", customRoleId: null, priority: 20 },
        },
      }),
    );
  });

  it("is only for owners of a real organization", () => {
    renderScim(["members.manage"]);
    expect(
      screen.getByTestId("scim-unavailable-empty-state"),
    ).toBeInTheDocument();
  });

  it("maps select values to a base role, a custom role or nothing", () => {
    expect(mappingFromValue("custom:r1")).toEqual({
      role: null,
      customRoleId: "r1",
    });
    expect(mappingFromValue("none")).toEqual({
      role: null,
      customRoleId: null,
    });
    expect(mappingFromValue("ADMIN")).toEqual({
      role: "ADMIN",
      customRoleId: null,
    });
    expect(mappingValue({ role: null, customRoleId: null })).toBe("none");
  });
});
