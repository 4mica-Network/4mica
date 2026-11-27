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
  "security.manage",
  "roles.manage",
  "compliance.read",
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
  "compliance.read",
];

const OWNER: readonly Permission[] = [
  ...ADMIN,
  "org.delete",
  "org.transfer",
  "governance.manage",
  "security.manage",
  "roles.manage",
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

export const OWNER_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "org.delete",
  "org.transfer",
  "governance.manage",
  "security.manage",
  "roles.manage",
]);

export const ASSIGNABLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => !OWNER_ONLY_PERMISSIONS.has(permission),
);

export interface CustomRoleGrant {
  id: string;
  permissions: readonly string[];
  projectRole: ProjectRole;
}

export interface RoleSubject {
  role: OrgRole;
  custom?: CustomRoleGrant | null;
}

export const can = (
  subject: OrgRole | RoleSubject,
  permission: Permission,
): boolean => {
  if (typeof subject === "string") {
    return ROLE_PERMISSIONS[subject].has(permission);
  }
  if (subject.custom && subject.role !== "OWNER") {
    return (
      !OWNER_ONLY_PERMISSIONS.has(permission) &&
      subject.custom.permissions.includes(permission)
    );
  }
  return ROLE_PERMISSIONS[subject.role].has(permission);
};

export const permissionsFor = (subject: OrgRole | RoleSubject): Permission[] =>
  PERMISSIONS.filter((permission) => can(subject, permission));

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
  customProjectRole?: ProjectRole | null;
}

export const effectiveProjectRole = ({
  orgRole,
  projectRole,
  restricted,
  customProjectRole,
}: ProjectAccessInput): ProjectRole | null => {
  if (orgRole === "OWNER" || (orgRole === "ADMIN" && !customProjectRole)) {
    return "ADMIN";
  }
  if (projectRole) {
    return projectRole;
  }
  if (restricted) {
    return null;
  }
  if (customProjectRole) {
    return customProjectRole;
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
