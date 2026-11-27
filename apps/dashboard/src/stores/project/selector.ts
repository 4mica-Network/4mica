import type { RootState } from "@stores/index";
import { selectActiveOrganizationId } from "@stores/organization/selector";
import { INITIAL_STATE } from "./reducer";
import {
  type Environment,
  environmentKind,
  type ProjectMember,
  type ProjectPermission,
  type ProjectState,
  type ProjectSummary,
} from "./type";

export const selectProjectState = (state: RootState): ProjectState =>
  state.project ?? INITIAL_STATE;

export const selectProjects = (state: RootState): ProjectSummary[] =>
  selectProjectState(state).items;

export const selectActiveProjectId = (state: RootState): string | null =>
  selectProjectState(state).activeId;

export const selectActiveProject = (
  state: RootState,
): ProjectSummary | null => {
  const { items, activeId } = selectProjectState(state);
  return items.find((item) => item.id === activeId) ?? null;
};

export const selectEnvironment = (state: RootState): Environment =>
  selectProjectState(state).environment;

export const projectAllows = (
  project: ProjectSummary | null,
  environment: Environment,
  permission: ProjectPermission,
): boolean =>
  project
    ? project.permissions[environmentKind(environment)].includes(permission)
    : true;

export const selectProjectCan =
  (permission: ProjectPermission) =>
  (state: RootState): boolean =>
    projectAllows(
      selectActiveProject(state),
      selectEnvironment(state),
      permission,
    );

export const selectHasResolvedProjects = (state: RootState): boolean => {
  const { status } = selectProjectState(state);
  return status === "loaded" || status === "failed";
};

export const selectIsProjectPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(selectProjectState(state).pending[key]);

export const selectProjectIssues = (state: RootState): Record<string, string> =>
  selectProjectState(state).issues;

export const selectProjectError = (state: RootState): string | null =>
  selectProjectState(state).error;

export const selectProjectMembers = (state: RootState): ProjectMember[] =>
  selectProjectState(state).members;

export const selectProjectMembersStatus = (state: RootState) =>
  selectProjectState(state).membersStatus;

export const selectProjectMembersError = (state: RootState) =>
  selectProjectState(state).membersError;

export const projectHeaders = (
  state: RootState,
): Record<string, string> | null => {
  const organizationId = selectActiveOrganizationId(state);
  if (!organizationId) {
    return null;
  }
  const {
    organizationId: loadedFor,
    activeId,
    environment,
  } = selectProjectState(state);
  return {
    "X-Org-Id": organizationId,
    ...(activeId && loadedFor === organizationId
      ? { "X-Project-Id": activeId }
      : {}),
    "X-Environment": environment,
  };
};
