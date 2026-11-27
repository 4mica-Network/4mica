import type { OrgRole } from "@4mica/db";

export const PERMISSIONS = [
  "org.delete",
  "org.transfer",
  "org.update",
  "members.manage",
  "audit.read",
  "wallets.manage",
  "business.manage",
  "resources.write",
  "resources.read",
  "payments.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MEMBER: readonly Permission[] = [
  "resources.read",
  "resources.write",
  "payments.read",
];

const ADMIN: readonly Permission[] = [
  ...MEMBER,
  "org.update",
  "members.manage",
  "audit.read",
  "wallets.manage",
  "business.manage",
];

const OWNER: readonly Permission[] = [...ADMIN, "org.delete", "org.transfer"];

export const ROLE_PERMISSIONS: Readonly<
  Record<OrgRole, ReadonlySet<Permission>>
> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  MEMBER: new Set(MEMBER),
};

export const can = (role: OrgRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].has(permission);

export const permissionsFor = (role: OrgRole): Permission[] =>
  PERMISSIONS.filter((permission) => can(role, permission));

export const ROLE_RANK: Readonly<Record<OrgRole, number>> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};
