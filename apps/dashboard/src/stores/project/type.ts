import type { EnvironmentKind } from "@4mica/rules";
import type { LoadStatus, OrganizationRole } from "@stores/organization/type";

export const PROJECT_PERMISSION = {
  PROJECT_READ: "project.read",
  RESOURCES_READ: "resources.read",
  PAYMENTS_READ: "payments.read",
  RESOURCES_WRITE: "resources.write",
  KEYS_MANAGE: "keys.manage",
  SERVICE_ACCOUNTS_MANAGE: "service_accounts.manage",
  PROJECT_UPDATE: "project.update",
  PROJECT_DELETE: "project.delete",
  PROJECT_MEMBERS_MANAGE: "project.members.manage",
} as const;

export type ProjectPermission =
  (typeof PROJECT_PERMISSION)[keyof typeof PROJECT_PERMISSION];

export const PROJECT_ROLES = ["ADMIN", "DEVELOPER", "VIEWER"] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const ENVIRONMENTS = ["sandbox", "production"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export const environmentKind = (environment: Environment): EnvironmentKind =>
  environment === "production" ? "PRODUCTION" : "SANDBOX";

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  restricted: boolean;
  restrictProduction: boolean;
  archived: boolean;
  role: ProjectRole;
  permissions: Record<EnvironmentKind, ProjectPermission[]>;
  environments: { id: string; kind: EnvironmentKind }[];
  createdAt: string;
}

export interface ProjectMember {
  userId: string;
  name: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
  orgRole: OrganizationRole;
  projectRole: ProjectRole | null;
  effectiveRole: ProjectRole | null;
}

export interface NewProject {
  name: string;
  slug?: string;
  description?: string | null;
  restricted?: boolean;
}

export type ProjectChanges = Partial<{
  name: string;
  slug: string;
  description: string | null;
  restricted: boolean;
  restrictProduction: boolean;
}>;

export type MovableKind = "agent" | "api_listing" | "webhook" | "customer";

export interface MoveResult {
  moved: string[];
  notFound: string[];
}

export interface ProjectState {
  organizationId: string | null;
  items: ProjectSummary[];
  activeId: string | null;
  environment: Environment;
  status: LoadStatus;
  error: string | null;
  pending: Record<string, boolean>;
  issues: Record<string, string>;
  members: ProjectMember[];
  membersStatus: LoadStatus;
  membersError: string | null;
}
