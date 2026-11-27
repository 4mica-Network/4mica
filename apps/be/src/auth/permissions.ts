import type { EnvironmentKind, OrgRole, ProjectRole } from "@4mica/db";

export const PERMISSIONS = [
  "org.delete",
  "org.transfer",
  "org.update",
  "members.manage",
  "audit.read",
  "wallets.manage",
  "business.manage",
  "projects.create",
  "resources.write",
  "resources.read",
  "payments.read",
  "finance.read",
  "finance.manage",
  "approvals.decide",
  "governance.manage",
  "reports.export",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: readonly Permission[] = [
  "resources.read",
  "payments.read",
  "finance.read",
];

const FINANCE: readonly Permission[] = [
  ...VIEWER,
  "finance.manage",
  "approvals.decide",
  "reports.export",
];

const DEVELOPER: readonly Permission[] = [
  ...VIEWER,
  "resources.write",
  "projects.create",
];

const ADMIN: readonly Permission[] = [
  ...DEVELOPER,
  "org.update",
  "members.manage",
  "audit.read",
  "wallets.manage",
  "business.manage",
  "finance.manage",
  "approvals.decide",
  "reports.export",
];

const OWNER: readonly Permission[] = [
  ...ADMIN,
  "org.delete",
  "org.transfer",
  "governance.manage",
];

export const ROLE_PERMISSIONS: Readonly<
  Record<OrgRole, ReadonlySet<Permission>>
> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  DEVELOPER: new Set(DEVELOPER),
  VIEWER: new Set(VIEWER),
  FINANCE: new Set(FINANCE),
};

export const can = (role: OrgRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].has(permission);

export const permissionsFor = (role: OrgRole): Permission[] =>
  PERMISSIONS.filter((permission) => can(role, permission));

export const PROJECT_PERMISSIONS = [
  "project.read",
  "project.update",
  "project.delete",
  "project.members.manage",
  "resources.read",
  "resources.write",
  "keys.manage",
  "service_accounts.manage",
  "payments.read",
] as const;

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number];

const PROJECT_VIEWER: readonly ProjectPermission[] = [
  "project.read",
  "resources.read",
  "payments.read",
];

const PROJECT_DEVELOPER: readonly ProjectPermission[] = [
  ...PROJECT_VIEWER,
  "resources.write",
  "keys.manage",
  "service_accounts.manage",
];

const PROJECT_ADMIN: readonly ProjectPermission[] = [
  ...PROJECT_DEVELOPER,
  "project.update",
  "project.delete",
  "project.members.manage",
];

export const PROJECT_ROLE_PERMISSIONS: Readonly<
  Record<ProjectRole, ReadonlySet<ProjectPermission>>
> = {
  ADMIN: new Set(PROJECT_ADMIN),
  DEVELOPER: new Set(PROJECT_DEVELOPER),
  VIEWER: new Set(PROJECT_VIEWER),
};

const WRITES: ReadonlySet<ProjectPermission> = new Set([
  "resources.write",
  "keys.manage",
  "service_accounts.manage",
  "project.update",
  "project.delete",
  "project.members.manage",
]);

export const isWrite = (permission: ProjectPermission): boolean =>
  WRITES.has(permission);

export interface ProjectAccessInput {
  orgRole: OrgRole;
  projectRole: ProjectRole | null;
  restricted: boolean;
}

export const effectiveProjectRole = ({
  orgRole,
  projectRole,
  restricted,
}: ProjectAccessInput): ProjectRole | null => {
  if (orgRole === "OWNER" || orgRole === "ADMIN") {
    return "ADMIN";
  }
  if (projectRole) {
    return projectRole;
  }
  if (restricted) {
    return null;
  }
  return orgRole === "DEVELOPER" ? "DEVELOPER" : "VIEWER";
};

export interface ProjectPermissionContext {
  role: ProjectRole;
  environment: EnvironmentKind;
  restrictProduction: boolean;
  archived: boolean;
}

export const projectPermissionsFor = ({
  role,
  environment,
  restrictProduction,
  archived,
}: ProjectPermissionContext): ProjectPermission[] =>
  PROJECT_PERMISSIONS.filter((permission) => {
    if (!PROJECT_ROLE_PERMISSIONS[role].has(permission)) {
      return false;
    }
    if (archived && isWrite(permission) && permission !== "project.update") {
      return false;
    }
    return !(
      environment === "PRODUCTION" &&
      restrictProduction &&
      role !== "ADMIN" &&
      isWrite(permission)
    );
  });

export const ROLE_RANK: Readonly<Record<OrgRole, number>> = {
  OWNER: 4,
  ADMIN: 3,
  DEVELOPER: 2,
  FINANCE: 2,
  VIEWER: 1,
};
