import * as api from "@api/project";
import i18n from "@i18n";
import { clearAgentSelection, fetchAgents } from "@stores/agent/actions";
import {
  clearApiListingSelection,
  fetchApiListings,
} from "@stores/apiListing/actions";
import organizationActionTypes from "@stores/organization/actionTypes";
import { resolveActiveId } from "@stores/organization/persist";
import { errorCode, failureMessage } from "@stores/organization/saga";
import { selectActiveOrganizationId } from "@stores/organization/selector";
import { resetSession } from "@stores/session";
import type { PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  activeProjectSet,
  archiveProjectSucceeded,
  createProjectSucceeded,
  deleteProjectSucceeded,
  environmentSet,
  fetchProjectMembers as fetchProjectMembersAction,
  fetchProjectMembersFailed,
  fetchProjectMembersSucceeded,
  fetchProjectsFailed,
  fetchProjectsPending,
  fetchProjectsSucceeded,
  moveResourcesSucceeded,
  projectActionFailed,
  setProjectMemberRoleSucceeded,
  updateProjectSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import {
  readActiveProjectId,
  readEnvironment,
  writeActiveProjectId,
  writeEnvironment,
} from "./persist";
import { selectProjectState } from "./selector";
import type {
  Environment,
  MovableKind,
  MoveResult,
  NewProject,
  ProjectChanges,
  ProjectMember,
  ProjectRole,
  ProjectState,
  ProjectSummary,
} from "./type";

export const KEPT_ON_PROJECT_SWITCH = [
  "user",
  "organization",
  "project",
] as const;

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const CODE_MESSAGES: Record<string, [string, string]> = {
  project_not_empty: [
    "store.project.notEmpty",
    "Move or delete everything in this project before deleting it.",
  ],
  default_project: [
    "store.project.defaultProject",
    "The default project can't be archived or deleted.",
  ],
  project_archived: [
    "store.project.archived",
    "This project is archived. Unarchive it to make changes.",
  ],
  production_restricted: [
    "store.project.productionRestricted",
    "Only project admins can change production in this project.",
  ],
};

const messageFor = (error: unknown, fallback: string): string => {
  const code = errorCode(error);
  const known = code ? CODE_MESSAGES[code] : undefined;
  return known ? t(...known) : failureMessage(error, fallback);
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const issues = toIssueMap(error);
  if (errorCode(error) === "slug_taken") {
    issues.slug = t("store.project.slugTaken", "That slug is already taken.");
  }
  const message = messageFor(error, fallback);
  yield put(projectActionFailed(message, issues, meta));
  if (Object.keys(issues).length === 0) {
    notifyError({
      title: t("store.project.failedTitle", "Something went wrong"),
      content: message,
    });
  }
}

function* enterProject(id: string): Generator {
  const { organizationId } = (yield select(selectProjectState)) as ProjectState;
  yield put(activeProjectSet(id));
  if (organizationId) {
    yield call(writeActiveProjectId, organizationId, id);
  }
  yield put(resetSession(KEPT_ON_PROJECT_SWITCH));
}

export function* fetchProjects(): Generator {
  const organizationId = (yield select(selectActiveOrganizationId)) as
    | string
    | null;
  if (!organizationId) {
    return;
  }
  const before = (yield select(selectProjectState)) as ProjectState;
  const sameOrganization = before.organizationId === organizationId;
  try {
    yield put(fetchProjectsPending());
    const { items } = (yield call(api.getProjects)) as {
      items: ProjectSummary[];
    };
    const activeId = resolveActiveId(
      [
        sameOrganization ? before.activeId : null,
        readActiveProjectId(organizationId),
      ],
      items,
      items.find((item) => item.isDefault)?.id ?? null,
    );
    yield call(writeActiveProjectId, organizationId, activeId);
    yield put(
      fetchProjectsSucceeded({
        organizationId,
        items,
        activeId,
        environment: readEnvironment(),
      }),
    );
    if (sameOrganization && before.activeId && activeId !== before.activeId) {
      yield put(resetSession(KEPT_ON_PROJECT_SWITCH));
    }
  } catch (error) {
    yield put(
      fetchProjectsFailed(
        toMessage(
          error,
          t("store.project.fetchFailed", "Couldn't load your projects."),
        ),
      ),
    );
  }
}

export function* switchProject(action: {
  type: string;
  payload: { id: string };
}): Generator {
  const { items, activeId } = (yield select(
    selectProjectState,
  )) as ProjectState;
  const { id } = action.payload;
  if (id === activeId || !items.some((item) => item.id === id)) {
    return;
  }
  yield* enterProject(id);
}

export function* switchEnvironment(action: {
  type: string;
  payload: { environment: Environment };
}): Generator {
  const { environment } = (yield select(selectProjectState)) as ProjectState;
  const next = action.payload.environment;
  if (next === environment) {
    return;
  }
  yield put(environmentSet(next));
  yield call(writeEnvironment, next);
  yield put(resetSession(KEPT_ON_PROJECT_SWITCH));
}

export function* createProject(action: {
  type: string;
  payload: NewProject;
  meta: PendingMeta;
}): Generator {
  try {
    const created = (yield call(() =>
      api.createProject(action.payload),
    )) as ProjectSummary;
    yield put(createProjectSucceeded(created, action.meta));
    notifySuccess({
      title: t("store.project.createdTitle", "Project created"),
      content: t(
        "store.project.createdBody",
        "You're now working in your new project.",
      ),
    });
    yield* enterProject(created.id);
  } catch (error) {
    yield* fail(
      error,
      t("store.project.createFailed", "Couldn't create the project."),
      action.meta,
    );
  }
}

export function* updateProject(action: {
  type: string;
  payload: ProjectChanges;
  meta: PendingMeta;
}): Generator {
  try {
    const updated = (yield call(() =>
      api.updateProject(action.payload),
    )) as ProjectSummary;
    yield put(updateProjectSucceeded(updated, action.meta));
    notifySuccess({
      title: t("store.project.updatedTitle", "Project updated"),
      content: t("store.project.updatedBody", "Your changes have been saved."),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.project.updateFailed", "Couldn't save the project."),
      action.meta,
    );
  }
}

export function* archiveProject(action: {
  type: string;
  payload: { archived: boolean };
  meta: PendingMeta;
}): Generator {
  try {
    const updated = (yield call(() =>
      api.archiveProject(action.payload.archived),
    )) as ProjectSummary;
    yield put(archiveProjectSucceeded(updated, action.meta));
  } catch (error) {
    yield* fail(
      error,
      t("store.project.archiveFailed", "Couldn't change the project."),
      action.meta,
    );
  }
}

export function* deleteProject(action: {
  type: string;
  meta: PendingMeta;
}): Generator {
  const { activeId, items } = (yield select(
    selectProjectState,
  )) as ProjectState;
  if (!activeId) {
    return;
  }
  try {
    yield call(api.deleteProject);
    yield put(deleteProjectSucceeded(activeId, action.meta));
    notifySuccess({
      title: t("store.project.deletedTitle", "Project deleted"),
      content: t(
        "store.project.deletedBody",
        "You're back in the default project.",
      ),
    });
    const fallback = items.find((item) => item.isDefault)?.id;
    if (fallback) {
      yield* enterProject(fallback);
    }
  } catch (error) {
    yield* fail(
      error,
      t("store.project.deleteFailed", "Couldn't delete the project."),
      action.meta,
    );
  }
}

const REFRESH_AFTER_MOVE: Partial<Record<MovableKind, { type: string }[]>> = {
  agent: [clearAgentSelection(), fetchAgents()],
  api_listing: [clearApiListingSelection(), fetchApiListings()],
};

export function* moveResources(action: {
  type: string;
  payload: { kind: MovableKind; ids: string[]; targetProjectId: string };
  meta: PendingMeta;
}): Generator {
  try {
    const result = (yield call(() =>
      api.moveResources(action.payload),
    )) as MoveResult;
    yield put(moveResourcesSucceeded(action.payload.kind, result, action.meta));
    for (const refresh of REFRESH_AFTER_MOVE[action.payload.kind] ?? []) {
      yield put(refresh);
    }
    notifySuccess({
      title: t("store.project.movedTitle", "Moved"),
      content: i18n.t("store.project.movedBody", {
        count: result.moved.length,
        defaultValue: "{{count}} moved to the other project.",
      }),
    });
  } catch (error) {
    yield* fail(
      error,
      t("store.project.moveFailed", "Couldn't move them."),
      action.meta,
    );
  }
}

export function* fetchProjectMembers(): Generator {
  try {
    const { items } = (yield call(api.getProjectMembers)) as {
      items: ProjectMember[];
    };
    yield put(fetchProjectMembersSucceeded(items));
  } catch (error) {
    yield put(
      fetchProjectMembersFailed(
        toMessage(
          error,
          t("store.project.membersFailed", "Couldn't load project members."),
        ),
      ),
    );
  }
}

export function* setProjectMemberRole(action: {
  type: string;
  payload: { userId: string; role: ProjectRole | null };
  meta: PendingMeta;
}): Generator {
  const { userId, role } = action.payload;
  try {
    if (role) {
      yield call(() => api.setProjectMemberRole(userId, role));
    } else {
      yield call(() => api.removeProjectMember(userId));
    }
    yield put(setProjectMemberRoleSucceeded(action.meta));
    yield put(fetchProjectMembersAction());
  } catch (error) {
    yield* fail(
      error,
      t("store.project.roleFailed", "Couldn't change the role."),
      action.meta,
    );
  }
}

export default [
  takeLatest(
    [
      organizationActionTypes.FETCH_ORGANIZATIONS_SUCCEEDED,
      organizationActionTypes.ACTIVE_ORGANIZATION_SET,
      actionTypes.FETCH_PROJECTS_REQUESTED,
    ],
    fetchProjects,
  ),
  takeLatest(actionTypes.SWITCH_PROJECT_REQUESTED, switchProject),
  takeLatest(actionTypes.SWITCH_ENVIRONMENT_REQUESTED, switchEnvironment),
  takeEvery(actionTypes.CREATE_PROJECT_REQUESTED, createProject),
  takeEvery(actionTypes.UPDATE_PROJECT_REQUESTED, updateProject),
  takeLatest(actionTypes.ARCHIVE_PROJECT_REQUESTED, archiveProject),
  takeLatest(actionTypes.DELETE_PROJECT_REQUESTED, deleteProject),
  takeLatest(actionTypes.MOVE_RESOURCES_REQUESTED, moveResources),
  takeLatest(actionTypes.FETCH_PROJECT_MEMBERS_REQUESTED, fetchProjectMembers),
  takeEvery(
    actionTypes.SET_PROJECT_MEMBER_ROLE_REQUESTED,
    setProjectMemberRole,
  ),
];
