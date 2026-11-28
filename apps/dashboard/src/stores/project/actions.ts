import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  Environment,
  MovableKind,
  MoveResult,
  NewProject,
  ProjectChanges,
  ProjectMember,
  ProjectRole,
  ProjectSummary,
} from "./type";

export const projectPendingKeys = {
  create: "createProject",
  update: "updateProject",
  archive: "archiveProject",
  remove: "deleteProject",
  move: "moveResources",
  member: (userId: string) => `projectMember:${userId}`,
} as const;

export const fetchProjects = () => ({
  type: actionTypes.FETCH_PROJECTS_REQUESTED,
});

export const fetchProjectsPending = () => ({
  type: actionTypes.FETCH_PROJECTS_PENDING,
});

export const fetchProjectsSucceeded = (payload: {
  organizationId: string;
  items: ProjectSummary[];
  activeId: string | null;
  environment: Environment;
}) => ({
  type: actionTypes.FETCH_PROJECTS_SUCCEEDED,
  payload,
});

export const fetchProjectsFailed = (message: string) => ({
  type: actionTypes.FETCH_PROJECTS_FAILED,
  payload: { message },
});

export const switchProject = (id: string) => ({
  type: actionTypes.SWITCH_PROJECT_REQUESTED,
  payload: { id },
});

export const activeProjectSet = (id: string) => ({
  type: actionTypes.ACTIVE_PROJECT_SET,
  payload: { id },
});

export const switchEnvironment = (environment: Environment) => ({
  type: actionTypes.SWITCH_ENVIRONMENT_REQUESTED,
  payload: { environment },
});

export const environmentSet = (environment: Environment) => ({
  type: actionTypes.ENVIRONMENT_SET,
  payload: { environment },
});

export const createProject = (payload: NewProject) => ({
  type: actionTypes.CREATE_PROJECT_REQUESTED,
  payload,
  meta: { pendingKey: projectPendingKeys.create },
});

export const createProjectSucceeded = (
  project: ProjectSummary,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_PROJECT_SUCCEEDED,
  payload: project,
  meta,
});

export const updateProject = (payload: ProjectChanges) => ({
  type: actionTypes.UPDATE_PROJECT_REQUESTED,
  payload,
  meta: { pendingKey: projectPendingKeys.update },
});

export const updateProjectSucceeded = (
  project: ProjectSummary,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_PROJECT_SUCCEEDED,
  payload: project,
  meta,
});

export const archiveProject = (archived: boolean) => ({
  type: actionTypes.ARCHIVE_PROJECT_REQUESTED,
  payload: { archived },
  meta: { pendingKey: projectPendingKeys.archive },
});

export const archiveProjectSucceeded = (
  project: ProjectSummary,
  meta: PendingMeta,
) => ({
  type: actionTypes.ARCHIVE_PROJECT_SUCCEEDED,
  payload: project,
  meta,
});

export const deleteProject = () => ({
  type: actionTypes.DELETE_PROJECT_REQUESTED,
  meta: { pendingKey: projectPendingKeys.remove },
});

export const deleteProjectSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_PROJECT_SUCCEEDED,
  payload: { id },
  meta,
});

export const moveResources = (payload: {
  kind: MovableKind;
  ids: string[];
  targetProjectId: string;
}) => ({
  type: actionTypes.MOVE_RESOURCES_REQUESTED,
  payload,
  meta: { pendingKey: projectPendingKeys.move },
});

export const moveResourcesSucceeded = (
  kind: MovableKind,
  result: MoveResult,
  meta: PendingMeta,
) => ({
  type: actionTypes.MOVE_RESOURCES_SUCCEEDED,
  payload: { kind, ...result },
  meta,
});

export const fetchProjectMembers = () => ({
  type: actionTypes.FETCH_PROJECT_MEMBERS_REQUESTED,
});

export const fetchProjectMembersSucceeded = (members: ProjectMember[]) => ({
  type: actionTypes.FETCH_PROJECT_MEMBERS_SUCCEEDED,
  payload: members,
});

export const fetchProjectMembersFailed = (message: string) => ({
  type: actionTypes.FETCH_PROJECT_MEMBERS_FAILED,
  payload: { message },
});

export const setProjectMemberRole = (payload: {
  userId: string;
  role: ProjectRole | null;
}) => ({
  type: actionTypes.SET_PROJECT_MEMBER_ROLE_REQUESTED,
  payload,
  meta: { pendingKey: projectPendingKeys.member(payload.userId) },
});

export const setProjectMemberRoleSucceeded = (meta: PendingMeta) => ({
  type: actionTypes.SET_PROJECT_MEMBER_ROLE_SUCCEEDED,
  meta,
});

export const projectActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.PROJECT_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearProjectIssues = () => ({
  type: actionTypes.CLEAR_PROJECT_ISSUES,
});
