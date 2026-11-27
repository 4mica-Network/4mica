import { describe, expect, it } from "vitest";
import {
  can,
  effectiveProjectRole,
  PROJECT_PERMISSIONS,
  permissionsFor,
  projectPermissionsFor,
  ROLE_RANK,
} from "./permissions";

const READS = ["project.read", "resources.read", "payments.read"];
const DEVELOPER_WRITES = [
  "resources.write",
  "keys.manage",
  "service_accounts.manage",
];

describe("organization permissions", () => {
  it("ranks owner above admin above developer above viewer", () => {
    expect(ROLE_RANK.OWNER).toBeGreaterThan(ROLE_RANK.ADMIN);
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.DEVELOPER);
    expect(ROLE_RANK.DEVELOPER).toBeGreaterThan(ROLE_RANK.VIEWER);
  });

  it("gives a viewer only reads", () => {
    expect(permissionsFor("VIEWER")).toEqual([
      "resources.read",
      "payments.read",
    ]);
  });

  it("lets a developer write resources and create projects but not manage the organization", () => {
    expect(permissionsFor("DEVELOPER")).toEqual([
      "projects.create",
      "resources.write",
      "resources.read",
      "payments.read",
    ]);
    expect(can("DEVELOPER", "business.manage")).toBe(false);
    expect(can("DEVELOPER", "members.manage")).toBe(false);
  });

  it("keeps deleting and transferring the organization to owners", () => {
    expect(can("ADMIN", "members.manage")).toBe(true);
    expect(can("ADMIN", "business.manage")).toBe(true);
    expect(can("ADMIN", "org.delete")).toBe(false);
    expect(can("ADMIN", "org.transfer")).toBe(false);
    expect(can("OWNER", "org.delete")).toBe(true);
    expect(can("OWNER", "org.transfer")).toBe(true);
  });
});

describe("effectiveProjectRole", () => {
  it.each([
    "OWNER",
    "ADMIN",
  ] as const)("makes an org %s a project admin even where restricted", (orgRole) => {
    expect(
      effectiveProjectRole({
        orgRole,
        projectRole: "VIEWER",
        restricted: true,
      }),
    ).toBe("ADMIN");
    expect(
      effectiveProjectRole({ orgRole, projectRole: null, restricted: true }),
    ).toBe("ADMIN");
  });

  it("uses an explicit project role, even one above the org role", () => {
    expect(
      effectiveProjectRole({
        orgRole: "VIEWER",
        projectRole: "DEVELOPER",
        restricted: false,
      }),
    ).toBe("DEVELOPER");
    expect(
      effectiveProjectRole({
        orgRole: "DEVELOPER",
        projectRole: "ADMIN",
        restricted: true,
      }),
    ).toBe("ADMIN");
    expect(
      effectiveProjectRole({
        orgRole: "DEVELOPER",
        projectRole: "VIEWER",
        restricted: false,
      }),
    ).toBe("VIEWER");
  });

  it("derives the role from the org role on an unrestricted project", () => {
    expect(
      effectiveProjectRole({
        orgRole: "DEVELOPER",
        projectRole: null,
        restricted: false,
      }),
    ).toBe("DEVELOPER");
    expect(
      effectiveProjectRole({
        orgRole: "VIEWER",
        projectRole: null,
        restricted: false,
      }),
    ).toBe("VIEWER");
  });

  it.each([
    "DEVELOPER",
    "VIEWER",
  ] as const)("hides a restricted project from an org %s without a membership", (orgRole) => {
    expect(
      effectiveProjectRole({ orgRole, projectRole: null, restricted: true }),
    ).toBeNull();
  });
});

describe("projectPermissionsFor", () => {
  const base = {
    environment: "SANDBOX",
    restrictProduction: false,
    archived: false,
  } as const;

  it("grants each role its own permissions", () => {
    expect(projectPermissionsFor({ ...base, role: "ADMIN" })).toEqual([
      ...PROJECT_PERMISSIONS,
    ]);
    expect(projectPermissionsFor({ ...base, role: "DEVELOPER" })).toEqual([
      "project.read",
      "resources.read",
      "resources.write",
      "keys.manage",
      "service_accounts.manage",
      "payments.read",
    ]);
    expect(projectPermissionsFor({ ...base, role: "VIEWER" })).toEqual([
      "project.read",
      "resources.read",
      "payments.read",
    ]);
  });

  it("strips non-admin writes in a restricted production environment", () => {
    const permissions = projectPermissionsFor({
      ...base,
      role: "DEVELOPER",
      environment: "PRODUCTION",
      restrictProduction: true,
    });

    expect(permissions).toEqual(expect.arrayContaining(READS));
    for (const write of DEVELOPER_WRITES) {
      expect(permissions).not.toContain(write);
    }
  });

  it("leaves admins and sandbox alone when production is restricted", () => {
    expect(
      projectPermissionsFor({
        ...base,
        role: "ADMIN",
        environment: "PRODUCTION",
        restrictProduction: true,
      }),
    ).toEqual([...PROJECT_PERMISSIONS]);
    expect(
      projectPermissionsFor({
        ...base,
        role: "DEVELOPER",
        restrictProduction: true,
      }),
    ).toEqual(expect.arrayContaining(DEVELOPER_WRITES));
    expect(
      projectPermissionsFor({
        ...base,
        role: "DEVELOPER",
        environment: "PRODUCTION",
      }),
    ).toEqual(expect.arrayContaining(DEVELOPER_WRITES));
  });

  it("allows only reads and project.update on an archived project", () => {
    expect(
      projectPermissionsFor({ ...base, role: "ADMIN", archived: true }),
    ).toEqual([
      "project.read",
      "project.update",
      "resources.read",
      "payments.read",
    ]);
    expect(
      projectPermissionsFor({ ...base, role: "DEVELOPER", archived: true }),
    ).toEqual(READS);
  });
});
