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

export const CUSTOM_ROLE_PREFIX = "custom:";

export const roleValue = (member: {
  role: OrganizationRole;
  customRole?: { id: string } | null;
}): string =>
  member.customRole
    ? `${CUSTOM_ROLE_PREFIX}${member.customRole.id}`
    : member.role;

export const emailDomain = (email: string | null): string | null => {
  const at = email?.lastIndexOf("@") ?? -1;
  return email && at > 0 ? email.slice(at + 1).toLowerCase() : null;
};

export const isManagedIdentity = (
  email: string | null,
  verifiedDomains: string[] | null,
): boolean => {
  if (verifiedDomains === null) {
    return true;
  }
  const domain = emailDomain(email);
  return domain !== null && verifiedDomains.includes(domain);
};
