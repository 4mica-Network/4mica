import {
  ORGANIZATION_ROLE,
  type OrganizationRole,
} from "@stores/organization/type";

export const ROLES: OrganizationRole[] = [
  ORGANIZATION_ROLE.OWNER,
  ORGANIZATION_ROLE.ADMIN,
  ORGANIZATION_ROLE.DEVELOPER,
  ORGANIZATION_ROLE.FINANCE,
  ORGANIZATION_ROLE.VIEWER,
];

export const assignableRoles = (
  viewer: OrganizationRole | undefined,
): OrganizationRole[] =>
  viewer === ORGANIZATION_ROLE.OWNER
    ? ROLES
    : ROLES.filter((role) => role !== ORGANIZATION_ROLE.OWNER);

export const MAX_INVITES = 20;

export const parseEmails = (raw: string): string[] => [
  ...new Set(
    raw
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];
