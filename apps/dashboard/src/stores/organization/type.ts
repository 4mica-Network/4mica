export const PERMISSION = {
  ORG_DELETE: "org.delete",
  ORG_TRANSFER: "org.transfer",
  ORG_UPDATE: "org.update",
  MEMBERS_MANAGE: "members.manage",
  AUDIT_READ: "audit.read",
  WALLETS_MANAGE: "wallets.manage",
  BUSINESS_MANAGE: "business.manage",
  PROJECTS_CREATE: "projects.create",
  RESOURCES_WRITE: "resources.write",
  RESOURCES_READ: "resources.read",
  PAYMENTS_READ: "payments.read",
  FINANCE_READ: "finance.read",
  FINANCE_MANAGE: "finance.manage",
  APPROVALS_DECIDE: "approvals.decide",
  GOVERNANCE_MANAGE: "governance.manage",
  REPORTS_EXPORT: "reports.export",
  SECURITY_MANAGE: "security.manage",
  ROLES_MANAGE: "roles.manage",
  COMPLIANCE_READ: "compliance.read",
} as const;

export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

export const ORGANIZATION_ROLE = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  DEVELOPER: "DEVELOPER",
  VIEWER: "VIEWER",
  FINANCE: "FINANCE",
} as const;

export type OrganizationRole =
  (typeof ORGANIZATION_ROLE)[keyof typeof ORGANIZATION_ROLE];

export interface OrganizationSummary {
  id: string;
  handle: string | null;
  name: string;
  avatarUrl: string | null;
  personal: boolean;
  role: OrganizationRole;
  permissions: Permission[];
  memberCount: number;
  createdAt: string;
}

export interface OrganizationList {
  items: OrganizationSummary[];
  defaultId: string;
}

export interface InvitationPreview {
  organization: {
    id: string;
    name: string;
    handle: string | null;
    avatarUrl: string | null;
  };
  email: string;
  role: OrganizationRole;
  invitedBy: { name: string } | null;
  expiresAt: string;
}

export type LoadStatus = "idle" | "loading" | "loaded" | "failed";

export type InvitationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "failed"
  | "accepted"
  | "declined";

export interface InvitationState {
  token: string | null;
  preview: InvitationPreview | null;
  status: InvitationStatus;
  errorCode: string | null;
  error: string | null;
}

export interface OrganizationState {
  items: OrganizationSummary[];
  defaultId: string | null;
  activeId: string | null;
  status: LoadStatus;
  error: string | null;
  pending: Record<string, boolean>;
  issues: Record<string, string>;
  invitation: InvitationState;
}
