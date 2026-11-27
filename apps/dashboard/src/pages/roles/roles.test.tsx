import { INITIAL_STATE as ORGANIZATION_INITIAL_STATE } from "@stores/organization/reducer";
import type {
  OrganizationSummary,
  Permission,
} from "@stores/organization/type";
import securityActionTypes from "@stores/security/actionTypes";
import { INITIAL_STATE as SECURITY_INITIAL_STATE } from "@stores/security/reducer";
import type { CustomRole } from "@stores/security/type";
import { INITIAL_STATE as USER_INITIAL_STATE } from "@stores/user/reducer";
import type { User } from "@stores/user/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { createStore } from "redux";
import { describe, expect, it, vi } from "vitest";
import "@/i18n";
import { RolesSettings } from "./index";
import {
  groupPermissions,
  onlyAssignable,
  togglePermission,
} from "./permissions";
import { PermissionChecklist } from "./RoleFormModal";

const ASSIGNABLE: Permission[] = [
  "members.manage",
  "audit.read",
  "finance.read",
  "finance.manage",
];

const ROLE: CustomRole = {
  id: "role_1",
  name: "Auditor",
  description: "Reads the books",
  permissions: ["audit.read", "security.manage"],
  projectRole: "VIEWER",
  memberCount: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

let dispatched: { type: string; payload?: unknown }[] = [];

const renderRoles = (permissions: Permission[]) => {
  dispatched = [];
  const organization: OrganizationSummary = {
    id: "acme",
    handle: "acme",
    name: "Acme",
    avatarUrl: null,
    personal: false,
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
      roles: { items: [ROLE], status: "loaded" as const, error: null },
      assignablePermissions: ASSIGNABLE,
    },
  };
  const store = createStore((current = state, action) => {
    dispatched.push(action as { type: string });
    return current;
  });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <RolesSettings />
      </MemoryRouter>
    </Provider>,
  );
};

describe("permission checklist", () => {
  it("offers only the permissions the API says can be assigned, grouped by area", () => {
    render(
      <PermissionChecklist
        assignable={ASSIGNABLE}
        selected={[]}
        onChange={() => {}}
      />,
    );

    for (const permission of ASSIGNABLE) {
      expect(
        screen.getByTestId(`permission-${permission}-checkbox`),
      ).toBeInTheDocument();
    }
    expect(
      screen.queryByTestId("permission-security.manage-checkbox"),
    ).toBeNull();
    expect(screen.queryByTestId("permission-roles.manage-checkbox")).toBeNull();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
  });

  it("never returns a permission outside the assignable list", () => {
    const onChange = vi.fn();
    render(
      <PermissionChecklist
        assignable={ASSIGNABLE}
        selected={["security.manage" as Permission]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText("Read the audit log"));
    expect(onChange).toHaveBeenCalledWith(["audit.read"]);
  });

  it("keeps helpers within the assignable set", () => {
    expect(groupPermissions(ASSIGNABLE).map((group) => group.area)).toEqual([
      "members",
      "audit",
      "finance",
    ]);
    expect(
      togglePermission(["finance.read"], "members.manage", true, ASSIGNABLE),
    ).toEqual(["members.manage", "finance.read"]);
    expect(onlyAssignable(ROLE.permissions, ASSIGNABLE)).toEqual([
      "audit.read",
    ]);
  });
});

describe("custom roles page", () => {
  it("lists roles with their member count and saves only assignable permissions", () => {
    renderRoles(["members.manage", "roles.manage"]);

    expect(screen.getByTestId("role-members-role_1-tag")).toHaveTextContent(
      "3 members",
    );
    fireEvent.click(screen.getByTestId("role-edit-role_1"));
    fireEvent.click(screen.getByTestId("role-modal-submit"));

    expect(dispatched).toContainEqual(
      expect.objectContaining({
        type: securityActionTypes.SECURITY_OP_REQUESTED,
        payload: {
          op: "saveRole",
          id: "role_1",
          data: {
            name: "Auditor",
            description: "Reads the books",
            permissions: ["audit.read"],
            projectRole: "VIEWER",
          },
        },
      }),
    );
  });

  it("warns that members fall back to Viewer before deleting", () => {
    renderRoles(["members.manage", "roles.manage"]);

    fireEvent.click(screen.getByTestId("role-delete-role_1"));
    expect(screen.getByTestId("role-delete-dialog-panel")).toHaveTextContent(
      "3 members have this role. They fall back to Viewer.",
    );
    fireEvent.click(screen.getByTestId("role-delete-dialog-confirm"));
    expect(dispatched).toContainEqual(
      expect.objectContaining({
        payload: { op: "deleteRole", id: "role_1" },
      }),
    );
  });

  it("is read-only without roles.manage", () => {
    renderRoles(["members.manage"]);

    expect(screen.getByTestId("roles-read-only")).toBeInTheDocument();
    expect(screen.queryByTestId("role-new")).toBeNull();
    expect(screen.queryByTestId("role-edit-role_1")).toBeNull();
  });
});
