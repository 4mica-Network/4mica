import { useAppSelector } from "@stores/hooks";
import type { RootState } from "@stores/index";
import {
  allows,
  selectActiveOrganization,
  selectOrganizations,
} from "@stores/organization/selector";
import {
  ORGANIZATION_ROLE,
  type OrganizationSummary,
  PERMISSION,
} from "@stores/organization/type";
import { selectProjects } from "@stores/project/selector";
import type { ProjectSummary } from "@stores/project/type";
import { shallowEqual } from "react-redux";

export interface WorkspaceMode {
  personal: boolean;
  projectCount: number;
  canManageOrg: boolean;
  canSeeProjects: boolean;
  hasTeamOrganizations: boolean;
}

const ORG_MANAGERS = new Set<string>([
  ORGANIZATION_ROLE.OWNER,
  ORGANIZATION_ROLE.ADMIN,
]);

export const workspaceModeFor = (
  organization: OrganizationSummary | null,
  projects: ProjectSummary[],
  organizations: OrganizationSummary[],
): WorkspaceMode => {
  const personal = Boolean(organization?.personal);
  return {
    personal,
    projectCount: projects.length,
    canManageOrg: !organization || ORG_MANAGERS.has(organization.role),
    canSeeProjects:
      !personal &&
      (allows(organization, PERMISSION.PROJECTS_CREATE) ||
        projects.some((project) => project.role === "ADMIN")),
    hasTeamOrganizations: organizations.some((item) => !item.personal),
  };
};

export const selectWorkspaceMode = (state: RootState): WorkspaceMode =>
  workspaceModeFor(
    selectActiveOrganization(state),
    selectProjects(state),
    selectOrganizations(state),
  );

export const showsProjects = (mode: WorkspaceMode): boolean =>
  !mode.personal && mode.projectCount > 1;

export const useWorkspaceMode = (): WorkspaceMode =>
  useAppSelector(selectWorkspaceMode, shallowEqual);
